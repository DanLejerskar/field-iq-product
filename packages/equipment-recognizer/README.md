# @field-iq/equipment-recognizer

Given a photo from a worker's camera, returns which seeded piece of
equipment they're standing in front of. Two paths:

1. **Vision** — Claude Sonnet 4.6 image-recognition against a catalog of
   known equipment with descriptions + visual markers.
2. **QR** — pure-JS QR decoder (jsQR + pngjs) plus a `qrValue → equipmentId`
   mapping; guaranteed fallback when the printed sticker is in frame.

Returns a `Recognition` record the backend uses to look up the right
procedure. If both paths miss, returns `{ source: 'none', equipmentId: null }`
so the consumer can prompt "Unknown equipment — scan a QR code or move closer."

## Usage

### Backend route

```ts
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_CATALOG, DEFAULT_QR_MAPPING, recognize } from '@field-iq/equipment-recognizer';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/api/recognize', async (req) => {
  const { photoDataUri } = req.body as { photoDataUri: string };
  return recognize(photoDataUri, {
    vision: { anthropic, catalog: DEFAULT_CATALOG },
    qr: { mapping: DEFAULT_QR_MAPPING },
  });
});
```

### Single-path callers

If you only need one path:

```ts
import { recognizeFromPhoto, decodeQr } from '@field-iq/equipment-recognizer';

// Vision only — no fallback.
const vision = await recognizeFromPhoto(dataUri, { anthropic, catalog: DEFAULT_CATALOG });

// QR only — no Claude call.
const qr = await decodeQr(dataUri, { mapping: DEFAULT_QR_MAPPING });
```

## The Recognition contract

| Field         | Notes                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------- |
| `equipmentId` | Matched ID string from the catalog, or `null` on miss.                                       |
| `source`      | `'vision'`, `'qr'`, or `'none'` — which path produced the answer.                            |
| `confidence`  | `1.0` for QR matches; Claude's reported score for vision; `0` for `'none'`.                  |
| `detail`      | Free-form: QR raw decoded string, or short Claude reasoning. Used for debugging + audit log. |

## Orchestration

`recognize()` runs vision first. If it returns an `equipmentId` with
`confidence ≥ threshold` (default `0.7`, override via
`confidenceThreshold`), it returns that. Otherwise it tries QR; if QR
returns an `equipmentId`, it returns that. Otherwise — but with the small
twist of preferring a non-zero-confidence vision result over an empty
`'none'`, so the audit log still captures Claude's reasoning when nothing
matched.

## Adding a new equipment family

```ts
import { DEFAULT_CATALOG, DEFAULT_QR_MAPPING } from '@field-iq/equipment-recognizer';

const catalog = [
  ...DEFAULT_CATALOG,
  {
    equipmentId: 'PUMP-SKID-42',
    description: '20 HP centrifugal pump on a skid with VFD enclosure.',
    visualMarkers: ['gray pump body', 'VFD enclosure ~3 ft tall', 'red emergency stop'],
  },
];
const mapping = { ...DEFAULT_QR_MAPPING, 'EON-PUMP-SKID-42': 'PUMP-SKID-42' };

await recognize(photo, { vision: { anthropic, catalog }, qr: { mapping } });
```

The package is intentionally not coupled to the DB or the schema's branded
`EquipmentId` — callers map the loose string into their own domain.

## Peer dependency

`@anthropic-ai/sdk` is a peer dependency (optional). Consumers using only
the QR path can skip it; consumers using the vision path pin whichever SDK
version the rest of their codebase uses. Today the Field IQ verifier
service (Python) pins `anthropic>=0.40`; the Node backend doesn't yet
depend on the SDK — when Yogi wires up `POST /api/recognize`, the backend
gains its own dep at whatever version is current.

## QR decoding scope (v1)

PNG-only. The camera capture layer in the glasses-webapp + companion app
encodes captures as PNG before posting. JPEG support would need an
additional pure-JS JPEG decoder; deferred until something asks for it.

## Acceptance criteria (this PR)

1. `pnpm --filter @field-iq/equipment-recognizer build` succeeds.
2. `pnpm --filter @field-iq/equipment-recognizer test` passes (32 tests).
3. A QR-bearing fixture decodes to `{equipmentId:'DAC-811-01', source:'qr', confidence:1.0}`.
4. A high-confidence vision response returns vision result without consulting QR.
5. Low-confidence vision falls back to QR.
6. Total miss returns `'none'`.
7. No files modified outside `packages/equipment-recognizer/**` (plus
   `pnpm-lock.yaml`).
