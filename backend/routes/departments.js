import { getDb } from '../db/init.js';
import { createWorkspace } from '../services/anythingllm.js';

export default async function departmentRoutes(fastify) {
  // List departments
  fastify.get('/api/departments', { preHandler: fastify.auth }, async () => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT d.*, COUNT(u.id) as user_count
      FROM departments d LEFT JOIN users u ON u.department_id = d.id AND u.is_active = 1
      GROUP BY d.id ORDER BY d.id
    `).all();
    return { data: rows };
  });

  // Create department
  fastify.post('/api/departments', { preHandler: fastify.auth }, async (request, reply) => {
    const { name } = request.body || {};
    if (!name) return reply.code(400).send({ error: 'name required' });

    const db = getDb();
    try {
      const result = db.prepare('INSERT INTO departments (name) VALUES (?)').run(name);

      // Try to create AnythingLLM workspace
      try {
        const ws = await createWorkspace(name);
        if (ws?.workspace) {
          db.prepare('UPDATE departments SET workspace_slug = ?, workspace_id = ? WHERE id = ?')
            .run(ws.workspace.slug, ws.workspace.id, result.lastInsertRowid);
        }
      } catch (e) {
        // Workspace creation failed, but department is created locally
        console.error('AnythingLLM workspace creation failed:', e.message);
      }

      return { id: result.lastInsertRowid };
    } catch (e) {
      if (e.message.includes('UNIQUE')) return reply.code(409).send({ error: 'Department name already exists' });
      throw e;
    }
  });

  // Update department
  fastify.put('/api/departments/:id', { preHandler: fastify.auth }, async (request, reply) => {
    const { name } = request.body || {};
    const db = getDb();
    const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(request.params.id);
    if (!dept) return reply.code(404).send({ error: 'Department not found' });

    db.prepare("UPDATE departments SET name = ?, updated_at = datetime('now') WHERE id = ?")
      .run(name ?? dept.name, request.params.id);
    return { ok: true };
  });

  // Delete department
  fastify.delete('/api/departments/:id', { preHandler: fastify.auth }, async (request, reply) => {
    const db = getDb();
    const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(request.params.id);
    if (!dept) return reply.code(404).send({ error: 'Department not found' });

    const userCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE department_id = ?').get(request.params.id).c;
    if (userCount > 0) return reply.code(400).send({ error: `Department has ${userCount} users, reassign them first` });

    db.prepare('DELETE FROM departments WHERE id = ?').run(request.params.id);
    return { ok: true };
  });
}
