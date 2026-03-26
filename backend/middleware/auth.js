import jwt from 'jsonwebtoken';
import config from '../config.js';

export async function authMiddleware(request, reply) {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  try {
    const token = auth.slice(7);
    request.user = jwt.verify(token, config.jwtSecret);
  } catch {
    return reply.code(401).send({ error: 'Invalid token' });
  }
}
