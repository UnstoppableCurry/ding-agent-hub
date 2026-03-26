import { getDb } from '../db/init.js';
import { getContainerStatuses } from '../services/docker-status.js';
import { updateStreamingCardConfig, getOpenClawConfig } from '../services/openclaw-sync.js';

export default async function statusRoutes(fastify) {
  fastify.get('/api/status', { preHandler: fastify.auth }, async () => {
    const db = getDb();

    const stats = {
      totalUsers: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
      activeUsers: db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get().c,
      departments: db.prepare('SELECT COUNT(*) as c FROM departments').get().c,
      workspaces: db.prepare('SELECT COUNT(*) as c FROM departments WHERE workspace_id IS NOT NULL').get().c,
    };

    let services = {};
    try {
      services = await getContainerStatuses();
    } catch (e) {
      services = { error: e.message };
    }

    const recentLogs = db.prepare(
      'SELECT * FROM sync_log ORDER BY id DESC LIMIT 20'
    ).all();

    return { stats, services, recentLogs };
  });

  fastify.get('/api/sync-logs', { preHandler: fastify.auth }, async (request) => {
    const { page = 1, pageSize = 50 } = request.query;
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) as c FROM sync_log').get().c;
    const offset = (page - 1) * pageSize;
    const data = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT ? OFFSET ?').all(pageSize, offset);
    return { data, total };
  });

  // Streaming card config
  fastify.post('/api/config/streaming-card', { preHandler: fastify.auth }, async (request, reply) => {
    const { templateId } = request.body || {};
    if (!templateId) return reply.code(400).send({ error: 'templateId required' });
    const result = await updateStreamingCardConfig(templateId);
    return result;
  });

  fastify.get('/api/config/streaming-card', { preHandler: fastify.auth }, async () => {
    const cfg = await getOpenClawConfig();
    return { aiCardMode: cfg.aiCardMode || null };
  });
}
