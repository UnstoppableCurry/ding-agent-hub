import { getDb } from '../db/init.js';

export default async function workspaceRoutes(fastify) {
  // List workspaces with user access info
  fastify.get('/api/workspaces', { preHandler: fastify.auth }, async () => {
    const db = getDb();
    const depts = db.prepare('SELECT * FROM departments WHERE workspace_id IS NOT NULL ORDER BY id').all();

    const result = depts.map(dept => {
      const users = db.prepare(`
        SELECT u.id, u.name, u.dingtalk_id, u.role
        FROM user_workspace_access uwa
        JOIN users u ON u.id = uwa.user_id
        WHERE uwa.workspace_id = ? AND u.is_active = 1
      `).all(dept.workspace_id);

      return {
        department_id: dept.id,
        department_name: dept.name,
        workspace_id: dept.workspace_id,
        workspace_slug: dept.workspace_slug,
        authorized_users: users,
      };
    });

    return { data: result };
  });

  // Set authorized users for a workspace
  fastify.put('/api/workspaces/:departmentId/users', { preHandler: fastify.auth }, async (request, reply) => {
    const { userIds } = request.body || {};
    if (!Array.isArray(userIds)) return reply.code(400).send({ error: 'userIds array required' });

    const db = getDb();
    const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(request.params.departmentId);
    if (!dept?.workspace_id) return reply.code(404).send({ error: 'Department or workspace not found' });

    const tx = db.transaction(() => {
      // Remove existing access for this workspace
      db.prepare('DELETE FROM user_workspace_access WHERE workspace_id = ?').run(dept.workspace_id);
      // Add new access
      const insert = db.prepare('INSERT INTO user_workspace_access (user_id, workspace_id) VALUES (?, ?)');
      for (const uid of userIds) {
        insert.run(uid, dept.workspace_id);
      }
      // Also add all leaders
      const leaders = db.prepare("SELECT id FROM users WHERE role = 'leader' AND is_active = 1").all();
      for (const leader of leaders) {
        db.prepare('INSERT OR IGNORE INTO user_workspace_access (user_id, workspace_id) VALUES (?, ?)').run(leader.id, dept.workspace_id);
      }
    });
    tx();

    return { ok: true };
  });
}
