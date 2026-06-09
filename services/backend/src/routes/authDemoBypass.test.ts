/**
 * Tests for the live-demo bypass endpoint.
 *
 * Same Fastify `inject` pattern auth.routes.test.ts uses, with a Drizzle-
 * shaped fake `db` injected so we don't need a real Postgres.
 */
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerDemoBypassRoutes, resolveAppOrigin } from './authDemoBypass.js';
import { organizations, users } from '../db/schema.js';
import type { Db } from '../services/magicLinkService.js';

const ORIGINAL_KEY = process.env.DEMO_BYPASS_KEY;
const ORIGINAL_DASHBOARD = process.env.DASHBOARD_ORIGIN;
const ORIGINAL_GLASSES = process.env.GLASSES_ORIGIN;
const ORIGINAL_JWT_SECRET = process.env.JWT_SIGNING_SECRET;

interface UserRow {
  id: string;
  orgId: string;
  email: string;
  fullName: string;
  role: string;
  lastLoginAt?: Date | null;
}

let _id = 0;
function nextId(prefix: string): string {
  _id += 1;
  return `${prefix}-${_id}`;
}

/**
 * Minimal Drizzle-shaped fake that dispatches on table identity (===)
 * rather than introspecting Drizzle internals. Only implements what the
 * route handler invokes.
 */
function makeFakeDb(seed: { users?: UserRow[]; orgs?: { id: string }[] } = {}) {
  const allUsers: UserRow[] = seed.users ?? [];
  const orgs: { id: string }[] = seed.orgs ?? [{ id: 'org-default' }];

  const db = {
    allUsers,
    orgs,
    select(cols?: unknown) {
      void cols;
      return {
        from(table: unknown) {
          return {
            where(_predicate: unknown) {
              return {
                limit(_n: number) {
                  if (table === users) {
                    // Route only looks up by email == DEMO_USER_EMAIL; the
                    // fake just returns the only row in that case.
                    const found = allUsers.find((u) => u.email === 'dan@eonreality.com');
                    return Promise.resolve(found ? [found] : []);
                  }
                  throw new Error('select.where.limit: unexpected table');
                },
              };
            },
            limit(_n: number) {
              if (table === organizations) return Promise.resolve(orgs.slice(0, 1));
              throw new Error('select.from.limit: unexpected table');
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(row: unknown) {
          if (table === users) {
            const r = row as Omit<UserRow, 'id'>;
            const created: UserRow = { ...r, id: nextId('user') };
            allUsers.push(created);
            return {
              returning(_cols?: unknown) {
                return Promise.resolve([
                  { id: created.id, orgId: created.orgId, role: created.role },
                ]);
              },
            };
          }
          if (table === organizations) {
            const r = row as { name: string };
            const created = { id: nextId('org'), name: r.name };
            orgs.push({ id: created.id });
            return {
              returning(_cols?: unknown) {
                return Promise.resolve([{ id: created.id }]);
              },
            };
          }
          throw new Error('insert: unexpected table');
        },
      };
    },
    update(table: unknown) {
      return {
        set(patch: Record<string, unknown>) {
          return {
            where(_predicate: unknown) {
              if (table === users) {
                const target = allUsers[0];
                if (target) Object.assign(target, patch);
                return Promise.resolve([]);
              }
              throw new Error('update: unexpected table');
            },
          };
        },
      };
    },
  };
  return db;
}

async function buildApp(db: Db) {
  const app = Fastify({ logger: false });
  registerDemoBypassRoutes(app, { db });
  await app.ready();
  return app;
}

beforeEach(() => {
  delete process.env.DEMO_BYPASS_KEY;
  delete process.env.DASHBOARD_ORIGIN;
  delete process.env.GLASSES_ORIGIN;
  process.env.JWT_SIGNING_SECRET = 'test-secret-key';
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.DEMO_BYPASS_KEY;
  else process.env.DEMO_BYPASS_KEY = ORIGINAL_KEY;
  if (ORIGINAL_DASHBOARD === undefined) delete process.env.DASHBOARD_ORIGIN;
  else process.env.DASHBOARD_ORIGIN = ORIGINAL_DASHBOARD;
  if (ORIGINAL_GLASSES === undefined) delete process.env.GLASSES_ORIGIN;
  else process.env.GLASSES_ORIGIN = ORIGINAL_GLASSES;
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SIGNING_SECRET;
  else process.env.JWT_SIGNING_SECRET = ORIGINAL_JWT_SECRET;
});

describe('resolveAppOrigin', () => {
  it('picks dashboard by default', () => {
    expect(resolveAppOrigin(undefined)).toBe('http://localhost:3001');
    expect(resolveAppOrigin('dashboard')).toBe('http://localhost:3001');
  });

  it('picks glasses on app=glasses', () => {
    expect(resolveAppOrigin('glasses')).toBe('http://localhost:3002');
  });

  it('respects env overrides', () => {
    process.env.DASHBOARD_ORIGIN = 'https://dash.example.com/';
    process.env.GLASSES_ORIGIN = 'https://hud.example.com';
    expect(resolveAppOrigin('dashboard')).toBe('https://dash.example.com');
    expect(resolveAppOrigin('glasses')).toBe('https://hud.example.com');
  });

  it('falls back when env is a placeholder', () => {
    process.env.DASHBOARD_ORIGIN = '<dashboard-origin>';
    expect(resolveAppOrigin('dashboard')).toBe('http://localhost:3001');
  });

  it('unrecognised app values fall back to dashboard', () => {
    expect(resolveAppOrigin('mystery')).toBe('http://localhost:3001');
    expect(resolveAppOrigin('')).toBe('http://localhost:3001');
  });
});

describe('GET /api/auth/demo-bypass — gating', () => {
  it('404s when DEMO_BYPASS_KEY env var is unset (even with a key)', async () => {
    const app = await buildApp(makeFakeDb() as unknown as Db);
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/demo-bypass?key=anything&app=dashboard',
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('');
    await app.close();
  });

  it('404s when DEMO_BYPASS_KEY is set but query key is wrong', async () => {
    process.env.DEMO_BYPASS_KEY = 'real-secret';
    const app = await buildApp(makeFakeDb() as unknown as Db);
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/demo-bypass?key=wrong-secret&app=dashboard',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('404s when DEMO_BYPASS_KEY is set but query key is missing', async () => {
    process.env.DEMO_BYPASS_KEY = 'real-secret';
    const app = await buildApp(makeFakeDb() as unknown as Db);
    const res = await app.inject({ method: 'GET', url: '/api/auth/demo-bypass' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /api/auth/demo-bypass — happy paths', () => {
  it('302s to DASHBOARD_ORIGIN when app=dashboard, with a JWT in #session=', async () => {
    process.env.DEMO_BYPASS_KEY = 'real-secret';
    process.env.DASHBOARD_ORIGIN = 'https://field-iq-dashboard.vercel.app';
    const db = makeFakeDb();
    const app = await buildApp(db as unknown as Db);
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/demo-bypass?key=real-secret&app=dashboard',
    });
    expect(res.statusCode).toBe(302);
    const loc = res.headers.location as string;
    expect(loc).toMatch(
      /^https:\/\/field-iq-dashboard\.vercel\.app\/#\/auth\/verify\?session=/,
    );
    // JWT shape: header.payload.signature, base64url-encoded payload contains role=admin
    const jwt = decodeURIComponent(loc.split('session=')[1] ?? '');
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    expect(payload.role).toBe('admin');
    expect(typeof payload.sub).toBe('string');
    expect(typeof payload.org).toBe('string');
    // User created in the fake db.
    expect(db.allUsers.find((u) => u.email === 'dan@eonreality.com')?.role).toBe('admin');
    await app.close();
  });

  it('302s to GLASSES_ORIGIN when app=glasses', async () => {
    process.env.DEMO_BYPASS_KEY = 'real-secret';
    process.env.GLASSES_ORIGIN = 'https://field-iq-glasses-webapp.vercel.app';
    const app = await buildApp(makeFakeDb() as unknown as Db);
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/demo-bypass?key=real-secret&app=glasses',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(
      /^https:\/\/field-iq-glasses-webapp\.vercel\.app\/#\/auth\/verify\?session=/,
    );
    await app.close();
  });

  it('defaults to dashboard when app query param is missing', async () => {
    process.env.DEMO_BYPASS_KEY = 'real-secret';
    const app = await buildApp(makeFakeDb() as unknown as Db);
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/demo-bypass?key=real-secret',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(
      /^http:\/\/localhost:3001\/#\/auth\/verify\?session=/,
    );
    await app.close();
  });

  it('reuses the existing dan@eonreality.com user on subsequent calls (idempotent)', async () => {
    process.env.DEMO_BYPASS_KEY = 'real-secret';
    const db = makeFakeDb({
      users: [
        {
          id: 'pre-existing-id',
          orgId: 'pre-existing-org',
          email: 'dan@eonreality.com',
          fullName: 'Dan Lejerskar',
          role: 'admin',
        },
      ],
    });
    const app = await buildApp(db as unknown as Db);
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/demo-bypass?key=real-secret&app=dashboard',
    });
    expect(res.statusCode).toBe(302);
    // No second user row inserted.
    expect(db.allUsers.length).toBe(1);
    expect(db.allUsers[0]!.id).toBe('pre-existing-id');
    // JWT sub points at the pre-existing id.
    const loc = res.headers.location as string;
    const jwt = decodeURIComponent(loc.split('session=')[1] ?? '');
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8'));
    expect(payload.sub).toBe('pre-existing-id');
    await app.close();
  });
});
