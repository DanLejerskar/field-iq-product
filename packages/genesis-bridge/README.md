# @field-iq/genesis-bridge

The connection point between Field IQ and Genesis. Returns reference content
(static image / animated SVG / 3D scene manifest) for any
`(procedureId, stepNumber, deviceKind)` triple. **Ships with mocked content
for the DAC #811 LOTO procedure** so the Monday demo runs without a real
Genesis API — the real swap is a one-line change in `lookup.ts`.

## Usage

### Backend route (eventual)

```ts
import { getReferenceFor } from '@field-iq/genesis-bridge';

app.get('/api/procedures/:procId/steps/:n/reference', async (req, reply) => {
  const { procId, n } = req.params;
  const device = (req.query.device ?? 'glasses') as 'glasses' | 'phone' | 'dashboard';
  const ref = await getReferenceFor(procId, Number(n), device);
  if (!ref) return reply.code(404).send({ error: 'no reference' });
  return ref;
});
```

The package also ships its `assets/` directory; mount it with `fastify-static`
under `/assets` so the URLs in the manifest resolve:

```ts
import staticPlugin from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const assetsRoot = resolve(
  dirname(fileURLToPath(import.meta.resolve('@field-iq/genesis-bridge/assets/'))),
);
await app.register(staticPlugin, { root: assetsRoot, prefix: '/assets/' });
```

### Dashboard usage (React)

```tsx
import { useEffect, useState } from 'react';
import { getReferenceFor, type Reference } from '@field-iq/genesis-bridge';

export function ReferencePanel({
  procedureId,
  stepNumber,
}: {
  procedureId: string;
  stepNumber: number;
}) {
  const [ref, setRef] = useState<Reference | null>(null);
  useEffect(() => {
    void getReferenceFor(procedureId, stepNumber, 'dashboard').then(setRef);
  }, [procedureId, stepNumber]);

  if (!ref) return null;
  return <img src={ref.url} alt={ref.captionVoice ?? ''} />;
}
```

### Glasses-webapp usage (Preact)

Same call, different device key — and animated steps loop naturally because
the SVG carries SMIL animations.

```tsx
const ref = await getReferenceFor('dac811-loto', stepNumber, 'glasses');
return <img src={ref.url} alt={ref.captionVoice} />;
```

## Reference contract

| Field           | Notes                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `stepId`        | Stable per-procedure-per-step identifier (e.g. `dac811-loto-step5`).                                         |
| `kind`          | `'image'`, `'gif'` (animated SVG), or `'scene3d'`.                                                           |
| `url`           | What the consumer renders. For `scene3d`, this URL serves the same JSON as `sceneManifest`.                  |
| `durationMs`    | Set only for `kind: 'gif'`.                                                                                  |
| `captionVoice`  | Short voice-over text — accessible labels + future TTS layer.                                                |
| `sceneManifest` | Pre-parsed `SceneManifest` for `scene3d`. The phone-companion-3d package translates it into Three.js meshes. |

## DAC #811 coverage

10 LOTO steps, three surfaces:

| Step | Title                   | Glasses | Phone (3D)  | Dashboard |
| ---- | ----------------------- | ------- | ----------- | --------- |
| 1    | Don PPE                 | image   | —           | image     |
| 2    | Identify equipment      | image   | —           | image     |
| 3    | Identify energy sources | image   | **scene3d** | image     |
| 4    | Stop the equipment      | image   | —           | image     |
| 5    | Open disconnect         | **gif** | **scene3d** | image     |
| 6    | Apply hasp              | image   | —           | image     |
| 7    | Apply padlock           | **gif** | —           | image     |
| 8    | Close ball valve        | **gif** | **scene3d** | image     |
| 9    | Attach LOTO tag         | image   | —           | image     |
| 10   | Verify zero energy      | image   | —           | image     |

Animated SVGs (5, 7, 8) use SMIL `<animateTransform>` / `<animate>` — no JS
required, no Lottie runtime, looks the same on the HUD and the dashboard.

## Mock-to-real swap

The single line in `lookup.ts`:

```ts
const provider: ReferenceProvider = mockProvider; // ← Phase 2F+ swaps this
```

Phase 2F+ writes a `genesisApiProvider` that fetches from the Genesis HTTP
API and swaps the const. Nothing else in this file, nor in any caller,
changes. `currentProvider()` is a test seam to assert which provider is
wired.

## Acceptance criteria (this PR)

1. `pnpm --filter @field-iq/genesis-bridge build` succeeds.
2. `pnpm --filter @field-iq/genesis-bridge test` passes; `lookup.ts` and
   `manifest.ts` have full functional coverage.
3. All 10 LOTO steps return a working glasses Reference.
4. Steps 3, 5, 8 return a phone Reference with `kind: 'scene3d'` and a
   non-null `sceneManifest`.
5. Mock-to-real swap is one line.
6. No files modified outside `packages/genesis-bridge/**` (plus the
   unavoidable `pnpm-lock.yaml` entry).
