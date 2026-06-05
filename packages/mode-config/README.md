# @field-iq/mode-config

The single source of truth for the Field IQ session-mode contract. Two
operating modes (`walkthrough` for trainees, `standby` for experienced
workers), one typed-config behaviour table, a pure-function policy, a
framework-agnostic hook factory with React + Preact entry points, and a
two-pill toggle component. The same procedure runs either way — only the UX
differs.

## Usage

### Dashboard (React 18+)

```ts
import { ModeToggle, useMode } from '@field-iq/mode-config/react';

function SessionStart() {
  const { mode, behavior, setMode } = useMode();
  return (
    <>
      <ModeToggle mode={mode} onChange={setMode} />
      <p>HUD power profile: {behavior.hudPowerProfile}</p>
    </>
  );
}
```

### Glasses-webapp (Preact 10+)

```ts
import { ModeToggle, useMode } from '@field-iq/mode-config/preact';

export function ModeChip() {
  const { mode, behavior, setMode } = useMode();
  return behavior.showReferenceProactively
    ? <ReferenceCard />
    : <ModeToggle mode={mode} onChange={setMode} />;
}
```

### Server / non-DOM consumers

```ts
import { behaviorFor, type SessionMode } from '@field-iq/mode-config';

function shouldEnqueueVerification(mode: SessionMode): boolean {
  return behaviorFor(mode).verifyEveryStep;
}
```

## The ModeBehavior contract

| Aspect                     | `walkthrough` (default — trainees)        | `standby` (experienced)                     |
| -------------------------- | ----------------------------------------- | ------------------------------------------- |
| Show reference proactively | Yes — HUD displays next step content auto | No — HUD shows indicator only               |
| Verify every step          | Yes — each step needs photo + verdict     | No — sampled, only on anomaly / request     |
| Voice always listening     | No — push-to-talk                         | Yes — hot-mic for "what's next" / "problem" |
| HUD power profile          | `high` (frequent renders)                 | `low` (1 Hz background)                     |
| Auto-advance on verified   | No — worker confirms via gesture          | Yes — silent advance                        |

These five booleans / enums are the entire `ModeBehavior` shape. Any consumer
asking "what should I do in this mode?" reads this object via
`behaviorFor(mode)` — never branches on the raw mode string.

## API surface

Core (no framework):

```ts
import {
  // types
  type SessionMode,
  type HudPowerProfile,
  type ModeBehavior,
  DEFAULT_MODE,
  SESSION_MODES,
  // policy
  behaviorFor,
  isValidMode,
  // persistence
  loadMode,
  saveMode,
  clearMode,
  STORAGE_KEY,
  // factories
  createUseMode,
  createModeToggle,
  type ModeToggleProps,
} from '@field-iq/mode-config';
```

Framework entries:

```ts
import { useMode, ModeToggle } from '@field-iq/mode-config/react';
import { useMode, ModeToggle } from '@field-iq/mode-config/preact';
```

Each framework entry also re-exports everything from the core entry so a
consumer needs only one import path.

## Why a factory, not a `.tsx` with `@jsxImportSource`

The JSX-pragma approach binds one runtime into the compiled output, so the
same JS can't be reused by both React and Preact consumers. The factory
approach takes `createElement` (React) or `h` (Preact) as a parameter and
returns the right tree at runtime — genuinely runtime-agnostic, and the
shared `createModeToggle` is the only place that knows the colour tokens and
keyboard handling.

## Acceptance criteria (this PR)

1. `pnpm --filter @field-iq/mode-config build` succeeds.
2. `pnpm --filter @field-iq/mode-config typecheck` succeeds.
3. `pnpm --filter @field-iq/mode-config test` passes; `policy.ts` has 100%
   function coverage.
4. `pnpm install` at repo root completes cleanly.
5. Zero files outside `packages/mode-config/**` modified (Yogi's separate PR
   integrates this package into the apps + backend schema).
