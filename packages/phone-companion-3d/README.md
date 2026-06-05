# @field-iq/phone-companion-3d

Mobile-optimized full 3D viewer for Field IQ. Reads `SceneManifest` data from
`@field-iq/genesis-bridge` and renders it via vanilla Three.js inside a
`<canvas>` that fills its parent. Built for the phone-companion PWA: rotate
with one finger, pinch to zoom, tap a component to read its label, double-tap
to reset the camera.

**Vanilla Three.js — no react-three-fiber.** The viewer is a framework-agnostic
imperative core (`createViewer`) wrapped by small component factories that
take a `createElement` and hook bundle. The same compiled JS is consumed by
both the React-based dashboard and the Preact-based glasses-webapp.

## Usage

### Glasses-webapp (Preact)

```tsx
import { PhoneSessionView } from '@field-iq/phone-companion-3d/preact';
import { getReferenceFor } from '@field-iq/genesis-bridge';

async function fetchScene(procId: string, n: number) {
  const ref = await getReferenceFor(procId, n, 'phone');
  return ref?.sceneManifest ?? null;
}

export function PhoneRoute({ sessionId, procedureId, currentStepNumber }) {
  return (
    <PhoneSessionView
      sessionId={sessionId}
      procedureId={procedureId}
      currentStepNumber={currentStepNumber}
      fetchScene={fetchScene}
    />
  );
}
```

### Dashboard (React) — preview the scene next to the live photo

```tsx
import { Viewer } from '@field-iq/phone-companion-3d/react';

export function ScenePreview({ scene }: { scene: SceneManifest }) {
  return (
    <div style={{ width: 320, height: 240 }}>
      <Viewer scene={scene} onComponentTap={(id) => console.log('tapped', id)} />
    </div>
  );
}
```

### Imperative core (no framework)

```ts
import { createViewer } from '@field-iq/phone-companion-3d';

const handle = createViewer(canvas, { scene, autoRotate: true });
handle.setScene(nextScene);
handle.setBackground('#000');
const hit = handle.pickAt(clientX, clientY);
handle.dispose();
```

## Component contracts

### Viewer

| Prop             | Type                           | Notes                                                                |
| ---------------- | ------------------------------ | -------------------------------------------------------------------- |
| `scene`          | `SceneManifest`                | Required. Re-renders the scene tree when the prop reference changes. |
| `onComponentTap` | `(id: string \| null) => void` | Fires for single taps. `null` when the tap missed every component.   |
| `autoRotate`     | `boolean`                      | Slow Y-axis spin when idle. Default `false`.                         |
| `background`     | `string`                       | Background colour. Default `#0B1F4D` (EON navy).                     |
| `disabled`       | `boolean`                      | Disable all input. Default `false`.                                  |

### PhoneSessionView

| Prop                | Type                                            | Notes                                                                         |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `sessionId`         | `string`                                        | For the `aria-label` only.                                                    |
| `procedureId`       | `string`                                        | Shown in the top bar. Triggers `fetchScene` on change.                        |
| `currentStepNumber` | `number`                                        | Shown in the top bar. Triggers `fetchScene` on change.                        |
| `fetchScene`        | `(procId, n) => Promise<SceneManifest \| null>` | Called whenever the step changes. Return `null` for steps without a 3D scene. |

## Touch controls

| Gesture          | Action                                                            |
| ---------------- | ----------------------------------------------------------------- |
| One-finger drag  | Orbit camera around scene origin.                                 |
| Two-finger pinch | Zoom (camera distance to origin).                                 |
| Single tap       | Raycast → `onComponentTap` with the hit component id (or `null`). |
| Double tap       | Reset camera to the manifest defaults.                            |

`touch-action: none` on the canvas, so the page won't scroll while orbiting.

## Headless mode

When `WebGLRenderer` construction throws (jsdom under vitest, or browsers
without WebGL), the viewer falls back to a no-op renderer. The Three.js
scene tree is still built, the raycaster still works, and `dispose()` still
cleans up — only the GL render is skipped. Lets us unit-test orchestration
without a graphics stack.

## Acceptance criteria (this PR)

1. `pnpm --filter @field-iq/phone-companion-3d build` succeeds (dist ~184 KB).
2. `pnpm --filter @field-iq/phone-companion-3d test` passes (23 tests).
3. The bundled `step05_disconnect.scene.json` from genesis-bridge produces
   a valid Three.js scene with 3 component meshes.
4. Raycasting picks the right component for known camera positions.
5. The viewer constructs + disposes cleanly in jsdom (headless mode).
6. No files modified outside `packages/phone-companion-3d/**` (plus
   `pnpm-lock.yaml`).
