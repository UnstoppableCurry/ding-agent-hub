import { getDb } from '../db/init.js';
import { syncAllowList, syncAgents } from '../services/openclaw-sync.js';

export default async function userRoutes(fastify) {
  // List users
  fastify.get('/api/users', { preHandler: fastify.auth }, async (request) => {
    const { department_id, search, page = 1, pageSize = 20 } = request.query;
    const db = getDb();
    let where = 'WHERE 1=1';
    const params = [];

    if (department_id) { where += ' AND u.department_id = ?'; params.push(department_id); }
    if (search) { where += ' AND (u.name LIKE ? OR u.dingtalk_id LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const total = db.prepare(`SELECT COUNT(*) as count FROM users u ${where}`).get(...params).count;
    const offset = (page - 1) * pageSize;
    const rows = db.prepare(`
      SELECT u.*, d.name as department_name, a.agent_id, a.is_bound, a.last_synced_at as agent_synced_at
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN agent_sync_state a ON u.id = a.user_id
      ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return { data: rows, total, page: +page, pageSize: +pageSize };
  });

  // Create user
  fastify.post('/api/users', { preHandler: fastify.auth }, async (request, reply) => {
    const { name, dingtalk_id, department_id, role } = request.body || {};
    if (!name || !dingtalk_id) return reply.code(400).send({ error: 'name and dingtalk_id required' });

    const db = getDb();
    try {
      const result = db.prepare(
        'INSERT INTO users (name, dingtalk_id, department_id, role) VALUES (?, ?, ?, ?)'
      ).run(name, dingtalk_id, department_id || null, role || 'member');

      await syncAllowList();
      await syncAgents();

      // Auto-grant department workspace access
      if (department_id) {
        const dept = db.prepare('SELECT workspace_id FROM departments WHERE id = ?').get(department_id);
        if (dept?.workspace_id) {
          db.prepare('INSERT OR IGNORE INTO user_workspace_access (user_id, workspace_id) VALUES (?, ?)').run(result.lastInsertRowid, dept.workspace_id);
        }
      }

      // Leader gets all workspaces
      if (role === 'leader') {
        const allWs = db.prepare('SELECT workspace_id FROM departments WHERE workspace_id IS NOT NULL').all();
        for (const ws of allWs) {
          db.prepare('INSERT OR IGNORE INTO user_workspace_access (user_id, workspace_id) VALUES (?, ?)').run(result.lastInsertRowid, ws.workspace_id);
        }
      }

      return { id: result.lastInsertRowid };
    } catch (e) {
      if (e.message.includes('UNIQUE')) return reply.code(409).send({ error: 'dingtalk_id already exists' });
      throw e;
    }
  });

  // Update user
  fastify.put('/api/users/:id', { preHandler: fastify.auth }, async (request, reply) => {
    const { name, dingtalk_id, department_id, role, is_active } = request.body || {};
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(request.params.id);
    if (!user) return reply.code(404).send({ error: 'User not found' });

    db.prepare(`
      UPDATE users SET name = ?, dingtalk_id = ?, department_id = ?, role = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?
    `).run(
      name ?? user.name, dingtalk_id ?? user.dingtalk_id,
      department_id !== undefined ? department_id : user.department_id,
      role ?? user.role, is_active !== undefined ? is_active : user.is_active,
      request.params.id
    );

    const allowResult = await syncAllowList();
    const agentResult = await syncAgents();
    const statusChanged = (is_active !== undefined && is_active !== user.is_active);
    return {
      ok: true,
      allowList: allowResult,
      agents: agentResult,
      statusChanged,
      newStatus: is_active !== undefined ? is_active : user.is_active
    };
  });

  // Delete user
  fastify.delete('/api/users/:id', { preHandler: fastify.auth }, async (request, reply) => {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(request.params.id);
    if (!user) return reply.code(404).send({ error: 'User not found' });

    db.prepare('DELETE FROM users WHERE id = ?').run(request.params.id);
    await syncAllowList();
    await syncAgents();
    return { ok: true };
  });

  // Batch import (users imported as inactive by default)
  fastify.post('/api/users/import', { preHandler: fastify.auth }, async (request, reply) => {
    const { users: importList, auto_active } = request.body || {};
    if (!Array.isArray(importList) || importList.length === 0) {
      return reply.code(400).send({ error: 'No users to import' });
    }

    const db = getDb();
    const defaultActive = auto_active ? 1 : 0;
    const insertUserStmt = db.prepare(
      'INSERT OR IGNORE INTO users (name, dingtalk_id, department_id, role, is_active) VALUES (?, ?, ?, ?, ?)'
    );
    const insertDeptStmt = db.prepare(
      'INSERT OR IGNORE INTO departments (name) VALUES (?)'
    );

    let imported = 0;
    let skipped = 0;
    let deptsCreated = 0;

    const tx = db.transaction(() => {
      for (const u of importList) {
        if (!u.name || !u.dingtalk_id) { skipped++; continue; }
        let deptId = null;
        if (u.department) {
          let dept = db.prepare('SELECT id FROM departments WHERE name = ?').get(u.department);
          if (!dept) {
            const r = insertDeptStmt.run(u.department);
            if (r.changes > 0) { deptsCreated++; deptId = r.lastInsertRowid; }
            else { dept = db.prepare('SELECT id FROM departments WHERE name = ?').get(u.department); deptId = dept?.id; }
          } else {
            deptId = dept.id;
          }
        }
        const r = insertUserStmt.run(u.name, u.dingtalk_id, deptId, u.role || 'member', defaultActive);
        if (r.changes > 0) imported++; else skipped++;
      }
    });
    tx();

    await syncAllowList();
    await syncAgents();
    return { imported, skipped, deptsCreated, total: importList.length };
  });

  // Batch update users
  fastify.post('/api/users/batch-update', { preHandler: fastify.auth }, async (request, reply) => {
    const { ids, is_active } = request.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: 'ids required' });
    if (is_active !== 0 && is_active !== 1) return reply.code(400).send({ error: 'is_active must be 0 or 1' });

    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`).run(is_active, ...ids);

    const allowResult = await syncAllowList();
    const agentResult = await syncAgents();
    return { ok: true, updated: ids.length, allowList: allowResult, agents: agentResult };
  });

  // Sync all to OpenClaw
  fastify.post('/api/users/sync', { preHandler: fastify.auth }, async () => {
    const allowResult = await syncAllowList();
    const agentResult = await syncAgents();
    return { ok: true, allowList: allowResult, agents: agentResult };
  });

  // Get agent state for a user
  fastify.get('/api/users/:id/agent', { preHandler: fastify.auth }, async (request, reply) => {
    const db = getDb();
    const state = db.prepare('SELECT * FROM agent_sync_state WHERE user_id = ?').get(request.params.id);
    if (!state) return reply.code(404).send({ error: 'No agent state' });
    return state;
  });
}
