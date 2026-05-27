# Phase 0 — Claude Code Handoff Prompt

**Audience:** Claude Code, running in the `field-iq-product/` repo root.
**Written by:** Claude Cowork. **For:** Dan Lejerskar, EON AI Ventures.
**Estimated effort:** 1–2 focused sessions (~3–5 hours wall clock).

---

## How to use this prompt

Dan: open Claude Code in this folder. Paste this entire file as your first message. Claude Code will read the referenced files, plan the work, then execute. Confirm the plan, then let it run. Review at the end.

---

## Your role

You are Claude Code working on the **Field IQ** product. The repo is structured as a pnpm monorepo. You are about to execute **Phase 0 — Foundation**.

## Required reading before you start

Read these files in order and confirm out loud (one-line summary each) before writing any code:

1. `./FIELD_IQ_PRODUCT_SPEC.md` — the master spec. Section 4 (canonical schema) and section 6 (Phase 0 deliverables) are non-negotiable contracts for this work.
2. `./README.md` — project overview and the Cowork ↔ Claude Code workflow.
3. `../4b Code Html Field_IQ_Walkthrough/README.md` — the frozen UI reference's own README, so you understand what we're refactoring.
4. `../4b Code Html Field_IQ_Walkthrough/data/journey.json` — skim the structure. This is the 49-slide source data you'll port to TypeScript.
5. `../4b Code Html Field_IQ_Walkthrough/css/tokens.css` — the design tokens we're carrying over to Tailwind.
6. `../4b Code Html Field_IQ_Walkthrough/js/render.js` — the 12 template render functions. Each becomes a React component.

After reading, **state your plan in 6–10 bullet points** before touching the filesystem. Wait for Dan's go-ahead before writing files.

---

## Mission

Refactor the frozen Vercel walkthrough into a Next.js 14 (App Router) + TypeScript application inside `apps/walkthrough/`, backed by a canonical schema package at `packages/schema/`. Same visual result as the frozen walkthrough. Production-grade code. Foundation that Phases 1–3 build on top of.

## Acceptance criteria (you are done when all are true)

1. `pnpm install` at the repo root succeeds.
2. `pnpm --filter @field-iq/schema build` succeeds. Schema package emits both ESM and types.
3. `pnpm --filter walkthrough dev` starts the Next.js dev server on `http://localhost:3000`.
4. `http://localhost:3000` redirects to `/walkthrough/1` and shows **slide 1 — the title slide ("The Worker's Journey")** with the same hero image and four journey pills as the frozen walkthrough.
5. `→` key on the keyboard advances through all 49 slides. `←` goes back. `H` jumps to slide 2 (hub). `1`–`4` jump to the four journey entry points (slides 4, 14, 26, 43).
6. Sidebar shows four journey buttons that highlight the active journey.
7. All 49 slides render — at minimum a "generic" template renders any slide whose specific template component isn't done yet. **No slide should error out.**
8. `pnpm --filter walkthrough build` succeeds (Next production build).
9. `pnpm --filter walkthrough test` runs the smoke test (see step 5 below) and passes.

---

## Work breakdown

### 1. Monorepo plumbing (~20 min)

- Root `package.json` with `pnpm` workspaces (`packages/*`, `apps/*`).
- Root `pnpm-workspace.yaml`.
- Root `tsconfig.json` with shared compiler options (`strict: true`, `target: ES2022`, `moduleResolution: bundler`).
- Root `.gitignore` (node_modules, .next, .turbo, dist, .DS_Store).
- Root `.editorconfig` (LF, 2-space, utf-8).
- Root `prettier.config.cjs` (single quotes, trailing commas, 100-char print width).

### 2. `@field-iq/schema` package (~40 min)

- `packages/schema/package.json` — name `@field-iq/schema`, type `module`, exports for `./procedure`, `./session`, `./audit`, `./walkthrough`, plus the index.
- `packages/schema/tsconfig.json` — `composite: true`, emit declarations.
- `packages/schema/src/procedure.ts` — implement the types defined in **Spec section 4.1** exactly.
- `packages/schema/src/session.ts` — implement **Spec section 4.2** exactly.
- `packages/schema/src/audit.ts` — implement **Spec section 4.3**.
- `packages/schema/src/walkthrough.ts` — implement **Spec section 4.4**.
- `packages/schema/src/index.ts` — re-export everything.
- `packages/schema/src/walkthrough.test.ts` — Vitest test that round-trips a `Slide` through `JSON.stringify`/`parse` and confirms type integrity (use one slide from `journey.json` as the fixture).
- Wire `tsup` (or `tsc` directly) to build ESM + .d.ts.

### 3. `apps/walkthrough` Next.js app (~2 h)

- `pnpm create next-app` is fine, or hand-roll. Either way: TypeScript, Tailwind, App Router, no `src/` directory (use top-level `app/`), no ESLint conflicts with Prettier.
- `apps/walkthrough/tailwind.config.ts` — extend `theme.colors`, `borderRadius`, `boxShadow`, `fontFamily` from **Spec section 5**.
- `apps/walkthrough/app/globals.css` — Tailwind directives, set `body { background: theme(colors.bg.page); color: theme(colors.ink.DEFAULT); }`, font import for Inter.
- `apps/walkthrough/app/layout.tsx` — root layout with sidebar + topbar + footer chrome. Use server components where possible. Use the design tokens from Tailwind.
- `apps/walkthrough/app/page.tsx` — server component that redirects to `/walkthrough/1`.
- `apps/walkthrough/app/walkthrough/[slideId]/page.tsx` — dynamic route. Reads `params.slideId`, finds the slide in the typed data, renders the matching template component, sets the page title.
- `apps/walkthrough/data/journey.ts` — typed port of the JSON. Define as `export const walkthrough: Walkthrough = { ... } as const satisfies Walkthrough;` so TypeScript verifies the data conforms to the schema. **The data values come from `../4b Code Html Field_IQ_Walkthrough/data/journey.json` — copy faithfully.** Asset URLs should become `/assets/...` paths.
- `apps/walkthrough/components/layout/Sidebar.tsx` — Client component with the four journey buttons, active state, journey-color highlight.
- `apps/walkthrough/components/layout/TopBar.tsx` — Client component with back button, current slide indicator (`N / 49`), home button, journey badge.
- `apps/walkthrough/components/layout/FooterBar.tsx` — Server component, footer text from the slide.
- `apps/walkthrough/components/layout/KeyboardNav.tsx` — Client component, `useEffect` binds ←/→/H/1-4 keys and uses Next.js router to navigate.
- `apps/walkthrough/components/slides/` — one component per template:
  - `EntryCover.tsx`, `Hub.tsx`, `Tour.tsx`, `JourneyIntro.tsx`, `SectionDivider.tsx`, `JourneyOutro.tsx`, `SetupStep.tsx`, `TrainingStep.tsx`, `FieldUseStep.tsx`, `MonitorStep.tsx`, `Closer.tsx`, `Generic.tsx`.
  - Each takes `{ slide: Slide }` and renders. Mirror the layout in the frozen walkthrough's `render.js` — same structure, just as JSX with Tailwind.
- `apps/walkthrough/components/primitives/` — `Card.tsx`, `ImageZone.tsx`, `DeviceFrame.tsx`, `HudFrame.tsx`, `Pill.tsx`, `Kicker.tsx`, `ActionButton.tsx`. Pure presentational. Tailwind only.
- `apps/walkthrough/lib/router.ts` — small helpers: `nextSlideId(currentId, total)`, `prevSlideId(currentId, total)`, `slideUrl(id)`.
- `apps/walkthrough/lib/walkthrough-data.ts` — exports `getSlide(id: number)`, `getJourneyEntry(j: Journey)`, `getTotal()`.

### 4. Assets (~10 min)

- Copy the entire `../4b Code Html Field_IQ_Walkthrough/assets/` tree into `apps/walkthrough/public/assets/`. Use `cp -R` or equivalent — preserve directory structure. The slide data already references `assets/images/...` paths, so a one-level rewrite to `/assets/...` is enough.

### 5. Smoke test (~20 min)

- `apps/walkthrough/tests/all-slides-render.spec.ts` — Playwright test that:
  - Starts the dev server.
  - Visits `/walkthrough/1` through `/walkthrough/49`.
  - Asserts each page returns 200 and contains at least one `<h1>` or `<h2>`.
  - Asserts no console errors.
- Add `pnpm test` script that runs Playwright in CI mode.

### 6. Deploy target (~10 min — config only, don't actually deploy)

- `apps/walkthrough/vercel.json` if needed.
- Note in commit message: "Phase 0 lands. Ready for Vercel project `field-iq-product-walkthrough`."

---

## Constraints

- **Visual fidelity:** the rendered result should look the same as the frozen walkthrough to a casual viewer. Pixel-perfect is not required for Phase 0; "obviously the same product" is. We'll polish in Phase 0.1.
- **Schema fidelity:** the types in `packages/schema/src/` must match **Spec section 4** exactly. Do not invent new fields. Do not omit fields. If you find the spec ambiguous, ask Dan; don't guess.
- **No regressions to the frozen walkthrough.** You must not modify anything under `../4b Code Html Field_IQ_Walkthrough/`. Read-only.
- **TypeScript strict.** No `any` without a `// @reason:` comment. No `@ts-ignore`.
- **No state libraries.** Phase 0 uses URL params for navigation state and React server components for data. We add React Query / Zustand only when Phase 1 needs them.
- **Commit hygiene.** Commit after each numbered section (1–6 above) lands and works. Conventional commit messages. Author yourself as `Claude <claude@eonreality.com>`.

---

## Out of scope for Phase 0

- Authentication, login, sessions.
- Backend API or database.
- Real Monitor functionality (Phase 1).
- Real Field Use simulation (Phase 2+).
- Real AI integration (Phase 3).
- Mobile / responsive polish beyond what Tailwind defaults give us.
- E2E tests beyond the smoke test.
- Storybook or design-system docs (Phase 0.1).

If you find yourself implementing any of these, stop and ask.

---

## When you're done

Run all three of these and paste the output back into the Cowork conversation:

```bash
pnpm install
pnpm --filter @field-iq/schema build
pnpm --filter walkthrough build
pnpm --filter walkthrough dev   # leave running, screenshot localhost:3000
pnpm --filter walkthrough test
```

Then post in Cowork:

> Phase 0 landed. <git log line>. Schema package: ✅. Walkthrough builds: ✅. All 49 slides render: ✅. Smoke test: ✅. Ready for Phase 1.

Cowork will write the Phase 1 prompt next.

---

## Things to ask Dan if blocked

If any of these come up, **stop and ask** — don't pick a default and ship:

- Asset paths inside `journey.json` resolving to `/assets/...` — confirm before bulk rewriting.
- Any image asset that doesn't exist in the frozen walkthrough — use a placeholder, log it, and ask.
- TypeScript errors that require a schema change — bring them up; don't widen types silently.
- Anything you think is wrong in this prompt — push back.
