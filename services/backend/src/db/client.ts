/** Postgres connection + Drizzle client. */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config/env.js';
import * as schema from './schema.js';

/**
 * postgres-js doesn't recognise every Neon connection-string flag (notably
 * `channel_binding=require`, introduced in newer libpq for SCRAM-SHA-256-PLUS).
 * Strip unknown flags before handing the URL to postgres-js so the auth
 * handshake doesn't trip on an option the driver can't honour. Neon still
 * accepts SCRAM-SHA-256 without channel binding, so removing the flag is safe.
 */
export function sanitizeDatabaseUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const dropFlags = new Set(['channel_binding']);
    for (const flag of dropFlags) url.searchParams.delete(flag);
    return url.toString();
  } catch {
    return rawUrl; // not a parseable URL — let postgres-js fail loudly
  }
}

let sqlClient: ReturnType<typeof postgres> | undefined;

export function getSql(): ReturnType<typeof postgres> {
  if (!sqlClient) {
    sqlClient = postgres(sanitizeDatabaseUrl(config.databaseUrl), {
      // Neon (and any managed Postgres) requires TLS. Setting ssl explicitly
      // avoids relying on postgres-js's URL-string parsing for `sslmode=require`,
      // which has changed across versions.
      ssl: 'require',
      // Neon cold-start can stall briefly; 10s is well over the usual warm-up
      // but fails fast enough that /health reports a real error.
      connect_timeout: 10,
      max: 5,
    });
  }
  return sqlClient;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  return drizzle(getSql(), { schema });
}

export async function closeDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = undefined;
  }
}

export { schema };
