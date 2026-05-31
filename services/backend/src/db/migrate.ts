/**
 * Applies all SQL migrations in ./drizzle to the database in DATABASE_URL.
 * Run via `pnpm migrate`, or call `runMigrations()` from the server's
 * RUN_MIGRATIONS_ON_BOOT path.
 */
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from '../config/env.js';

export async function runMigrations(): Promise<void> {
  const migrationsFolder = resolve(import.meta.dirname, '../../drizzle');
  const sql = postgres(config.databaseUrl, { max: 1 });
  const db = drizzle(sql);
  // eslint-disable-next-line no-console
  console.log(`Applying migrations from ${migrationsFolder} ...`);
  await migrate(db, { migrationsFolder });
  // eslint-disable-next-line no-console
  console.log('Migrations applied.');
  await sql.end();
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''));
if (isMain) {
  runMigrations().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
