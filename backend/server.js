import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { getDb } from './db/init.js';
import { authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import departmentRoutes from './routes/departments.js';
import workspaceRoutes from './routes/workspaces.js';
import statusRoutes from './routes/status.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// Plugins
await app.register(fastifyCors, { origin: true });
await app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });

// Auth decorator
app.decorate('auth', authMiddleware);

// Initialize database
getDb();

// API routes
await app.register(authRoutes);
await app.register(userRoutes);
await app.register(departmentRoutes);
await app.register(workspaceRoutes);
await app.register(statusRoutes);

// Serve frontend static files
const publicDir = join(__dirname, 'public');
await app.register(fastifyStatic, { root: publicDir, prefix: '/' });

// SPA fallback - serve index.html for non-API routes
app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Not found' });
  }
  return reply.sendFile('index.html');
});

// Start
try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`Admin panel running at http://${config.host}:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
