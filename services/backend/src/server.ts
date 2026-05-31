/**
 * Fastify server bootstrap: health, error handling, routes, the mock verifier,
 * and (optionally) a one-shot DB migrate + seed on first boot for the
 * browser-only Railway deploy path.
 */
import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { config, loadEnv } from './config/env.js';
import { getDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { AppError } from './errors.js';
import { getRedis } from './services/bus.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerContentRoutes } from './routes/content.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerWebSocketGateway } from './ws/gateway.js';
import { startMockVerifier } from './workers/mock-verifier.js';

/** CORS / WS origin allow-list — the two known Vercel apps + any *.vercel.app preview. */
const STATIC_ORIGINS = new Set([
  'https://field-iq-product-dashboard.vercel.app',
  'https://field-iq-product-glasses-webapp.vercel.app',
  // Phase 2A's deploy-guide also suggests these shorter project names; allow both:
  'https://field-iq-dashboard.vercel.app',
  'https://field-iq-glasses.vercel.app',
  // Local dev:
  'http://localhost:3001',
  'http://localhost:3002',
]);
const VERCEL_PREVIEW = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin / curl / native apps
  if (STATIC_ORIGINS.has(origin)) return true;
  if (VERCEL_PREVIEW.test(origin)) return true;
  if (EXTRA_ORIGINS.includes(origin)) return true;
  return false;
}

export async function buildServer(): Promise<FastifyInstance> {
  loadEnv();
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 2 * 1024 * 1024, // 2 MB cap — leaves headroom for a 1 MB base64 photo + envelope
    trustProxy: true, // Railway / any reverse proxy → correct req.ip
  });

  await app.register(cors, {
    origin(origin, cb) {
      cb(null, isAllowedOrigin(origin ?? undefined));
    },
    credentials: true,
  });
  await registerWebSocketGateway(app);

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

async function bootMigrationsIfRequested(log: FastifyInstance['log']): Promise<void> {
  if (process.env.RUN_MIGRATIONS_ON_BOOT === 'true') {
    log.info('RUN_MIGRATIONS_ON_BOOT=true — applying pending migrations');
    await runMigrations();
  }
  if (process.env.SEED_ON_BOOT === 'true') {
    log.info('SEED_ON_BOOT=true — running DAC #811 seed');
    const { runSeed } = await import('../seed/index.js');
    await runSeed();
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''));
if (isMain) {
  buildServer()
    .then(async (app) => {
      await bootMigrationsIfRequested(app.log);
      return app.listen({ port: config.port, host: '0.0.0.0' });
    })
    .then((addr) => {
      // eslint-disable-next-line no-console
      console.log(`backend listening on ${addr}`);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
