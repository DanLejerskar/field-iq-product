/**
 * SHA-256 hash chain + REPORT_SIGNING_KEY HMAC for tamper-evident audit packs.
 *
 * Chain: link(i) = sha256(prev_link || sha256(step_i_canonical_json))
 * Signature: HMAC-SHA256(REPORT_SIGNING_KEY, final_link)
 */
import { createHash, createHmac } from 'node:crypto';

export interface StepHashInput {
  stepNumber: number;
  photoSha256?: string;
  verified?: boolean;
  confidence?: string;
  message?: string;
  detail?: string;
  timestamp?: string;
}

const ZERO_LINK = '0'.repeat(64);

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Canonical JSON: stable key order + no whitespace. */
function canonicalize(value: StepHashInput): string {
  const ordered: Record<string, unknown> = {};
  for (const key of [
    'stepNumber',
    'photoSha256',
    'verified',
    'confidence',
    'message',
    'detail',
    'timestamp',
  ] as const) {
    if (value[key] !== undefined) ordered[key] = value[key];
  }
  return JSON.stringify(ordered);
}

export function chainStep(prev: string, step: StepHashInput): string {
  return sha256Hex(prev + sha256Hex(canonicalize(step)));
}

export function buildHashChain(steps: StepHashInput[]): {
  links: string[];
  finalLink: string;
} {
  const links: string[] = [];
  let prev = ZERO_LINK;
  for (const step of steps) {
    prev = chainStep(prev, step);
    links.push(prev);
  }
  return { links, finalLink: prev };
}

export function signReport(finalLink: string, signingKey: string): string {
  return createHmac('sha256', signingKey).update(finalLink).digest('hex');
}

export function verifyReport(finalLink: string, signature: string, signingKey: string): boolean {
  return signReport(finalLink, signingKey) === signature;
}
