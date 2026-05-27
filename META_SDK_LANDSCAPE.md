# Meta Wearables SDK — Landscape and Access Plan

**Confirmed from Meta's official developer portal on May 25, 2026.**
Reference doc for Claude Code and the EON AI Ventures team. The feasibility deck (`Field_IQ_Meta_Ray-Ban_Display_Feasibility.pptx`) is grounded in what's here.

---

## The portals — what's what

Meta has multiple developer hubs and it's easy to land on the wrong one. Here is the canonical map.

| URL | What it is | Use for Field IQ? |
|---|---|---|
| `https://developers.meta.com/wearables/` | **Wearables hub — AI glasses + Neural Band.** This is our front door. | ✅ **YES** |
| `https://wearables.developer.meta.com/docs` | **Wearables Developer Center.** Docs, API ref, sample apps, project management. | ✅ **YES** |
| `https://wearables.developer.meta.com/devcenter/` | **Project registration, org management, release channels for test users.** | ✅ **YES** |
| `https://developers.meta.com/horizon/` | **Quest VR / Meta Horizon OS.** Unity, Unreal, OpenXR, Spatial SDK. | ❌ Not for Ray-Ban Display |
| `https://www.projectaria.com/` | **Project Aria research-only program.** Aria Gen 2 academic partners. | ❌ Research only, not commercial |
| `https://developers.meta.com/` | Top-level Meta for Developers hub. Aggregates AI/Horizon/Wearables/Social. | Discovery only |
| `https://www.meta.com/help/ai-glasses/` | Generic consumer support. | ❌ No SDK info |

**Action:** when Claude Code or anyone on the team is looking for SDK details, the canonical destination is `wearables.developer.meta.com/docs`. Bookmark it.

---

## The actual SDKs Meta ships

Meta ships **two parallel toolkits** for AI glasses (both addressable today, both in early access). Names below are Meta's official names, used by the deck and the spec.

### 1. Meta Wearables Device Access Toolkit (DAT)
The native mobile path. Extends an iOS or Android app directly into the AI glasses. Use this for the Field IQ Setup app (Phase 2) and the iOS Field IQ runtime.

- **iOS repo:** <https://github.com/facebook/meta-wearables-dat-ios>
- **Android repo:** <https://github.com/facebook/meta-wearables-dat-android>
- **iOS discussions:** <https://github.com/facebook/meta-wearables-dat-ios/discussions>
- **Android discussions:** <https://github.com/facebook/meta-wearables-dat-android/discussions>

### 2. Meta Wearables Web Apps Starter Kit
The web path. Build a standalone web app that runs on the display glasses. Use this for rapid prototypes, the Field Use HUD experience in Phase 0/1, and any code path that doesn't need native iOS access.

- **Repo:** <https://github.com/facebookincubator/meta-wearables-webapp>

Both toolkits expose: camera, audio, display, Neural Band EMG gestures, plus GPS, motion, and orientation (per the Update 125 announcement). Onboarding to a device is via QR code in the Meta AI app's **App Connections** panel.

---

## Developer Center flow (the on-ramp)

From the Wearables Developer Center, the workflow is a four-step funnel:

1. **Create your account.** Set up a managed Meta account and an organization. One account per organization; invite team members.
   <https://wearables.developer.meta.com/docs/onboarding-and-organization-management>

2. **Build with Developer Mode.** Enable on the glasses via the Meta AI app (hamburger → App Info → tap version number repeatedly → Developer Mode → install update). Confirms what the Smart Glasses Guy video walked through.
   <https://wearables.developer.meta.com/docs/getting-started-toolkit>

3. **Register your project.** Projects let you request permissions for device functionality (camera, audio, display, Neural Band).
   <https://wearables.developer.meta.com/docs/manage-projects>

4. **Share with test users.** Set up versions and release channels to distribute pre-production builds.
   <https://wearables.developer.meta.com/docs/set-up-release-channels>

The fourth step is significant for us — **Meta supports a test-user release channel mechanism out of the box**, which is exactly the mechanism we need for the Exxon pilot (Phase 5). We don't have to build TestFlight-equivalents for the glasses ourselves.

---

## What changes in our plan

### Decisions list — add three items

This week (in addition to the five already in the master spec):

6. **Register an organization on the Wearables Developer Center.** <https://wearables.developer.meta.com/signup/landing/> — Dan to do, 5 minutes.
7. **Clone the three SDK repos** into `field-iq-product/vendor/` so Claude Code can read them and stay grounded in real code. One Claude Code session does this in 10 minutes.
8. **Sign up for the Wearables update list** — <https://developers.meta.com/wearables/notify> — so we hear about new SDK releases before they show up in the field.

### Feasibility deck — tighten naming

The deck uses "Web Apps SDK" and "DAT SDK" — Meta's actual names are **Meta Wearables Web Apps Starter Kit** and **Meta Wearables Device Access Toolkit**. The deck's claims are correct; only the labels need a small touch-up in slide 4. (Not blocking — the next time we revise the deck.)

### Spec — add a reference link

In `FIELD_IQ_PRODUCT_SPEC.md`, the iOS app section (Phase 2) should reference the DAT iOS SDK explicitly. Already implicit; making it explicit in the next revision.

---

## What I still couldn't verify

### Google Drive folder (Dan's colleague's early code)

URL: `https://drive.google.com/drive/folders/1t9frXa-Tufz3rp7Ss0il2ucULCpSaIVz?usp=drive_link`

The folder is private to Dan's Google account. Web fetch hits a sign-in wall. **Three paths to get me the contents:**

- **Option A (simplest):** Dan downloads the folder as a ZIP from Google Drive, drops it into `field-iq-product/vendor/colleague-early-code/`. I read every file from there.
- **Option B (also simple):** Dan changes the folder's sharing to "anyone with the link." I can then web-fetch individual files. (Risky for proprietary code.)
- **Option C (heavier):** I drive the browser via Claude in Chrome, sign in as Dan, and browse the folder. Works but uses more session time.

**Recommendation:** Option A. Five minutes for Dan, no permission changes.

### Update 125 release notes (primary source)

The video transcript laid out Update 125's features well, but I haven't verified each one against Meta's own release notes. The blog URL the creator linked to (`https://www.meta.com/en-gb/blog/six-months-of-meta-ray-ban-display/`) wasn't in my provenance set when I tried earlier. If Dan can paste that link in a future message, I'll do a verification pass and tighten any claim in the feasibility deck that needs sourcing.

---

## TL;DR for the team

- The right SDK portal is **wearables.developer.meta.com/docs**. The Horizon portal and Project Aria are unrelated.
- Two SDKs ship today: **Device Access Toolkit (iOS + Android, native mobile extension)** and **Web Apps Starter Kit (standalone web on the HUD)**.
- All three repos are public on GitHub.
- Test-user release channels exist as a first-class feature — that's our path to the Exxon pilot distribution.
- Sign up for the Developer Center this week. Five minutes.
- Drive folder requires Dan to share via Option A above.

---

## Source URLs (so this doc stays self-contained)

- Wearables hub: <https://developers.meta.com/wearables/>
- Wearables docs root: <https://wearables.developer.meta.com/docs>
- DAT for iOS: <https://github.com/facebook/meta-wearables-dat-ios>
- DAT for Android: <https://github.com/facebook/meta-wearables-dat-android>
- Web Apps Starter Kit: <https://github.com/facebookincubator/meta-wearables-webapp>
- Developer Center signup: <https://wearables.developer.meta.com/signup/landing/>
- Update notifications: <https://developers.meta.com/wearables/notify>
- Build-for-display blog announcement: <https://developers.meta.com/blog/build-for-display-glasses/>
