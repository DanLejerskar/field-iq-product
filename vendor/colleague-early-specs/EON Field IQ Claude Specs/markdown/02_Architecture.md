# EON Field IQ — Technical Architecture Specification

**Document owner:** EON Reality
**Status:** Implementation-ready (v1.0)
**Last updated:** May 19, 2026
**Companion docs:** `01_PRD.md`, `03_LOTO_Test_Case.md`, `04_Implementation_Plan.md`, `05_CLAUDE.md`

---

## 1. System overview

EON Field IQ is a four-tier system. Reading top to bottom is the user request path; reading bottom to top is the data/audit path.

```
┌──────────────────────────────────────────────────────────────────────┐
│  TIER 1 — Glasses                                                    │
│  Meta Ray-Ban Display + Meta Neural Band                             │
│  ├─ Field IQ Web App (HTML/CSS/JS) — runs natively on glasses        │
│  └─ Native camera capture via Meta Wearables Device Access Toolkit   │
└──────────────────────────────────────────────────────────────────────┘
            ▲                                       │
            │  WebSocket (verdicts, next step)      │  HTTPS (photo)
            │                                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  TIER 2 — Companion phone (React Native, iOS + Android)              │
│  ├─ Native bridge to Meta Wearables Device Access Toolkit            │
│  ├─ QR decoding, session mirror, offline queue                       │
│  └─ Auth, device pairing, settings                                   │
└──────────────────────────────────────────────────────────────────────┘
            ▲                                       │
            │  WebSocket + REST                     │  REST + WebSocket
            │                                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  TIER 3 — Backend (Node.js / Fastify + Python verification worker)   │
│  ├─ REST API (auth, sessions, content, reports)                      │
│  ├─ WebSocket gateway (live session events)                          │
│  ├─ Verification worker (Python) — Claude Sonnet 4.6                 │
│  ├─ PostgreSQL (sessions, audit log, content)                        │
│  ├─ Object storage (S3-compatible) for photos                        │
│  └─ Redis (queues, pub/sub, session cache)                           │
└──────────────────────────────────────────────────────────────────────┘
            ▲                                       │
            │                                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  TIER 4 — Supervisor dashboard + Admin (React + Vite)                │
│  ├─ Live session monitor                                             │
│  ├─ Historical session browser + PDF export                          │
│  └─ Content authoring (Equipment, Procedure, Step, Prompts)          │
└──────────────────────────────────────────────────────────────────────┘
```

The architecture is deliberately split between the **Web App on the glasses** (display + Neural Band input only, no camera in v1 of the Web Apps SDK) and the **React Native companion app** (which has full Device Access Toolkit privileges including camera). The backend stitches them together via WebSocket so the technician experiences a single seamless session.

## 2. Why this split

Meta's developer preview (May 2026) ships two SDK paths with non-overlapping capabilities:

| Capability | Web Apps (HTML/CSS/JS on glasses) | Device Access Toolkit (native mobile SDK) |
|---|---|---|
| Run code directly on glasses display | ✅ | ❌ (mobile app pushes UI to glasses) |
| Display custom UI on HUD | ✅ (text, images, lists, buttons) | ✅ (text, images, lists, buttons, video) |
| Camera access | ❌ (v1 of Web Apps) | ✅ (12 MP photos; 720p@30fps video stream over Bluetooth) |
| Microphone / speakers | ❌ direct (Web Apps); voice commands stay with Meta AI | ✅ via iOS/Android Bluetooth profiles |
| Neural Band input | ✅ (left/right/up/down swipe, index pinch = enter, middle pinch = cancel) | Via Meta AI app, indirectly |
| Motion/orientation, GPS (from phone), local storage | ✅ | ✅ |
| Distribution | Password-protected URL added via Meta AI app in Developer Mode | Release channels, up to 100 testers |

Therefore the **Web App is responsible for everything the user sees on the HUD**, and the **companion app is responsible for everything the glasses sensors capture**. They communicate through the backend (the source of truth for session state), not directly.

This split has the additional benefit that the Web App is portable to other display glasses Meta ships (Oakley Meta HSTN, future devices) without code changes — Meta has stated the Wearables SDK will support its full AI glasses portfolio.

## 3. Component breakdown

### 3.1 Field IQ Web App (glasses)

- **Stack:** Vanilla HTML/CSS/JavaScript, or a lightweight framework like Preact + Vite if bundle size stays under ~200 KB. Avoid React proper for the glasses-side app — the per-frame overhead is wasted on a HUD that updates a handful of times per minute.
- **Hosted at:** `https://glasses.field-iq.eonreality.com/` (added to glasses via Meta AI app → App Settings → App connections → Add a Web App).
- **Auth:** Bearer token in URL fragment on initial load (`#token=...`), exchanged for a session-scoped WebSocket connection. Tokens are short-lived and pinned to the device's paired user.
- **State management:** All authoritative state lives on the backend; the Web App is a thin view layer. The only local state is "is the WebSocket connected" and "show this step card."
- **Input model:**
  - Index-finger pinch → fire `session.advance` (only after backend reports `step.verified=true`).
  - Middle-finger pinch → open the "cancel session?" confirm card; second middle pinch confirms abort.
  - Left/right swipe → flip through reference images attached to the current step.
  - Up/down swipe → scroll long instruction text within a card.
- **Render contract:** Every screen is a single card, ≤3 lines of body text, optional 320×320 reference image, large status indicator on the right edge.
- **Constraints honored:** No `localStorage` containing sensitive data (per Meta's privacy guidance); no third-party trackers; all assets served from the same origin.

### 3.2 React Native companion app

- **Stack:** React Native 0.76+ (new architecture), TypeScript, Expo Router for navigation, Zustand for state, TanStack Query for server state, react-native-mmkv for offline storage, react-native-camera (only for QR scanning of physical equipment when glasses are not paired).
- **Native bridges:**
  - **iOS:** Swift bridge that wraps `meta-wearables-dat-ios` and exposes `capturePhoto()`, `startVideoStream()`, `pairDevice()`, `getPairedDevice()`, `getBatteryLevel()` to JavaScript.
  - **Android:** Kotlin bridge equivalent using `meta-wearables-dat-android`.
  - Both wrap the same TS interface (`MetaGlassesModule`) so the React Native code is platform-agnostic.
- **Background behavior:** App stays in foreground during an active session (iOS doesn't allow indefinite background camera access; the technician is wearing the glasses anyway). Phone screen shows a "Session in progress — step N of M" mirror with manual override controls.
- **Offline queue:** Photos are written to MMKV with metadata; an uploader worker drains the queue when network returns. Sessions started offline are flagged and re-verified when online.
- **Auth:** OAuth2 / OIDC. Initial v1: magic-link email per technician. SSO is Phase 2.
- **Distribution v1:** TestFlight (iOS) and Firebase App Distribution / Internal Testing (Android) under the developer preview cap.

### 3.3 Backend

#### 3.3.1 Process layout

- **api** — Node.js 22 + Fastify, REST + WebSocket. Stateless; horizontally scalable. Behind a load balancer.
- **verifier** — Python 3.12 worker. Subscribes to a Redis queue, calls Anthropic Messages API, writes results back. Python (not Node) because we expect to add image preprocessing and on-prem fallback models later, and the Python ML ecosystem is stronger for that.
- **reporter** — Node.js worker. Generates PDF audit reports on demand (using `puppeteer` against a server-rendered React report template).
- **scheduler** — lightweight cron/Bree worker for retention sweeps, session timeouts, daily KPI rollups.

#### 3.3.2 Data model (PostgreSQL)

```sql
-- Organization & access
organizations (id uuid pk, name text, created_at, settings jsonb)
users         (id uuid pk, org_id fk, email citext unique, full_name, role enum,
               phone, password_hash, created_at, last_login_at, is_active bool)
devices       (id uuid pk, org_id fk, serial text, type enum('glasses','phone'),
               paired_user_id fk users, paired_at, last_seen_at)

-- Content
equipment     (id uuid pk, org_id fk, name text, asset_tag text, qr_code_value text unique,
               description, location, photo_url, created_at, metadata jsonb)
procedures    (id uuid pk, equipment_id fk, name text, version semver,
               description, total_steps int, is_active bool, created_at, created_by fk users)
steps         (id uuid pk, procedure_id fk, step_number int, title text,
               instruction text, reference_image_url, verification_required bool,
               verification_prompt text, success_criteria text, retry_threshold int default 3,
               skippable bool default false, expected_duration_seconds int)

-- Runtime
sessions      (id uuid pk, org_id fk, equipment_id fk, procedure_id fk,
               procedure_version semver, technician_user_id fk users,
               status enum('active','completed','abandoned','failed'),
               current_step_id fk steps nullable, started_at, completed_at,
               duration_seconds int, started_lat numeric, started_lng numeric)
session_steps (id uuid pk, session_id fk, step_id fk, step_number int,
               status enum('pending','in_progress','verified','retrying','skipped','failed'),
               started_at, completed_at, retry_count int default 0)

-- Append-only audit
audit_log     (id uuid pk, session_id fk, step_id fk, step_number int,
               event_type enum('photo_submitted','verified','retry','skip','start','complete','abandon'),
               photo_url text, photo_sha256 char(64),
               claude_request_id text, claude_response jsonb,
               verified bool, confidence text, message text, detail text,
               timestamp timestamptz default now(),
               latitude numeric, longitude numeric,
               superseded_by uuid fk audit_log nullable)

-- KPI rollups (denormalized for dashboard speed)
session_kpis  (session_id pk, first_pass_rate numeric, retries int, duration_seconds int,
               completed_steps int, total_steps int, computed_at)
```

`audit_log` is append-only. Any correction (e.g., a supervisor overrides a "retry" verdict) writes a new row and sets `superseded_by` on the prior row. The PDF report walks the chain and shows both the original verdict and the override.

#### 3.3.3 Photo storage

S3-compatible bucket (AWS S3, Cloudflare R2, or MinIO on-prem). Photos are stored at `s3://field-iq/{org_id}/{session_id}/{step_number}-{uuid}.jpg`. The backend issues short-lived signed URLs for both the verifier and the dashboard. Photos are also hashed (SHA-256) and the hash recorded in `audit_log` for tamper detection.

#### 3.3.4 Queue & realtime

Redis 7 (or AWS ElastiCache equivalent). Two structures:

- `verification_queue` (Redis Streams) — items: `{ session_id, step_id, photo_s3_key, prompt }`. The verifier worker consumes; multiple instances OK.
- `session:{session_id}:events` (Redis Pub/Sub) — every state change publishes a JSON event. WebSocket gateway subscribes per connected client.

### 3.4 Supervisor dashboard + Admin

- **Stack:** React 19, Vite, TanStack Query, TanStack Router, Tailwind + ShadCN UI, Recharts for KPI charts.
- **Hosted at:** `https://app.field-iq.eonreality.com/` (dashboard at `/`, admin at `/admin`).
- **Realtime:** WebSocket subscription to org-scoped event stream; live cards animate in as `verified` events arrive.

## 4. External integrations

| System | Purpose | Notes |
|---|---|---|
| **Meta Wearables Device Access Toolkit (iOS + Android)** | Camera capture, device pairing | GitHub: `facebook/meta-wearables-dat-ios`, `facebook/meta-wearables-dat-android`. Developer preview; distribute via release channels (≤100 testers in v1). |
| **Meta Web Apps platform** | HUD rendering, Neural Band input | Add via Meta AI app → App Settings → App connections → Add a Web App. Password-protected deeplink supported. |
| **Anthropic Messages API** | Photo verification | Model: `claude-sonnet-4-6`. Vision input via base64 or signed URL. JSON-mode output. API key per environment in secrets manager. |
| **Object storage (S3)** | Photo persistence | Server-side encryption at rest, lifecycle policy for retention. |
| **PostgreSQL 16** | All structured data | Managed (e.g., AWS RDS, Cloud SQL, Supabase). |
| **Redis 7** | Queue + pub/sub | Managed (ElastiCache, Upstash). |
| **Email (SES / Postmark)** | Magic-link auth, report delivery | Configurable per org. |
| **Optional — Customer LMS** | Push completion events | Phase 2 (xAPI/Tin Can). |

## 5. API contract (v1, REST)

All routes are prefixed `/api/v1`. Authentication: `Authorization: Bearer <jwt>`. JSON in, JSON out. Errors follow RFC 7807 (`application/problem+json`).

### 5.1 Auth

```
POST /auth/magic-link       { email }                         → 204
POST /auth/magic-link/exchange  { token }                     → { jwt, user, org }
POST /auth/refresh          { refresh_token }                 → { jwt }
POST /auth/logout                                             → 204
```

### 5.2 Devices

```
POST /devices/pair          { serial, type }                  → { device }
GET  /devices/me                                              → { device, paired_user }
PATCH /devices/:id          { ... }                           → { device }
```

### 5.3 Equipment & procedures (read paths for the runtime; write paths under /admin)

```
GET  /equipment                                               → [{equipment}]
GET  /equipment/by-qr/:qrValue                                → { equipment, active_procedure }
GET  /procedures/:id                                          → { procedure, steps[] }
```

### 5.4 Sessions

```
POST /sessions
  body: { equipment_id, procedure_id, technician_user_id, lat, lng }
  → { session, first_step }

GET  /sessions/:id                                            → { session, steps[] }

POST /sessions/:id/photo
  multipart: { photo (binary), step_id, captured_at, lat?, lng? }
  → { audit_log_entry_id, queued_for_verification: true }
  side effect: enqueues verification job; result delivered via WebSocket

POST /sessions/:id/advance                                    → { session, next_step }
POST /sessions/:id/retry      { step_id }                     → { session, step }
POST /sessions/:id/skip       { step_id, reason }             → { session, next_step }   (only if step.skippable)
POST /sessions/:id/abandon    { reason }                      → { session }
POST /sessions/:id/complete                                   → { session, report_url }
```

### 5.5 Reports

```
GET  /reports/session/:id                                     → 200 application/pdf
GET  /reports/session/:id.json                                → { report payload for custom rendering }
POST /reports/bulk           { session_ids[] | filter }       → { job_id }
GET  /reports/bulk/:job_id                                    → { status, download_url? }
```

### 5.6 Admin (CRUD, omitted for brevity)

```
/admin/organizations, /admin/users, /admin/equipment, /admin/procedures, /admin/steps
POST /admin/steps/:id/test-prompt   multipart: { photo }      → { claude_response }
```

## 6. WebSocket contract

Connect to `wss://api.field-iq.eonreality.com/v1/ws?token=<jwt>`. After connect, subscribe to channels:

```
client → server:  { type: "subscribe", channel: "session:<session_id>" }
                  { type: "subscribe", channel: "org:<org_id>:sessions" }   # dashboard
```

Server events (all include `ts` and `session_id`):

```
{ type: "session.started",   step: {...} }
{ type: "photo.received",    step_id, audit_id }
{ type: "verification.start", step_id, audit_id }
{ type: "verification.result", step_id, audit_id, verified, confidence, message, detail }
{ type: "step.advanced",     step: {...} }
{ type: "session.completed", session: {...}, report_url }
{ type: "session.abandoned", reason }
{ type: "error",             code, message }
```

The Web App on the glasses and the companion phone both subscribe to `session:<id>` and render verdicts in real time. The dashboard subscribes to `org:<org_id>:sessions` and merges events from many concurrent sessions.

## 7. Verification pipeline (the hot path)

```
1. Companion app: technician triggers photo (voice "Hey Meta, take a photo" or in-app button).
2. Companion app: POST /sessions/:id/photo with the JPEG, step_id, timestamp, GPS.
3. API:
   a. Upload to S3 → s3://field-iq/<org>/<session>/<step>-<uuid>.jpg
   b. Compute SHA-256, persist audit_log row (event=photo_submitted)
   c. Enqueue { session_id, step_id, photo_s3_key, prompt } to verification_queue
   d. Publish session.photo.received event
4. Verifier worker:
   a. Dequeue, fetch signed URL for the photo
   b. Build Claude request: system prompt (Section 8.1) + step's verification_prompt + image
   c. Call Anthropic Messages API with model=claude-sonnet-4-6, JSON mode
   d. Parse response (verified, confidence, message, detail)
   e. Persist to audit_log (event=verified | retry)
   f. Publish session.verification.result event
   g. If verified=true: advance current_step_id, persist, publish step.advanced
5. Web App on glasses: receives session.verification.result → render verdict;
   receives step.advanced → render next step card.
6. Companion app: receives same events, mirrors UI on the phone screen.
```

End-to-end target latency: p50 ≤ 4 s, p95 ≤ 8 s. The dominant variable is Anthropic API latency for vision requests, typically 2–6 s.

## 8. Claude prompting

### 8.1 System prompt (sent with every verification request)

```
You are an industrial safety verification AI for EON Field IQ. You analyze
photos taken by a field technician performing a Standard Operating Procedure
and determine whether the required action has been correctly executed.

Rules:
- Be strict but fair. If there is genuine visual ambiguity, request a retake
  rather than failing.
- Base your verdict only on what is visible in the photo plus the step prompt.
  Do not assume facts not in evidence.
- Photos may be taken in industrial environments with poor lighting, glare,
  or partial occlusion. Tolerate these conditions but flag if the photo is
  unusable.
- Output only valid JSON in the schema below. No markdown, no preamble.

Output JSON schema:
{
  "verified": true | false,
  "confidence": "high" | "medium" | "low",
  "message": "<one short sentence shown to the technician on the HUD>",
  "detail": "<one sentence technical explanation persisted to the audit log>"
}
```

### 8.2 Per-step `verification_prompt`

Stored in `steps.verification_prompt` and editable by content authors. See `03_LOTO_Test_Case.md` for the 10 LOTO step prompts that ship in v1.

### 8.3 Calling pattern (Python verifier)

```python
import anthropic, json, base64, os
from urllib.request import urlopen

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

def verify(photo_url: str, step_prompt: str) -> dict:
    img_bytes = urlopen(photo_url).read()
    img_b64 = base64.standard_b64encode(img_bytes).decode()
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=400,
        system=SYSTEM_PROMPT,        # Section 8.1 above
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64", "media_type": "image/jpeg", "data": img_b64
                }},
                {"type": "text", "text": step_prompt},
            ],
        }],
    )
    # Sonnet returns text; we expect strict JSON per the system prompt
    return json.loads(resp.content[0].text)
```

## 9. Security & privacy

- TLS 1.3 everywhere; HSTS on all hosted endpoints.
- JWT access tokens (15 min) + rotating refresh tokens (30 days, revocable per device).
- Per-organization tenant isolation enforced at the query layer (every read carries `org_id` from JWT).
- Photos: server-side encryption at rest (SSE-S3 or SSE-KMS), signed URLs with 5 min expiry, no public buckets.
- PII (technician name, phone, email) encrypted at rest using a per-org KMS key.
- Audit immutability: row-level `INSERT`-only grants in Postgres for the application role; corrections go through a separate admin role with full audit of the corrector.
- Photo retention default 1 year, configurable per org down to 90 days (compliance floor) or up to 7 years (oil & gas / aerospace default).
- Privacy notice shown at first-session onboarding; technicians can request export/erasure of their identity (audit photos remain, identifiable only by anonymized technician ID).

## 10. Observability

- **Tracing:** OpenTelemetry across the API, verifier, and reporter; export to a managed backend (Honeycomb, Datadog, or self-hosted Tempo). Trace IDs propagate from the companion app and Web App via a `traceparent` header / WebSocket frame.
- **Metrics:** Prometheus scrapes; key dashboards: verification latency (p50/p95/p99), first-pass verification rate per step (rolling 7-day), queue depth, active sessions, error rate by endpoint.
- **Logs:** Structured JSON to stdout, shipped to a managed log store. PII-scrubbed in transit.
- **Synthetic checks:** Every 5 min, a synthetic session is run end-to-end against a staging environment with a known-good photo set; failures page on-call.

## 11. Deployment

- **Environments:** `dev` (per-developer, ephemeral), `staging` (pre-prod, integration), `prod`.
- **Infra-as-code:** Terraform for cloud resources, Helm for Kubernetes services. Single AWS region in v1 (us-east-1); multi-region in Phase 3.
- **CI/CD:** GitHub Actions. PR pipeline: lint, type-check, unit tests, build container, push to staging on merge to `main`. Production deploy is a manual promotion.
- **Mobile distribution:** TestFlight + Firebase App Distribution in v1. App Store / Play Store in Phase 4.
- **Glasses Web App distribution:** Add via Meta AI app in Developer Mode (password-protected URL). Production publishing pending Meta's GA.

## 12. Testing strategy

- **Unit:** Backend domain logic (session state machine, prompt assembly, audit chain integrity). React Native business logic with React Testing Library.
- **Integration:** Backend ↔ Postgres ↔ Redis with testcontainers. API contract tests with Pact between companion app and backend.
- **End-to-end:** Playwright against the dashboard. Detox against the React Native app. A synthetic "session replay" harness that feeds known photos at known steps and asserts verdicts.
- **Verification regression:** A growing corpus of (photo, step_prompt, expected_verdict) triples. Run nightly against the live Claude API to catch drift; alert on per-step accuracy drop ≥5%.
- **Hardware-in-the-loop:** Once-weekly manual run of the LOTO procedure on the DAC #811 trainer with real glasses, real Neural Band, recording the session for regression playback.

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Meta Wearables SDK is developer preview; APIs may change | Pin to a tagged SDK version; subscribe to Meta's developer announcements; isolate SDK calls behind the native bridge so changes are localized. |
| 100-tester limit on Device Access Toolkit distribution | For pilots beyond 100 users, fall back to the Web App-only experience (with QR scanning on the phone's own camera) until Meta opens GA publishing. |
| Bluetooth bandwidth limits photo throughput | Use 12 MP photos (one per step), not video streams, in v1. Video is for Phase 2 features (e.g., live remote expert assist). |
| Claude Vision misclassifies edge cases | Tunable retry threshold per step; trainer can override a verdict from the dashboard (audited); verification regression corpus catches regressions early. |
| Connectivity at industrial sites | Companion app caches procedure and queues photos; sessions resume on reconnect. Future: on-phone fallback model for binary checks (valve open/closed). |
| Tampering with audit photos | SHA-256 hashes persisted at upload, photos stored in immutable bucket configuration in regulated environments. |
| Privacy backlash from camera-always-on perception | Default capture model is "user-initiated photo at each step" — no continuous recording. Privacy notice + per-org retention controls. |

---

*Cross-reference: `01_PRD.md` (product context), `03_LOTO_Test_Case.md` (concrete first procedure), `04_Implementation_Plan.md` (phased build with Claude Code prompts), `05_CLAUDE.md` (repo orientation).*
