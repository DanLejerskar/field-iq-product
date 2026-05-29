# `@field-iq/companion`

React Native (Expo) companion app for the EON Field IQ technician (Maya).
Pairs with the Meta Ray-Ban Display through the **Meta Wearables Device Access
Toolkit** (DAT), captures verification photos, mirrors the HUD on the phone,
and queues uploads when the network drops.

## Architecture

- **Native bridges** (DAT SDK):
  - `ios/MetaGlassesModule.swift` (+ `.m` bridge header) for iOS
  - `android/.../MetaGlassesModule.kt` (+ `MetaGlassesPackage.kt`) for Android
- **JS surface**: shared TS interface in `src/native/MetaGlassesModule.ts`; the
  exported `MetaGlasses` automatically falls back to `MetaGlassesModule.mock.ts`
  whenever the native module isn't linked (Expo Go, the test runner,
  unsupported devices).
- **Offline upload queue** (`src/api/queue.ts`) persists `PendingUpload`s to
  `react-native-mmkv` and drains them on `NetInfo`'s `connected` event.
- **WebSocket mirror** (`src/api/ws.ts`) subscribes to the same `session:<id>`
  channel the glasses Web App uses, so the phone shows the same step state.
- **State** with Zustand (`src/state/stores.ts`); the pure reducers in
  `src/state/session.ts` and `src/api/queue.ts` are unit-tested with `vitest`.
- **Auth**: magic-link via the backend's `/api/auth/magic-link/*`; JWT lives in
  MMKV. Deep link: `fieldiq://login?token=...`.

## Dev (Mac)

```bash
pnpm install
pnpm --filter @field-iq/companion prebuild       # generate ios/ + android/
pnpm --filter @field-iq/companion ios            # boot in iOS simulator
pnpm --filter @field-iq/companion android        # boot on Android emulator
```

The DAT SDK is added during `prebuild`:

- **iOS**: append `pod 'MetaWearablesDAT'` to the generated `ios/Podfile`, then
  `cd ios && pod install`. Replace the `TODO(meta-sdk-link)` stubs in
  `MetaGlassesModule.swift` with calls into `MetaWearables.*`.
- **Android**: add the gradle coordinate
  `implementation 'com.facebook.meta.wearables:dat:<version>'` to
  `android/app/build.gradle`. Replace the `TODO(meta-sdk-link)` stubs in
  `MetaGlassesModule.kt`.

Both bridges are skeletoned so the JS layer compiles + runs immediately on the
mock; flip to the real SDK without touching any JS.

## Tests (runnable here)

```bash
pnpm --filter @field-iq/companion test
```

Covers the upload queue (idempotent enqueue, FIFO drain, resume after failure,
survives restart), the session-mirror reducer, and the auth store. No RN
runtime required.

## Distribution

`eas.json` defines four profiles:

| Profile           | Distribution                  |
| ----------------- | ----------------------------- |
| `development`     | dev client (Expo Go-ish)      |
| `preview-ios`     | TestFlight internal           |
| `preview-android` | Firebase App Distribution APK |
| `production`      | TestFlight + Play internal    |

`eas submit -p production --profile production` requires `APPLE_DEVELOPER_TEAM_ID`
and `ANDROID_KEYSTORE_*` from `.env.local` (M0 deferred those).
