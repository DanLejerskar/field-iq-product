/**
 * DB-backed magic-link issuance + consumption.
 *
 * Backs the production "click the email link" flow. Tokens are UUIDv4s
 * stored in `magic_links` with an explicit `expires_at` (TTL) and a
 * single-use `used_at` guard. Consumption is atomic via an UPDATE that
 * filters on `used_at IS NULL`, so a parallel double-click cannot mint
 * two JWTs.
 *
 * On first sign-in for an unknown email we auto-create the user (role
 * `technician`, slotted into `DEFAULT_ORG_ID`). Pre-provisioned customer
 * users skip the create path.
 *
 * Everything except the two public functions takes a `db` so tests can
 * pass an in-memory fake; see magicLinkService.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { getDb } from '../db/client.js';
import { magicLinks, organizations, users } from '../db/schema.js';

export type Db = ReturnType<typeof getDb>;

/** Magic-link TTL — 15 minutes from creation. */
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export interface CreateLinkInput {
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ConsumedLink {
  userId: string;
  orgId: string;
  email: string;
  role: string;
  fullName: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  // Intentionally loose; the real validation is "Resend accepts it."
  if (email.length === 0 || email.length > 254) return false;
  if (!email.includes('@')) return false;
  const [local, domain] = email.split('@');
  if (!local || !domain) return false;
  if (!domain.includes('.')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Insert a new magic_links row and return the token to embed in the
 * outgoing URL. The token is the URL parameter; we never expose the row id.
 */
export async function createLink(
  db: Db,
  input: CreateLinkInput,
  now: Date = new Date(),
): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS);
  await db.insert(magicLinks).values({
    email: normalizeEmail(input.email),
    token,
    expiresAt,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
  return token;
}

/**
 * Atomically consume `token`: mark `used_at = now` iff it's currently null
 * AND not expired AND matches. If that succeeds, find-or-create the user
 * keyed by the link's email and return enough state to mint a JWT.
 *
 * Returns null when the token doesn't exist, has already been used, or
 * expired.
 */
export async function consumeLink(
  db: Db,
  token: string,
  options: { defaultOrgId?: string } = {},
  now: Date = new Date(),
): Promise<ConsumedLink | null> {
  // The UPDATE…RETURNING does both the expiry check and the single-use
  // guard. We compare expires_at to `now` in JS rather than via SQL so the
  // tests can pin time without a separate clock source.
  const claimed = await db
    .update(magicLinks)
    .set({ usedAt: now })
    .where(and(eq(magicLinks.token, token), isNull(magicLinks.usedAt)))
    .returning({
      id: magicLinks.id,
      email: magicLinks.email,
      expiresAt: magicLinks.expiresAt,
    });

  const row = claimed[0];
  if (!row) return null;
  const expires = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
  if (expires.getTime() <= now.getTime()) return null;

  return findOrCreateUserForEmail(db, row.email, options.defaultOrgId);
}

/** Find a user by email, creating a technician-role placeholder if absent. */
export async function findOrCreateUserForEmail(
  db: Db,
  email: string,
  defaultOrgId?: string,
): Promise<ConsumedLink> {
  const normalized = normalizeEmail(email);
  const existing = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  const found = existing[0];
  if (found) {
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, found.id));
    return {
      userId: found.id,
      orgId: found.orgId,
      email: found.email,
      role: found.role as string,
      fullName: found.fullName,
    };
  }

  const orgId = await resolveDefaultOrgId(db, defaultOrgId);
  const inserted = await db
    .insert(users)
    .values({
      orgId,
      email: normalized,
      fullName: normalized.split('@')[0] ?? normalized,
      role: 'technician',
      lastLoginAt: new Date(),
    })
    .returning({
      id: users.id,
      orgId: users.orgId,
      email: users.email,
      role: users.role,
      fullName: users.fullName,
    });
  const created = inserted[0];
  if (!created) throw new Error('Failed to auto-create user');
  return {
    userId: created.id,
    orgId: created.orgId,
    email: created.email,
    role: created.role as string,
    fullName: created.fullName,
  };
}

/** Pick the org id to slot a new auto-created user into. */
export async function resolveDefaultOrgId(
  db: Db,
  override?: string,
): Promise<string> {
  if (override) return override;
  const rows = await db.select({ id: organizations.id }).from(organizations).limit(1);
  const first = rows[0];
  if (!first) {
    throw new Error(
      'No organizations exist — cannot auto-create user. Run `pnpm seed` or set DEFAULT_ORG_ID.',
    );
  }
  return first.id;
}
