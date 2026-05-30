/**
 * `pnpm setup` — interactive credential + environment bootstrap for EON Field IQ.
 *
 * Behaviour (per PHASE_1_LOTO_V1_CLAUDE_CODE_PROMPT.md "Setup script"):
 *  1. If .env.local exists, load it and exit successfully.
 *  2. Offer (a) point at an existing .env to harvest keys, or (b) prompt per key.
 *  3. Mask secret input. Generate JWT/REPORT signing secrets if absent.
 *  4. Default DATABASE_URL/REDIS_URL/S3 to local Docker Compose when not provided.
 *  5. Write .env.local with 0600 permissions and print a collected/deferred summary.
 *
 * When run without a TTY (e.g. CI or a cloud container) the script is
 * non-interactive: it generates signing secrets, defaults all infra to local,
 * leaves ANTHROPIC_API_KEY as a placeholder, and writes .env.local.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import { stdin, stdout } from 'node:process';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const ENV_LOCAL = resolve(REPO_ROOT, '.env.local');

type KeySpec = {
  key: string;
  description: string;
  secret: boolean;
  /** Local-dev default; if present we never block on this key. */
  localDefault?: string;
  /** Generate a random hex secret when not supplied. */
  generate?: boolean;
  /** Deferred keys are not collected now; noted in the summary. */
  deferredUntil?: string;
};

const KEY_SPECS: KeySpec[] = [
  {
    key: 'ANTHROPIC_API_KEY',
    description: 'Anthropic API key for the Python verifier (Claude Sonnet 4.6).',
    secret: true,
    deferredUntil: 'M5',
  },
  {
    key: 'ANTHROPIC_MODEL',
    description: 'Claude model id.',
    secret: false,
    localDefault: 'claude-sonnet-4-6',
  },
  {
    key: 'DATABASE_URL',
    description: 'Postgres connection string (Neon for managed).',
    secret: false,
    localDefault: 'postgresql://field_iq:field_iq_dev@localhost:5432/field_iq',
  },
  {
    key: 'REDIS_URL',
    description: 'Redis connection string (Upstash for managed).',
    secret: false,
    localDefault: 'redis://localhost:6379',
  },
  {
    key: 'S3_ENDPOINT',
    description: 'S3 endpoint (MinIO locally).',
    secret: false,
    localDefault: 'http://localhost:9000',
  },
  {
    key: 'S3_BUCKET',
    description: 'S3 bucket for photos.',
    secret: false,
    localDefault: 'field-iq',
  },
  { key: 'S3_REGION', description: 'S3 region.', secret: false, localDefault: 'us-east-1' },
  {
    key: 'S3_ACCESS_KEY_ID',
    description: 'S3 access key id.',
    secret: true,
    localDefault: 'field_iq',
  },
  {
    key: 'S3_SECRET_ACCESS_KEY',
    description: 'S3 secret access key.',
    secret: true,
    localDefault: 'field_iq_dev',
  },
  {
    key: 'S3_FORCE_PATH_STYLE',
    description: 'Use path-style S3 URLs (true for MinIO).',
    secret: false,
    localDefault: 'true',
  },
  {
    key: 'EMAIL_API_KEY',
    description: 'Resend/Postmark key for magic-link email (console fallback in dev).',
    secret: true,
    deferredUntil: 'M3',
  },
  {
    key: 'EMAIL_FROM',
    description: 'Magic-link sender address.',
    secret: false,
    localDefault: 'no-reply@eonreality.com',
  },
  {
    key: 'EMAIL_TRANSPORT',
    description: 'Email transport: console | resend | postmark.',
    secret: false,
    localDefault: 'console',
  },
  {
    key: 'JWT_SIGNING_SECRET',
    description: 'Backend JWT signing secret.',
    secret: true,
    generate: true,
  },
  {
    key: 'REPORT_SIGNING_KEY',
    description: 'PDF audit-report signing key.',
    secret: true,
    generate: true,
  },
  {
    key: 'API_HOST',
    description: 'Backend HTTP host for clients.',
    secret: false,
    localDefault: 'http://localhost:3000',
  },
  {
    key: 'WS_HOST',
    description: 'Backend WebSocket host for clients.',
    secret: false,
    localDefault: 'ws://localhost:3000',
  },
  { key: 'PORT', description: 'Backend listen port.', secret: false, localDefault: '3000' },
  {
    key: 'USE_MOCK_VERIFIER',
    description: 'Use the mock verifier instead of Claude.',
    secret: false,
    localDefault: 'true',
  },
];

/** Keys harvested from an existing .env in option (a). */
const HARVESTABLE = new Set([
  'ANTHROPIC_API_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'EMAIL_API_KEY',
]);

function log(msg: string): void {
  stdout.write(`${msg}\n`);
}

function parseEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of contents.split('\n')) {
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
    if (key) out[key] = value;
  }
  return out;
}

function ask(rl: Interface, question: string): Promise<string> {
  return new Promise((res) => rl.question(question, (answer) => res(answer.trim())));
}

/** Prompt without echoing the typed characters (for secrets). */
function askMasked(rl: Interface, question: string): Promise<string> {
  return new Promise((res) => {
    const rlAny = rl as unknown as {
      output: NodeJS.WriteStream;
      _writeToOutput?: (s: string) => void;
    };
    const original = rlAny._writeToOutput?.bind(rl);
    let firstWrite = true;
    rlAny._writeToOutput = (stringToWrite: string) => {
      if (firstWrite) {
        rlAny.output.write(question);
        firstWrite = false;
        return;
      }
      if (stringToWrite.includes('\n')) rlAny.output.write('\n');
    };
    rl.question(question, (answer) => {
      rlAny._writeToOutput = original ?? (() => {});
      res(answer.trim());
    });
  });
}

function generateSecret(): string {
  return randomBytes(32).toString('hex');
}

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('<') || value.length === 0;
}

function serialize(values: Record<string, string>): string {
  const lines = ['# EON Field IQ — .env.local (generated by `pnpm setup`). DO NOT COMMIT.', ''];
  for (const spec of KEY_SPECS) {
    const v = values[spec.key];
    if (v !== undefined) lines.push(`${spec.key}=${v}`);
  }
  return lines.join('\n') + '\n';
}

function finalize(values: Record<string, string>): void {
  // Generated secrets.
  for (const spec of KEY_SPECS) {
    if (spec.generate && isPlaceholder(values[spec.key])) values[spec.key] = generateSecret();
  }
  // Local defaults for anything still missing.
  for (const spec of KEY_SPECS) {
    if (isPlaceholder(values[spec.key]) && spec.localDefault !== undefined)
      values[spec.key] = spec.localDefault;
  }
  // Deferred keys keep an explicit placeholder so .env.local documents them.
  for (const spec of KEY_SPECS) {
    if (values[spec.key] === undefined) values[spec.key] = '<your-key-here>';
  }

  writeFileSync(ENV_LOCAL, serialize(values), { mode: 0o600 });
  chmodSync(ENV_LOCAL, 0o600);

  const collected = KEY_SPECS.filter((s) => !isPlaceholder(values[s.key])).length;
  const deferred = KEY_SPECS.filter((s) => isPlaceholder(values[s.key]));
  log('');
  log(`Wrote ${ENV_LOCAL} (permissions 600).`);
  log(`${collected} of ${KEY_SPECS.length} keys set.`);
  if (deferred.length > 0) {
    log(
      `Deferred / still pending: ${deferred
        .map((s) => `${s.key}${s.deferredUntil ? ` (${s.deferredUntil})` : ''}`)
        .join(', ')}.`,
    );
  }
  if (
    isPlaceholder(values.DATABASE_URL) ||
    values.DATABASE_URL === KEY_SPECS.find((s) => s.key === 'DATABASE_URL')?.localDefault
  ) {
    log(
      'No external Postgres URL provided. Defaulting to local Docker Compose Postgres. To use Neon, set DATABASE_URL in .env.local and re-run.',
    );
  }
}

async function runInteractive(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    log('I need to collect some credentials.');
    log(
      '  (a) point me at an existing .env file from another EON project, and I will pick what I need',
    );
    log('  (b) I will prompt you for each credential one by one');
    const mode = (await ask(rl, 'Which do you prefer? (a/b) ')).toLowerCase();

    const values: Record<string, string> = {};

    if (mode === 'a') {
      const path = await ask(rl, 'Absolute path to the existing .env file: ');
      const resolved = resolve(path);
      if (!existsSync(resolved)) {
        log(`Could not find ${resolved}. Falling back to per-key prompts.`);
      } else {
        const harvested = parseEnv(readFileSync(resolved, 'utf8'));
        let picked = 0;
        for (const key of HARVESTABLE) {
          if (harvested[key] && !isPlaceholder(harvested[key])) {
            values[key] = harvested[key]!;
            picked++;
          }
        }
        log(`Harvested ${picked} key(s) from ${resolved}. (Source file left unmodified.)`);
      }
      // Prompt for any harvestable keys we still don't have.
      for (const spec of KEY_SPECS) {
        if (HARVESTABLE.has(spec.key) && isPlaceholder(values[spec.key]) && !spec.deferredUntil) {
          const v = spec.secret
            ? await askMasked(rl, `${spec.description}\n  ${spec.key}: `)
            : await ask(rl, `${spec.description}\n  ${spec.key}: `);
          if (v) values[spec.key] = v;
        }
      }
    } else {
      for (const spec of KEY_SPECS) {
        if (spec.generate || spec.deferredUntil) continue; // generated or deferred
        const hint = spec.localDefault
          ? ` [enter for default: ${spec.secret ? '••••' : spec.localDefault}]`
          : '';
        const v = spec.secret
          ? await askMasked(rl, `${spec.description}\n  ${spec.key}${hint}: `)
          : await ask(rl, `${spec.description}\n  ${spec.key}${hint}: `);
        if (v) values[spec.key] = v;
      }
    }

    finalize(values);
  } finally {
    rl.close();
  }
}

function runNonInteractive(): void {
  log('No interactive terminal detected — generating local-dev defaults.');
  log(
    'Signing secrets generated; infra defaulted to local Docker Compose; ANTHROPIC_API_KEY left as a placeholder (set it before M5).',
  );
  finalize({});
}

async function main(): Promise<void> {
  if (existsSync(ENV_LOCAL)) {
    log(`.env.local already exists at ${ENV_LOCAL}. Nothing to do.`);
    return;
  }
  if (stdin.isTTY) {
    await runInteractive();
  } else {
    runNonInteractive();
  }
}

main().catch((err: unknown) => {
  stdout.write(`setup failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
