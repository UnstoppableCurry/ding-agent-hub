import Docker from 'dockerode';
import { getDb } from '../db/init.js';
import config from '../config.js';

const CONTAINER_NAME = config.openclawContainer;
const CONFIG_PATH = config.openclawConfigPath;

async function execInContainer(script) {
  const docker = new Docker({ socketPath: config.dockerSocket });
  const container = docker.getContainer(CONTAINER_NAME);
  const exec = await container.exec({
    Cmd: ['node', '-e', script],
    AttachStdout: true,
    AttachStderr: true,
    User: 'claworc',
  });
  const stream = await exec.start();

  return new Promise((resolve, reject) => {
    let output = '';
    stream.on('data', (chunk) => { output += chunk.toString(); });
    stream.on('end', () => {
      // Docker exec stream has 8-byte header per frame, strip control chars
      const clean = output.replace(/[\x00-\x08\x0e-\x1f]/g, '').trim();
      resolve(clean);
    });
    stream.on('error', reject);
  });
}

export async function syncAllowList() {
  const db = getDb();
  const activeUsers = db.prepare("SELECT dingtalk_id FROM users WHERE is_active = 1").all();
  const allowFrom = activeUsers.map(u => u.dingtalk_id);

  // When no active users, use a dummy ID to block everyone
  // (empty allowFrom = no restriction in the DingTalk plugin)
  if (allowFrom.length === 0) allowFrom.push('__none__');

  let result = 'success';
  let errorMessage = null;

  try {
    const allowJson = JSON.stringify(allowFrom);
    const dmPolicy = 'allowlist';

    const script = `
      const fs = require('fs');
      const cfg = JSON.parse(fs.readFileSync('${CONFIG_PATH}', 'utf8'));
      if (!cfg.channels) cfg.channels = {};
      if (!cfg.channels.dingtalk) cfg.channels.dingtalk = {};
      cfg.channels.dingtalk.allowFrom = ${allowJson};
      cfg.channels.dingtalk.dmPolicy = '${dmPolicy}';
      fs.writeFileSync('${CONFIG_PATH}', JSON.stringify(cfg, null, 2));
      console.log(JSON.stringify({ ok: true, count: ${allowFrom.length} }));
    `;

    const output = await execInContainer(script);
    if (!output.includes('"ok":true')) {
      throw new Error(`Unexpected output: ${output}`);
    }
  } catch (e) {
    result = 'error';
    errorMessage = e.message;
    console.error('OpenClaw sync failed:', e.message);
  }

  db.prepare(
    'INSERT INTO sync_log (target, action, payload, result, error_message) VALUES (?, ?, ?, ?, ?)'
  ).run('openclaw', 'update_allowlist', JSON.stringify({ count: allowFrom.length, allowFrom }), result, errorMessage);

  return { result, count: allowFrom.length, errorMessage };
}

export async function getOpenClawConfig() {
  const script = `
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('${CONFIG_PATH}', 'utf8'));
    console.log(JSON.stringify(cfg.channels?.dingtalk || {}));
  `;
  const output = await execInContainer(script);
  try {
    return JSON.parse(output.substring(output.indexOf('{')));
  } catch {
    return { error: output };
  }
}

// --- Multi-Agent Isolation ---

const WORKSPACES_BASE = config.openclawWorkspacesPath;
const WORKSPACES_BACKUP = config.openclawWorkspacesBackupPath;

// Simple mutex to prevent concurrent syncAgents calls
let syncLock = Promise.resolve();

function parseJsonFromOutput(output) {
  const start = output.indexOf('{');
  if (start === -1) throw new Error(`No JSON in output: ${output}`);
  return JSON.parse(output.substring(start));
}

export async function getOpenClawAgents() {
  const script = `
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('${CONFIG_PATH}', 'utf8'));
    console.log(JSON.stringify({
      agents: cfg.agents && cfg.agents.list ? cfg.agents.list : [],
      bindings: cfg.bindings || [],
      dmScope: cfg.session && cfg.session.dmScope ? cfg.session.dmScope : 'per-peer'
    }));
  `;
  const output = await execInContainer(script);
  return parseJsonFromOutput(output);
}

export async function syncAgents() {
  // Acquire mutex
  const previous = syncLock;
  let releaseMutex;
  syncLock = new Promise(r => { releaseMutex = r; });
  await previous;

  const db = getDb();
  let result = 'success';
  let errorMessage = null;
  let agentCount = 0;
  let added = [];
  let removed = [];

  try {
    // 1. Get all active users
    const activeUsers = db.prepare(
      "SELECT id, name, dingtalk_id FROM users WHERE is_active = 1 AND dingtalk_id IS NOT NULL"
    ).all();

    // 2. Build agents list and bindings
    const agentsList = activeUsers.map(u => ({
      id: `user-${u.dingtalk_id}`,
      workspace: `${WORKSPACES_BASE}/${u.dingtalk_id}`
    }));

    const bindingsList = activeUsers.map(u => ({
      agentId: `user-${u.dingtalk_id}`,
      match: {
        channel: 'dingtalk',
        peer: { kind: 'direct', id: u.dingtalk_id }
      }
    }));

    agentCount = agentsList.length;

    // 3. Get current state to detect new and removed agents
    let currentAgentIds = [];
    try {
      const current = await getOpenClawAgents();
      currentAgentIds = current.agents.map(a => a.id);
    } catch { /* first time, no agents yet */ }

    const newAgentIds = new Set(agentsList.map(a => a.id));
    const oldAgentIds = new Set(currentAgentIds);

    const newUsers = activeUsers.filter(u => !oldAgentIds.has(`user-${u.dingtalk_id}`));
    added = newUsers.map(u => ({ name: u.name, id: `user-${u.dingtalk_id}` }));

    // Detect removed agents: were in old config but not in new
    const removedAgentIdSet = currentAgentIds.filter(id => !newAgentIds.has(id));
    if (removedAgentIdSet.length > 0) {
      // Look up names from all users (including inactive) by dingtalk_id
      const allUsers = db.prepare("SELECT name, dingtalk_id FROM users WHERE dingtalk_id IS NOT NULL").all();
      const dingtalkToName = Object.fromEntries(allUsers.map(u => [`user-${u.dingtalk_id}`, u.name]));
      removed = removedAgentIdSet.map(id => ({ name: dingtalkToName[id] || 'unknown', id }));
    }

    // 4. Write config: agents.list + bindings + session.dmScope
    const agentsJson = JSON.stringify(agentsList);
    const bindingsJson = JSON.stringify(bindingsList);

    const configScript = `
      const fs = require('fs');
      const cfg = JSON.parse(fs.readFileSync('${CONFIG_PATH}', 'utf8'));

      if (!cfg.session) cfg.session = {};
      cfg.session.dmScope = 'per-channel-peer';

      if (!cfg.agents) cfg.agents = {};
      cfg.agents.list = ${agentsJson};

      cfg.bindings = ${bindingsJson};

      fs.writeFileSync('${CONFIG_PATH}', JSON.stringify(cfg, null, 2));
      console.log(JSON.stringify({ ok: true, agents: ${agentCount}, bindings: ${agentCount} }));
    `;

    const configOutput = await execInContainer(configScript);
    if (!configOutput.includes('"ok":true')) {
      throw new Error(`Config write failed: ${configOutput}`);
    }

    // 5a. Restore workspaces from backup for re-enabled users
    if (newUsers.length > 0) {
      const restoreDirs = newUsers.map(u => u.dingtalk_id);
      const restoreJson = JSON.stringify(restoreDirs);
      const restoreScript = `
        const fs = require('fs');
        const path = require('path');
        const ids = ${restoreJson};
        let restored = 0;
        ids.forEach(function(id) {
          var backup = '${WORKSPACES_BACKUP}/' + id;
          var target = '${WORKSPACES_BASE}/' + id;
          if (fs.existsSync(backup) && !fs.existsSync(target)) {
            fs.renameSync(backup, target);
            restored++;
          }
        });
        console.log(JSON.stringify({ ok: true, restored: restored }));
      `;
      try {
        const restoreOutput = await execInContainer(restoreScript);
        if (restoreOutput.includes('"restored"')) {
          const parsed = parseJsonFromOutput(restoreOutput);
          if (parsed.restored > 0) console.log(`Restored ${parsed.restored} workspace(s) from backup`);
        }
      } catch (e) { console.warn('Workspace restore warning:', e.message); }
    }

    // 5b. Create workspace directories + all workspace files for new agents
    if (newUsers.length > 0) {
      const dirs = newUsers.map(u => `${WORKSPACES_BASE}/${u.dingtalk_id}`);
      const names = newUsers.map(u => u.name);
      const dirsJson = JSON.stringify(dirs);
      const namesJson = JSON.stringify(names);

      const mkdirScript = `
        const fs = require('fs');
        const path = require('path');
        const dirs = ${dirsJson};
        const names = ${namesJson};
        function writeIfMissing(filePath, content) {
          if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content);
        }
        dirs.forEach(function(dir, i) {
          fs.mkdirSync(dir, { recursive: true });
          writeIfMissing(path.join(dir, 'AGENTS.md'), '# AGENTS.md\\n\\n你是一个AI助手，运行在OpenClaw平台上。\\n\\n## 规则\\n- 不要泄露任何个人隐私信息\\n- 不要读取其他用户的工作空间\\n- 友好、有帮助地回答问题\\n- 使用中文回答\\n\\n## 工具\\n可以使用搜索、天气等内置技能。\\n');
          writeIfMissing(path.join(dir, 'BOOTSTRAP.md'), '# 欢迎\\n\\n这是你的专属AI助手工作空间。你可以直接开始对话。\\n');
          writeIfMissing(path.join(dir, 'HEARTBEAT.md'), '# HEARTBEAT.md\\n\\n# 心跳检查为空时不执行任何操作。\\n# 如需定期检查，在下方添加任务。\\n');
          writeIfMissing(path.join(dir, 'IDENTITY.md'), '# IDENTITY.md\\n\\n- **名称:** AI助手\\n- **类型:** AI\\n- **风格:** 专业、友好\\n- **Emoji:** 🤖\\n');
          writeIfMissing(path.join(dir, 'SOUL.md'), '# SOUL.md\\n\\n你是YourCompany的AI助手，为 ' + names[i] + ' 服务。简洁、专业、有帮助。\\n');
          writeIfMissing(path.join(dir, 'TOOLS.md'), '# TOOLS.md - 工具配置\\n\\n在这里添加你的环境特定信息。\\n');
          writeIfMissing(path.join(dir, 'USER.md'), '# USER.md\\n\\n- **姓名:** ' + names[i] + '\\n- **备注:**\\n');
        });
        console.log(JSON.stringify({ ok: true, created: dirs.length }));
      `;

      const mkdirOutput = await execInContainer(mkdirScript);
      if (!mkdirOutput.includes('"ok":true')) {
        console.warn('Workspace creation warning:', mkdirOutput);
      }
    }

    // 5c. Backup workspaces for removed/disabled agents
    if (removedAgentIdSet.length > 0) {
      const removeDingtalkIds = removedAgentIdSet.map(id => id.replace('user-', ''));
      const removeJson = JSON.stringify(removeDingtalkIds);
      const backupScript = `
        const fs = require('fs');
        const ids = ${removeJson};
        fs.mkdirSync('${WORKSPACES_BACKUP}', { recursive: true });
        let backed = 0;
        ids.forEach(function(id) {
          var src = '${WORKSPACES_BASE}/' + id;
          var dst = '${WORKSPACES_BACKUP}/' + id;
          if (fs.existsSync(src)) {
            if (fs.existsSync(dst)) {
              fs.rmSync(dst, { recursive: true, force: true });
            }
            fs.renameSync(src, dst);
            backed++;
          }
        });
        console.log(JSON.stringify({ ok: true, backed: backed }));
      `;
      try {
        const backupOutput = await execInContainer(backupScript);
        if (backupOutput.includes('"backed"')) {
          const parsed = parseJsonFromOutput(backupOutput);
          if (parsed.backed > 0) console.log(`Backed up ${parsed.backed} workspace(s)`);
        }
      } catch (e) { console.warn('Workspace backup warning:', e.message); }
    }

    // 6. Update agent_sync_state table
    const upsertStmt = db.prepare(`
      INSERT INTO agent_sync_state (user_id, agent_id, workspace_path, is_bound, last_synced_at)
      VALUES (?, ?, ?, 1, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        agent_id = excluded.agent_id,
        workspace_path = excluded.workspace_path,
        is_bound = 1,
        last_synced_at = datetime('now'),
        error_message = NULL
    `);

    const clearStmt = db.prepare(`
      DELETE FROM agent_sync_state WHERE user_id NOT IN (
        SELECT id FROM users WHERE is_active = 1 AND dingtalk_id IS NOT NULL
      )
    `);

    db.transaction(() => {
      for (const u of activeUsers) {
        upsertStmt.run(u.id, `user-${u.dingtalk_id}`, `${WORKSPACES_BASE}/${u.dingtalk_id}`);
      }
      clearStmt.run();
    })();

  } catch (e) {
    result = 'error';
    errorMessage = e.message;
    console.error('Agent sync failed:', e.message);
  } finally {
    releaseMutex();
  }

  // 7. Log sync operation
  db.prepare(
    'INSERT INTO sync_log (target, action, payload, result, error_message) VALUES (?, ?, ?, ?, ?)'
  ).run('openclaw', 'sync_agents', JSON.stringify({ agentCount }), result, errorMessage);

  return { result, agentCount, added, removed, errorMessage };
}

// --- DingTalk AI Card Streaming ---

export async function updateStreamingCardConfig(templateId) {
  if (!/^[\w-]+\.?[\w-]*$/.test(templateId)) {
    throw new Error('Invalid templateId format');
  }

  const db = getDb();
  let result = 'success';
  let errorMessage = null;

  try {
    const script = `
      const fs = require('fs');
      const cfg = JSON.parse(fs.readFileSync('${CONFIG_PATH}', 'utf8'));
      if (!cfg.channels) cfg.channels = {};
      if (!cfg.channels.dingtalk) cfg.channels.dingtalk = {};
      cfg.channels.dingtalk.aiCardMode = {
        enabled: true,
        templateId: '${templateId}',
        cardTemplateKey: 'content',
        callbackType: 'STREAM',
        updateThrottleMs: 800,
        fallbackReplyMode: 'markdown',
        blockStreaming: true
      };
      fs.writeFileSync('${CONFIG_PATH}', JSON.stringify(cfg, null, 2));
      console.log(JSON.stringify({ ok: true }));
    `;

    const output = await execInContainer(script);
    if (!output.includes('"ok":true')) {
      throw new Error(`Streaming card config failed: ${output}`);
    }
  } catch (e) {
    result = 'error';
    errorMessage = e.message;
    console.error('Streaming card config failed:', e.message);
  }

  db.prepare(
    'INSERT INTO sync_log (target, action, payload, result, error_message) VALUES (?, ?, ?, ?, ?)'
  ).run('openclaw', 'update_streaming_card', JSON.stringify({ templateId }), result, errorMessage);

  return { result, errorMessage };
}
