/**
 * Route-level tests for the magic-link sign-in endpoints.
 *
 * We use Fastify's `inject` rather than real HTTP so the tests are fast
 * and isolated. The Db / EmailService / RateLimiter are stubbed; the
 * real route handlers run against the stubs.
 *
 * Verify-token behaviour is covered indirectly by the magicLinkService
 * unit tests; what we exercise here is the route plumbing — rate-limit
 * gating, demo-auth gating, error shape, and the redirect target shape.
 */
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAuthRoutes } from './auth.js';
import { RateLimiter } from '../services/rateLimitService.js';
import type { EmailService } from '../services/emailService.js';
import type { Db } from '../services/magicLinkService.js';

const ORIGINAL_DEMO = process.env.DEMO_AUTH_ENABLED;

function fakeEmail(): { service: EmailService; calls: { to: string; magicUrl: string }[] } {
  const calls: { to: string; magicUrl: string }[] = [];
  return {
    calls,
    service: {
      async sendSignInEmail({ to, magicUrl }) {
        calls.push({ to, magicUrl });
      },
    },
  };
}

function fakeDb(): Db {
  return {} as unknown as Db;
}

async function buildApp(deps: {
  emailService: EmailService;
  rateLimiter: RateLimiter;
  db: Db;
}) {
  const app = Fastify({ logger: false });
  registerAuthRoutes(app, deps);
  await app.ready();
  return app;
}

beforeEach(() => {
  delete process.env.DEMO_AUTH_ENABLED;
});

afterEach(() => {
  if (ORIGINAL_DEMO === undefined) delete process.env.DEMO_AUTH_ENABLED;
  else process.env.DEMO_AUTH_ENABLED = ORIGINAL_DEMO;
});

describe('GET /api/auth/config', () => {
  it('reports demoAuthEnabled=false by default', async () => {
    const app = await buildApp({
      emailService: fakeEmail().service,
      rateLimiter: new RateLimiter({ windowMs: 1000, maxRequests: 1 }),
      db: fakeDb(),
    });
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ demoAuthEnabled: false });
    await app.close();
  });

  it('reports demoAuthEnabled=true when env is set', async () => {
    process.env.DEMO_AUTH_ENABLED = 'true';
    const app = await buildApp({
      emailService: fakeEmail().service,
      rateLimiter: new RateLimiter({ windowMs: 1000, maxRequests: 1 }),
      db: fakeDb(),
    });
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(res.json()).toEqual({ demoAuthEnabled: true });
    await app.close();
  });
});

describe('POST /api/auth/request-link', () => {
  it('always 204s on invalid email and does NOT call the transport', async () => {
    const email = fakeEmail();
    const app = await buildApp({
      emailService: email.service,
      rateLimiter: new RateLimiter({ windowMs: 1000, maxRequests: 99 }),
      db: fakeDb(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/request-link',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(204);
    expect(email.calls).toHaveLength(0);
    await app.close();
  });

  it('always 204s on missing body and does NOT call the transport', async () => {
    const email = fakeEmail();
    const app = await buildApp({
      emailService: email.service,
      rateLimiter: new RateLimiter({ windowMs: 1000, maxRequests: 99 }),
      db: fakeDb(),
    });
    const res = await app.inject({ method: 'POST', url: '/api/auth/request-link' });
    expect(res.statusCode).toBe(204);
    expect(email.calls).toHaveLength(0);
    await app.close();
  });

  it('drops silently once the rate-limit window is full (still 204)', async () => {
    const email = fakeEmail();
    // Tiny limit so test stays deterministic.
    const rl = new RateLimiter({ windowMs: 60_000, maxRequests: 2 });
    // Stub the db so insert + magic-link creation doesn't crash.
    const db = stubInsertableDb();
    const app = await buildApp({ emailService: email.service, rateLimiter: rl, db });

    for (let i = 0; i < 4; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/request-link',
        payload: { email: 'maya@example.com' },
      });
      expect(res.statusCode).toBe(204);
    }
    // First 2 calls allowed → 2 sends. Subsequent calls suppressed.
    expect(email.calls.length).toBe(2);
    await app.close();
  });

  it('emits an email containing the magic URL when allowed', async () => {
    const email = fakeEmail();
    const db = stubInsertableDb();
    const app = await buildApp({
      emailService: email.service,
      rateLimiter: new RateLimiter({ windowMs: 1000, maxRequests: 5 }),
      db,
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/request-link',
      payload: { email: 'maya@example.com' },
    });
    expect(email.calls).toHaveLength(1);
    expect(email.calls[0]!.to).toBe('maya@example.com');
    expect(email.calls[0]!.magicUrl).toMatch(/\/api\/auth\/verify\?token=/);
    await app.close();
  });
});

describe('POST /api/auth/demo-login', () => {
  it('is 404 when DEMO_AUTH_ENABLED is unset', async () => {
    const app = await buildApp({
      emailService: fakeEmail().service,
      rateLimiter: new RateLimiter({ windowMs: 1000, maxRequests: 1 }),
      db: fakeDb(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { email: 'admin@eon.ai', password: 'Demo1234!' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('is 401 with wrong credentials when DEMO_AUTH_ENABLED=true', async () => {
    process.env.DEMO_AUTH_ENABLED = 'true';
    const app = await buildApp({
      emailService: fakeEmail().service,
      rateLimiter: new RateLimiter({ windowMs: 1000, maxRequests: 1 }),
      db: fakeDb(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { email: 'admin@eon.ai', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /api/auth/verify', () => {
  it('400s when no token is provided', async () => {
    const app = await buildApp({
      emailService: fakeEmail().service,
      rateLimiter: new RateLimiter({ windowMs: 1000, maxRequests: 1 }),
      db: fakeDb(),
    });
    const res = await app.inject({ method: 'GET', url: '/api/auth/verify' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Token expired or invalid');
    await app.close();
  });
});

describe('POST /api/auth/signout', () => {
  it('returns { ok: true } unconditionally', async () => {
    const app = await buildApp({
      emailService: fakeEmail().service,
      rateLimiter: new RateLimiter({ windowMs: 1000, maxRequests: 1 }),
      db: fakeDb(),
    });
    const res = await app.inject({ method: 'POST', url: '/api/auth/signout' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });
});

/**
 * Minimal Drizzle-shaped db stub that swallows insert() values() calls so
 * `createLink` can run without a real database. Used only for the
 * request-link plumbing tests; verify-side tests use the magicLinkService
 * unit tests for end-to-end coverage.
 */
function stubInsertableDb(): Db {
  const noop = () => Promise.resolve([] as never[]);
  return {
    insert: () => ({ values: noop }),
  } as unknown as Db;
}

void vi;
