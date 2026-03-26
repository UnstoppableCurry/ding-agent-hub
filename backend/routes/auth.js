import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/init.js';
import config from '../config.js';

export default async function authRoutes(fastify) {
  fastify.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body || {};
    if (!username || !password) return reply.code(400).send({ error: 'Missing credentials' });

    const admin = getDb().prepare('SELECT * FROM admin_auth WHERE id = 1').get();
    if (!admin || admin.username !== username || !bcrypt.compareSync(password, admin.password_hash)) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: 1, username }, config.jwtSecret, { expiresIn: '7d' });
    return { token, username };
  });

  fastify.get('/api/auth/me', { preHandler: fastify.auth }, async (request) => {
    return { username: request.user.username };
  });

  fastify.post('/api/auth/change-password', { preHandler: fastify.auth }, async (request, reply) => {
    const { oldPassword, newPassword } = request.body || {};
    if (!oldPassword || !newPassword) return reply.code(400).send({ error: 'Missing fields' });

    const admin = getDb().prepare('SELECT * FROM admin_auth WHERE id = 1').get();
    if (!bcrypt.compareSync(oldPassword, admin.password_hash)) {
      return reply.code(400).send({ error: 'Wrong current password' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    getDb().prepare('UPDATE admin_auth SET password_hash = ? WHERE id = 1').run(hash);
    return { ok: true };
  });
}
