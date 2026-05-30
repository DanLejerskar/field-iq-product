# Hardware integration — Meta Ray-Ban Display + Neural Band

Operator runbook for taking the Phase-1 stack from the all-mock dev loop to
real Ray-Ban Display + Neural Band hardware. Everything in this doc is
authored against the file tree that already lives in this repo — no rewrites
required when the SDK lands.

Companion docs:

- `META_SDK_LANDSCAPE.md` — confirmed Meta SDK landscape (DAT + Web Apps).
- `VISION_TO_REALIZATION_SPEC.md §3` — plain-English architecture summary.
- `apps/companion/README.md` — companion + native-bridge specifics.
- `apps/glasses-webapp/README.md` — HUD Web App build + deployment notes.

---

## 1. Wearables Developer Center registration

Register **EON AI Ventures** as the organization that owns every project:

1. Sign up at <https://wearables.developer.meta.com/signup/landing/>. Use a
   shared `developer@eonreality.com` mailbox (managed Meta account, _not_ a
   personal Meta account).
2. Create one organization named **EON AI Ventures** during onboarding —
   matches the `SEED_ORG.name` we already use across the schema and the seed.
3. Invite at least one backup owner.
4. Subscribe to release notifications at
   <https://developers.meta.com/wearables/notify> — Updates 125+ shape the
   SDK surface that the bridges in this repo target.

Useful refs while configuring:

- Onboarding + org management:
  <https://wearables.developer.meta.com/docs/onboarding-and-organization-management>
- Project registration:
  <https://wearables.developer.meta.com/docs/manage-projects>

---

## 2. Two projects to register

Register one Wearables project per surface so permissions stay scoped.

| Project                  | Purpose                                   | Surface           |
| ------------------------ | ----------------------------------------- | ----------------- |
| `eon-field-iq-companion` | Native iOS/Android app + DAT camera/audio | DAT SDK           |
| `eon-field-iq-hud`       | The Web App that runs on the display      | Web Apps platform |

Permissions to request on the companion project:

- Camera (still photos; LOTO v1 doesn't need video)
- Microphone (kept off-by-default; only for Phase 2 voice features)
- Bluetooth pairing / device control
- Persistent connection (so the app can stay paired while in the foreground)

Permissions to request on the HUD project:

- Display (HTML/CSS/JS rendering)
- Neural Band input (pinch, swipes)
- Motion / orientation (deferred — Phase 2 anchoring)

---

## 3. Glasses + Neural Band setup (per pair)

Once per device pair, in the Meta AI app on the paired phone:

1. **Enable Developer Mode.** Hamburger → App Info → tap the version number 5×
   → toggle Developer Mode → install the dev update when prompted.
2. **Pair the Ray-Ban Display + Neural Band** to the phone over Bluetooth.
3. **Add the HUD Web App** under App Settings → App connections → Add a Web
   App → paste the password-protected URL (see §6).
4. **Add the companion native app** under App connections → Install via the
   release channel you set up in step 4 of §1.

Reference: <https://wearables.developer.meta.com/docs/getting-started-toolkit>

---

## 4. Pairing flow at runtime (companion → glasses)

`apps/companion/src/native/index.ts:selectMetaGlasses()` already picks the
real native bridge over the mock at runtime when
`NativeModules.MetaGlasses` is present. The bridge surface is:

```ts
pairDevice(): Promise<PairedDevice>
getPairedDevice(): Promise<PairedDevice | null>
capturePhoto(): Promise<CapturedPhoto>
getBatteryLevel(): Promise<number>
onConnectionChange(cb): Unsubscribe
```

End-to-end sequence on first use:

1. Maya opens the companion → `/pair` screen.
2. Companion calls `MetaGlasses.pairDevice()` → native bridge calls into
   `MetaWearables.DeviceManager` (iOS) / `com.facebook.meta.wearables.dat`
   (Android).
3. Bridge emits `MetaGlasses.connection` events
   (`connecting → paired → streaming → paired`).
4. The DAT SDK negotiates BLE GATT services, exchanges the Wearables-issued
   device key, and persists the pairing.
5. The companion's session screen calls `capturePhoto()` for each LOTO step.

### BLE service UUIDs

The Wearables SDK does **not** publicly document its GATT service UUIDs — the
DAT SDK abstracts them behind `DeviceManager.discover()`. The UUIDs are
exposed only as opaque constants in the SDK headers; the bridge code in
`apps/companion/ios/MetaGlassesModule.swift` and
`apps/companion/android/.../MetaGlassesModule.kt` calls the SDK abstraction
rather than raw BLE. **Do not hard-code the UUIDs** even if discovered —
they can change between SDK releases.

When the SDK lands, log the discovered service UUIDs once via the bridge
(see the `TODO(meta-sdk-link)` markers) and capture them in a private
hardware-bench notebook for triaging field issues.

---

## 5. Flip-the-flag checklist (M7 native bridges → live SDK)

Every change is co-located with a `TODO(meta-sdk-link)` marker so a
quick `git grep -n 'TODO(meta-sdk-link)'` from `apps/companion` enumerates
the full list.

### iOS (`apps/companion/ios/MetaGlassesModule.swift`)

1. Add `pod 'MetaWearablesDAT'` to the generated `Podfile` (or vendor the
   `.xcframework` into `ios/Frameworks/`), then `cd ios && pod install`.
2. Uncomment `import MetaWearablesDAT` and `private var deviceManager:
MWDeviceManager?`.
3. Replace each method body's stub block with the real SDK call (see
   examples in the comments).
4. Forward DAT connection callbacks through `sendEvent(withName: "MetaGlasses.connection", ...)`.

### Android (`apps/companion/android/.../MetaGlassesModule.kt`)

1. Add `implementation 'com.facebook.meta.wearables:dat:<version>'` to
   `android/app/build.gradle`.
2. Uncomment the import and replace the stubs (one per method) with calls
   into `DeviceManager` + the glasses `Camera`.
3. Emit `MetaGlasses.connection` events via `DeviceEventManagerModule`.

### JS feature flag (kill-switch for QA)

If you need to force the mock even on a native build (e.g. an integration
demo while waiting on a firmware fix), `selectMetaGlasses()` can be hard-
gated by `EXPO_PUBLIC_USE_REAL_DAT=false` — see the comment in
`apps/companion/src/native/index.ts`.

---

## 6. Password-protected URL deployment for the HUD Web App

The Web App needs to live at a stable HTTPS URL accessible to the glasses.
Meta requires HTTPS; password protection prevents accidental discovery of
preview builds.

### Recommended setup

| Stage       | Host                                              | Auth                             |
| ----------- | ------------------------------------------------- | -------------------------------- |
| Dev (local) | `https://localhost:3001` via `mkcert`             | none                             |
| Staging     | `https://glasses.staging.field-iq.eonreality.com` | Cloudflare Access (one-time PIN) |
| Production  | `https://glasses.field-iq.eonreality.com`         | Cloudflare Access SSO            |

### Build + deploy

```bash
pnpm --filter @field-iq/glasses-webapp build
# Upload apps/glasses-webapp/dist/ to the bucket fronted by Cloudflare
```

Bundle target is < 200 KB gzipped; current build is **~9 KB**. Set strict
`Content-Security-Policy: default-src 'self'` and `X-Frame-Options: DENY`
on the bucket origin — Meta documents these as expected by the Web Apps
platform.

### Onboarding via QR (per trainer)

In the EON Admin app (Phase 2) we'll generate a per-trainee QR that encodes:

```
metaapp://addweb?url=https%3A%2F%2Fglasses.field-iq.eonreality.com%2F%23token%3D<jwt>
```

For Phase 1 the trainer hand-types the URL into the Meta AI app and pastes
the trainee's JWT into the URL fragment.

---

## 7. Release channels (Meta — up to 100 testers)

Per <https://wearables.developer.meta.com/docs/set-up-release-channels>:

1. Create three channels in the Developer Center: `internal`, `trainer-bay`,
   `pilot-customer`.
2. Add EON staff (≤10) to `internal`.
3. Add Carlos + Priya + Maya (and the trainer-bay simulator users) to
   `trainer-bay`.
4. `pilot-customer` stays empty until the first external pilot starts
   (Phase 2).

The 100-tester cap aligns with the Phase-1 acceptance plan — we don't need
to publish to the App Store yet.

---

## 8. Distribution checklist

Before handing devices to a trainer:

- [ ] Phone has the latest companion build from EAS (Mac runs `pnpm --filter
@field-iq/companion ios|android` against the configured profile in
      `apps/companion/eas.json`).
- [ ] Glasses are on the latest firmware with Developer Mode enabled.
- [ ] HUD Web App URL added in Meta AI app → App Connections.
- [ ] `JWT_SIGNING_SECRET` + `REPORT_SIGNING_KEY` are the prod values
      (per `.env.local` on the deployment host).
- [ ] `ANTHROPIC_API_KEY` is set and the Python verifier has
      `VERIFIER_MOCK=false`.
- [ ] Postgres + Redis + S3 are reachable from the backend container.
- [ ] `docs/hardware-integration.md` (this file) printed and on-hand at the
      training bay for first-time pairing.

---

## 9. Troubleshooting

| Symptom                               | Probable cause                        | Action                                                                     |
| ------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| Companion shows `No device paired`    | Bluetooth permission denied           | Settings → Bluetooth → enable for the companion app; retry pair.           |
| `capturePhoto` returns `not_linked`   | Native SDK isn't linked on this build | Run `pnpm --filter @field-iq/companion prebuild`, then `pnpm ios/android`. |
| HUD shows blank card                  | Token expired or URL wrong fragment   | Trainer reissues a fresh JWT; updates the URL fragment.                    |
| Verifier returns "VERIFIER_MOCK=true" | Live mode not enabled                 | Set `VERIFIER_MOCK=false` + `ANTHROPIC_API_KEY` on the verifier host.      |
| Dashboard stays at "connecting…"      | WS gateway unreachable                | Confirm `WS_HOST` env, check `/ws` endpoint via `curl --include`.          |

---

## 10. Open items deferred to Phase 2

- Continuous-frame access from the glasses (Phase 2 SDK preview) — replaces
  the QR step with on-glasses CV equipment identification.
- HUD overlays anchored to physical components.
- Live remote expert assist (trainer joins via glasses POV video).
- LMS push (xAPI / Tin Can) into EON Genesis.
- Group lockout flow.
- Production publishing to the Meta app catalog when GA opens.

End of runbook.
