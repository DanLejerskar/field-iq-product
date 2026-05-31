import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsFolder } from './migrate.js';

describe('migrationsFolder', () => {
  // Regression guard for Phase 2C hotfix: the resolved path must point at the
  // drizzle/ tree that contains meta/_journal.json. If this fails, drizzle-orm's
  // migrator throws `Can't find meta/_journal.json file` at runtime — the same
  // error we hit on Railway when dist/ and drizzle/ ended up as siblings.
  it('resolves to a directory containing meta/_journal.json', () => {
    expect(existsSync(resolve(migrationsFolder, 'meta', '_journal.json'))).toBe(true);
  });
});
