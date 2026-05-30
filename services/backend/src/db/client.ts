/** Postgres connection + Drizzle client. */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config/env.js';
import * as schema from './schema.js';

let sqlClient: ReturnType<typeof postgres> | undefined;

export function getSql(): ReturnType<typeof postgres> {
  if (!sqlClient) sqlClient = postgres(config.databaseUrl);
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
