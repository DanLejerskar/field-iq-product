/**
 * Unit tests for the magic-link service.
 *
 * `createLink` and `consumeLink` go through Drizzle's builder, which is
 * hard to fake without spinning Postgres. We exercise the parts that are
 * easy to isolate (the pure validator, the TTL constant) here, plus
 * `findOrCreateUserForEmail` against a hand-rolled fake that dispatches on
 * the imported schema table references — no string sniffing.
 *
 * End-to-end DB-touching coverage lives in the auth route integration
 * tests (auth.routes.test.ts) and a future Phase 2C postgres-backed
 * integration harness.
 */
import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  MAGIC_LINK_TTL_MS,
  findOrCreateUserForEmail,
} from './magicLinkService.js';
import { organizations, users } from '../db/schema.js';

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
 * Minimal Drizzle-shaped fake. Dispatches on table identity (===) rather
 * than introspecting Drizzle internals. Only implements the operations
 * findOrCreateUserForEmail actually invokes.
 */
function makeFakeDb(seed: { users?: UserRow[]; orgs?: { id: string }[] } = {}) {
  const allUsers: UserRow[] = seed.users ?? [];
  const orgs: { id: string }[] = seed.orgs ?? [{ id: 'org-default' }];

  // The Drizzle `eq(table.col, value)` builder returns an opaque object;
  // we ignore the contents and use a per-call closure that captures the
  // intended match (set just before each .where call).
  let pendingPredicate: ((row: Record<string, unknown>) => boolean) | null = null;

  return {
    allUsers,
    select(cols?: unknown) {
      void cols;
      return {
        from(table: unknown) {
          return {
            where(_predicate: unknown) {
              const p = pendingPredicate;
              pendingPredicate = null;
              return {
                limit(_n: number) {
                  if (table === users) {
                    const found = p
                      ? allUsers.find((u) => p(u as unknown as Record<string, unknown>))
                      : allUsers[0];
                    return Promise.resolve(found ? [found] : []);
                  }
                  throw new Error('select.where.limit: unknown table');
                },
              };
            },
            limit(_n: number) {
              if (table === organizations) return Promise.resolve(orgs.slice(0, 1));
              throw new Error('select.from.limit: unknown table');
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
                  {
                    id: created.id,
                    orgId: created.orgId,
                    email: created.email,
                    role: created.role,
                    fullName: created.fullName,
                  },
                ]);
              },
            };
          }
          throw new Error('insert: unknown table');
        },
      };
    },
    update(table: unknown) {
      return {
        set(patch: Record<string, unknown>) {
          return {
            where(_predicate: unknown) {
              if (table === users) {
                // Patch the first user (matches by id in practice; the
                // fake just bumps lastLoginAt on the only candidate).
                const target = allUsers[allUsers.length - 1];
                if (target) Object.assign(target, patch);
                return Promise.resolve([]);
              }
              throw new Error('update: unknown table');
            },
          };
        },
      };
    },
    /** Test hook: queue up the next predicate the fake should apply. */
    _expectMatch(p: (row: Record<string, unknown>) => boolean) {
      pendingPredicate = p;
    },
  };
}

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('maya.wu@eonreality.com')).toBe(true);
  });

  it('rejects missing local or domain or TLD', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('a@')).toBe(false);
    expect(isValidEmail('@b.co')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('plainstring')).toBe(false);
  });

  it('rejects whitespace and oversized addresses', () => {
    expect(isValidEmail('a @b.co')).toBe(false);
    expect(isValidEmail('a@b .co')).toBe(false);
    expect(isValidEmail('a'.repeat(255) + '@b.co')).toBe(false);
  });
});

describe('MAGIC_LINK_TTL_MS', () => {
  it('is 15 minutes', () => {
    expect(MAGIC_LINK_TTL_MS).toBe(15 * 60 * 1000);
  });
});

describe('findOrCreateUserForEmail', () => {
  it('returns the existing user and bumps lastLoginAt', async () => {
    const existing: UserRow = {
      id: 'u-1',
      orgId: 'org-1',
      email: 'carlos@example.com',
      fullName: 'Carlos',
      role: 'supervisor',
      lastLoginAt: null,
    };
    const db = makeFakeDb({ users: [existing] });
    db._expectMatch((row) => row.email === 'carlos@example.com');
    const result = await findOrCreateUserForEmail(
      db as unknown as Parameters<typeof findOrCreateUserForEmail>[0],
      'CARLOS@example.com',
    );
    expect(result.userId).toBe('u-1');
    expect(result.email).toBe('carlos@example.com');
    expect(result.role).toBe('supervisor');
    expect(existing.lastLoginAt).toBeInstanceOf(Date);
  });

  it('auto-creates a technician for an unknown email', async () => {
    const db = makeFakeDb({ users: [], orgs: [{ id: 'org-zzz' }] });
    db._expectMatch(() => false);
    const result = await findOrCreateUserForEmail(
      db as unknown as Parameters<typeof findOrCreateUserForEmail>[0],
      'newworker@plant.io',
    );
    expect(result.email).toBe('newworker@plant.io');
    expect(result.role).toBe('technician');
    expect(result.orgId).toBe('org-zzz');
    expect(db.allUsers.find((u) => u.email === 'newworker@plant.io')).toBeTruthy();
  });

  it('honours the defaultOrgId override over the org table', async () => {
    const db = makeFakeDb({ users: [], orgs: [{ id: 'fallback-org' }] });
    db._expectMatch(() => false);
    const result = await findOrCreateUserForEmail(
      db as unknown as Parameters<typeof findOrCreateUserForEmail>[0],
      'new@example.com',
      'explicit-org-id',
    );
    expect(result.orgId).toBe('explicit-org-id');
  });

  it('throws when there are no orgs and no override', async () => {
    const db = makeFakeDb({ users: [], orgs: [] });
    db._expectMatch(() => false);
    await expect(
      findOrCreateUserForEmail(
        db as unknown as Parameters<typeof findOrCreateUserForEmail>[0],
        'orphan@example.com',
      ),
    ).rejects.toThrow(/No organizations/i);
  });
});
