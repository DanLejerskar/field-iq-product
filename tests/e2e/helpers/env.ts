/** Load .env.local at the repo root so tests share secrets with the running stack. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_LOCAL = resolve(import.meta.dirname, '../../../.env.local');

let loaded = false;
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(ENV_LOCAL)) return;
  for (const raw of readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (!line.includes('=')) continue;
    const [k, ...rest] = line.split('=');
    if (!k) continue;
    if (process.env[k] === undefined) process.env[k] = rest.join('=').replace(/^["']|["']$/g, '');
  }
}

export const env = {
  get apiHost(): string {
    loadEnv();
    return process.env.API_HOST ?? 'http://localhost:3000';
  },
  get wsHost(): string {
    loadEnv();
    return process.env.WS_HOST ?? 'ws://localhost:3000';
  },
  get jwtSigningSecret(): string {
    loadEnv();
    return process.env.JWT_SIGNING_SECRET ?? '';
  },
  get databaseUrl(): string {
    loadEnv();
    return process.env.DATABASE_URL ?? '';
  },
};
