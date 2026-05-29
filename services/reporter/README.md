# `@field-iq/reporter`

Renders the EON Field IQ LOTO audit report as a signed PDF.

- Server-rendered React template (`src/templates/SessionReport.tsx`) → HTML →
  Puppeteer-printed PDF.
- Cover · step-by-step record · trainer notes · **OSHA 29 CFR 1910.147**
  compliance summary · audit chain integrity · signature block.
- SHA-256 hash chain over canonical per-step JSON; HMAC-SHA256 signature of the
  final link using `REPORT_SIGNING_KEY`.
- Letter + A4 layouts (driven by `@page` rules + Puppeteer's `format`).

## Run

```bash
pnpm --filter @field-iq/reporter dev   # HTTP /render on :3010 + report-queue worker
```

Requires `DATABASE_URL`, `REDIS_URL`, `S3_*`, `REPORT_SIGNING_KEY` from `.env.local`
(`pnpm run setup` generates the signing key automatically).

## Tests

```bash
pnpm --filter @field-iq/reporter test
```

Covers the OSHA mapping (every step 1..10 has at least one citation, format
constraints on the paragraph string), the hash-chain (deterministic,
order-sensitive, tamper-sensitive), the HMAC signature round-trip, and the
React template (all 10 step cards + the OSHA section + the signature render).

Puppeteer's Chromium isn't required for these tests — they exercise the pure
template + signing code paths. The full `renderPdf()` smoke runs when the
service boots and there's a Chromium binary available.
