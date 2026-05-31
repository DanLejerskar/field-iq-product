/**
 * Environment loading + typed config.
 * Reads .env.local at the repo root (written by `pnpm run setup`) and merges it into
 * process.env without overriding values already set by the real environment.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const ENV_LOCAL = resolve(REPO_ROOT, '.env.local');

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(ENV_LOCAL)) return;
  for (const raw of readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function required(key: string): string {
  loadEnv();
  const value = process.env[key];
  if (!value || value.startsWith('<')) {
    throw new Error(`Missing required environment variable: ${key}. Run \`pnpm run setup\`.`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  loadEnv();
  const value = process.env[key];
  return value && !value.startsWith('<') ? value : fallback;
}

export const config = {
  get databaseUrl(): string {
    return required('DATABASE_URL');
  },
  get redisUrl(): string {
    return optional('REDIS_URL', 'redis://localhost:6379');
  },
  get port(): number {
    return Number(optional('PORT', '3000'));
  },
  get jwtSigningSecret(): string {
    return required('JWT_SIGNING_SECRET');
  },
  get useMockVerifier(): boolean {
    return optional('USE_MOCK_VERIFIER', 'true') === 'true';
  },
  s3: {
    /**
     * True only when S3_ENDPOINT is explicitly configured to a non-placeholder
     * value. On Railway (v1), this stays false and photos are stored as data
     * URIs in audit_log.photo_url. Phase 2C flips this back on with R2/S3.
     */
    get enabled(): boolean {
      loadEnv();
      const v = process.env.S3_ENDPOINT;
      return !!v && v.length > 0 && !v.startsWith('<');
    },
    get endpoint(): string {
      return optional('S3_ENDPOINT', 'http://localhost:9000');
    },
    get bucket(): string {
      return optional('S3_BUCKET', 'field-iq');
    },
    get region(): string {
      return optional('S3_REGION', 'us-east-1');
    },
    get accessKeyId(): string {
      return optional('S3_ACCESS_KEY_ID', 'field_iq');
    },
    get secretAccessKey(): string {
      return optional('S3_SECRET_ACCESS_KEY', 'field_iq_dev');
    },
    get forcePathStyle(): boolean {
      return optional('S3_FORCE_PATH_STYLE', 'true') === 'true';
    },
  },
  /** Per-photo cap enforced server-side at /verify. */
  get photoSizeLimit(): number {
    return Number(optional('PHOTO_SIZE_LIMIT_BYTES', String(1024 * 1024)));
  },
};
