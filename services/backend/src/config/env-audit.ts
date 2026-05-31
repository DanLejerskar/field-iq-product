/**
 * Boot-time env-var audit + per-request diagnostic helpers.
 *
 * `auditEnv()` returns a redacted summary of the critical env vars so the
 * Railway log shows exactly which ones the container received. Each var
 * surfaces presence + length + first 8 / last 4 chars — enough for "did
 * Railway inject it?" without leaking secrets.
 *
 * Pure functions; unit-tested in env-audit.test.ts.
 */
export interface EnvAuditEntry {
  name: string;
  present: boolean;
  length: number;
  prefix: string;
  suffix: string;
  /** True when the value looks like a leftover placeholder from .env.example. */
  placeholder: boolean;
}

const CRITICAL_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SIGNING_SECRET',
  'REPORT_SIGNING_KEY',
  'ANTHROPIC_API_KEY',
  'USE_MOCK_VERIFIER',
  'RUN_MIGRATIONS_ON_BOOT',
  'SEED_ON_BOOT',
  'NODE_ENV',
  'PORT',
  'ADMIN_SETUP_TOKEN',
] as const;

export function describeEnv(name: string, raw: string | undefined): EnvAuditEntry {
  const value = raw ?? '';
  return {
    name,
    present: value.length > 0,
    length: value.length,
    prefix: value.length > 0 ? value.slice(0, 8) : '',
    suffix: value.length > 4 ? value.slice(-4) : '',
    placeholder: value.startsWith('<'),
  };
}

export function auditEnv(env: NodeJS.ProcessEnv = process.env): EnvAuditEntry[] {
  return CRITICAL_KEYS.map((k) => describeEnv(k, env[k]));
}

/** Stable single-line string for one entry — for `app.log.info(formatEntry(e))`. */
export function formatEntry(e: EnvAuditEntry): string {
  if (!e.present) return `${e.name}: MISSING`;
  if (e.placeholder) return `${e.name}: PLACEHOLDER (starts with '<')`;
  return `${e.name}: present (length=${e.length}, prefix="${e.prefix}", suffix="${e.suffix}")`;
}
