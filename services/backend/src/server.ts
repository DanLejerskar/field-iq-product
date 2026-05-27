/** Fastify server bootstrap: health, error handling, routes, and the mock verifier. */
import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { config, loadEnv } from './config/env.js';
import { getDb } from './db/client.js';
import { AppError } from './errors.js';
import { getRedis } from './services/bus.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerContentRoutes } from './routes/content.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { startMockVerifier } from './workers/mock-verifier.js';

export async function buildServer(): Promise<FastifyInstance> {
  loadEnv();
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 15 * 1024 * 1024, // 15 MB — room for base64 photos
  });

  await app.register(cors, { origin: true });

  app.setErrorHandler((error: FastifyError, _req, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).type('application/problem+json').send(error.toProblem());
    }
    app.log.error(error);
    return reply
      .code(error.statusCode ?? 500)
      .type('application/problem+json')
      .send({
        type: 'https://field-iq.eonreality.com/errors/internal',
        title: 'Internal Server Error',
        status: error.statusCode ?? 500,
        code: 'internal',
      });
  });

  app.get('/health', async () => {
    const health = { ok: true, db: false, redis: false };
    const withTimeout = <T>(p: Promise<T>, ms = 2000): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
      ]);
    try {
      await withTimeout(getDb().execute(sql`select 1`));
      health.db = true;
    } catch {
      health.ok = false;
    }
    try {
      await withTimeout(getRedis().ping());
      health.redis = true;
    } catch {
      health.ok = false;
    }
    return health;
  });

  registerAuthRoutes(app);
  registerContentRoutes(app);
  registerSessionRoutes(app);
  registerAdminRoutes(app);

  if (config.useMockVerifier) {
    const verifier = startMockVerifier(app.log);
    app.addHook('onClose', async () => {
      await verifier.stop();
    });
  }

  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''));
if (isMain) {
  buildServer()
    .then((app) => app.listen({ port: config.port, host: '0.0.0.0' }))
    .then((addr) => {
      // eslint-disable-next-line no-console
      console.log(`backend listening on ${addr}`);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
