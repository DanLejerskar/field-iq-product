/**
 * HOTFIX — Demo bypass for live-demo sign-in.
 *
 * `GET /api/auth/demo-bypass?key=<env.DEMO_BYPASS_KEY>&app=<dashboard|glasses>`
 *
 * - When DEMO_BYPASS_KEY is unset OR the query key doesn't match → 404 with
 *   no body, so the endpoint is invisible unless explicitly armed via env.
 * - When the key matches: find-or-create `dan@eonreality.com` as an admin
 *   in the default org, mint a JWT with the same shape the magic-link flow
 *   uses, and 302 redirect to `${appOrigin}/#/auth/verify?session=<jwt>`.
 *   The existing AuthGate on both apps already handles that hash.
 *
 * This is a temporary side door. Unset DEMO_BYPASS_KEY on Railway to
 * disarm it; no code revert needed.
 */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { signJwt } from '../auth/tokens.js';
import { config } from '../config/env.js';
import { getDb } from '../db/client.js';
import { organizations, users } from '../db/schema.js';
import type { Db } from '../services/magicLinkService.js';

const DEMO_USER_EMAIL = 'dan@eonreality.com';
const DEMO_USER_NAME = 'Dan Lejerskar';
const JWT_TTL_SECONDS = 30 * 24 * 60 * 60;

export type AppParam = 'dashboard' | 'glasses';

/**
 * Pick the redirect origin. The `app` query param wins over any role-based
 * default; missing/unknown values fall through to dashboard.
 */
export function resolveAppOrigin(appParam: string | undefined): string {
  const dashboardFallback = 'http://localhost:3001';
  const glassesFallback = 'http://localhost:3002';
  const dashboardEnv = process.env.DASHBOARD_ORIGIN;
  const glassesEnv = process.env.GLASSES_ORIGIN;
  const dashboard = (
    dashboardEnv && !dashboardEnv.startsWith('<') ? dashboardEnv : dashboardFallback
  ).replace(/\/+$/, '');
  const glasses = (
    glassesEnv && !glassesEnv.startsWith('<') ? glassesEnv : glassesFallback
  ).replace(/\/+$/, '');
  return appParam === 'glasses' ? glasses : dashboard;
}

export function bypassRedirectUrl(appParam: string | undefined, jwt: string): string {
  return `${resolveAppOrigin(appParam)}/#/auth/verify?session=${encodeURIComponent(jwt)}`;
}

interface AdminUser {
  userId: string;
  orgId: string;
  role: string;
}

/** Find dan@eonreality.com (or create as admin) and bump lastLoginAt. */
export async function findOrCreateDemoAdmin(
  db: Db,
  defaultOrgId?: string,
): Promise<AdminUser> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, DEMO_USER_EMAIL))
    .limit(1);
  const found = existing[0];
  if (found) {
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, found.id));
    return { userId: found.id, orgId: found.orgId, role: found.role as string };
  }

  // Pick the org: explicit override first, then first org row.
  let orgId = defaultOrgId;
  if (!orgId) {
    const rows = await db.select({ id: organizations.id }).from(organizations).limit(1);
    if (rows[0]) {
      orgId = rows[0].id;
    } else {
      // No orgs exist at all — create a default one so the bypass still works
      // on a freshly migrated DB.
      const created = await db
        .insert(organizations)
        .values({ name: 'EON AI Ventures' })
        .returning({ id: organizations.id });
      const newOrg = created[0];
      if (!newOrg) throw new Error('Failed to create default organization');
      orgId = newOrg.id;
    }
  }

  const inserted = await db
    .insert(users)
    .values({
      orgId,
      email: DEMO_USER_EMAIL,
      fullName: DEMO_USER_NAME,
      role: 'admin',
      lastLoginAt: new Date(),
    })
    .returning({ id: users.id, orgId: users.orgId, role: users.role });
  const created = inserted[0];
  if (!created) throw new Error('Failed to create demo admin user');
  return { userId: created.id, orgId: created.orgId, role: created.role as string };
}

export interface DemoBypassDeps {
  db?: Db;
}

export function registerDemoBypassRoutes(
  app: FastifyInstance,
  deps: DemoBypassDeps = {},
): void {
  const dbAccessor = deps.db ?? getDb();

  app.get('/api/auth/demo-bypass', async (req, reply) => {
    const expectedKey = config.demoBypassKey;
    if (!expectedKey) {
      return reply.code(404).send();
    }
    const { key, app: appParam } = req.query as { key?: string; app?: string };
    if (!key || key !== expectedKey) {
      return reply.code(404).send();
    }

    const admin = await findOrCreateDemoAdmin(dbAccessor, config.defaultOrgId);
    const jwt = signJwt(
      { sub: admin.userId, org: admin.orgId, role: admin.role },
      config.jwtSigningSecret,
      JWT_TTL_SECONDS,
    );

    req.log.info(
      { event: 'demo_bypass.used', ip: req.ip, app: appParam ?? 'dashboard' },
      'demo bypass used',
    );

    return reply.redirect(bypassRedirectUrl(appParam, jwt), 302);
  });
}
