# CLAUDE.md — Scribe

Field-worker voice-notes app: record a client visit on the phone, transcribe it,
AI-summarize it, and push the note into eWay-CRM as the worker.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build (**uses `--webpack`**, not Turbopack — see Gotchas)
- `npm run start` — serve the production build
- `npm run lint` — ESLint

There is no test runner wired up. Verify changes by `tsc --noEmit` + `lint` + running the app.

## Stack

- **Next.js 16 (App Router)**, React, TypeScript, Tailwind
- **Supabase** — Postgres + auth (cookie sessions via `@supabase/ssr`) + Realtime.
  Tables: `profiles`, `clients`, `recordings`, `eway_credentials`, audit log.
- **Auth** — **One phone-first screen, no separate login page.** `src/app/setup/page.tsx`
  asks for a phone number first, looks it up via `/api/auth/phone/lookup`, then branches:
  a **new** number asks for a name and silently creates an anonymous Supabase account
  (`signInAnonymously`) with no OTP needed; an **existing** number sends an OTP via
  Vonage Verify v2 (`src/lib/vonage.ts`) and, once verified, signs back into that exact
  same `auth.uid` (via `generateLink`/`verifyOtp` with a `token_hash`, done server-side in
  `/api/auth/phone/verify` — never both `email` and `token_hash` together, Supabase
  rejects that combination). A device that already has a session never sees this page.
  Per-worker data stays separated via a real `auth.uid`, with no password or passkey.
- **Transcription** — provider-swappable behind `src/lib/transcription/index.ts`
  (AssemblyAI + Speechmatics). Results processed in `process-result.ts`.
- **Analysis** — Google Gemini (`src/lib/analysis/gemini.ts`) for summaries / action items.
- **Storage** — Google Drive (audio + `.txt` transcripts) via service account.
- **eWay-CRM** — `src/lib/eway/` (see below).
- Deployed on Vercel (`00-scribe.vercel.app`).

## Layout

- `src/app/auth/login/` and `src/app/auth/phone/` — legacy paths; both just
  `redirect("/setup")` for old bookmarks (phone OTP used to live at `/auth/phone`
  standalone before the phone-first `/setup` merge).
- `src/app/setup/` — the unified phone-first flow (see Auth above). New numbers land on
  `/settings/eway?onboarding=1` after the name step; returning numbers land on `/queue`
  after OTP.
- `src/app/api/auth/` — `phone/lookup` (exists?), `phone/start` (send OTP, rate-limited
  via `phone_otp_throttle`), `phone/verify` (check OTP + mint a session for the existing
  account), `ensure-identity` (gives a fresh anon user a synthetic, never-emailed address
  so `generateLink` has something to work with later).
- `src/app/(authed)/` — the app. `layout.tsx` (server) requires a session **and a
  `profiles` row**, else redirects to `/setup`. Wraps everything
  in `AppShell`. Routes: `record`, `queue`, `clients`, `transcripts`, `transcript/[id]`,
  `manager`, `settings/eway`.
- `src/app/api/` — route handlers (transcribe/webhook, clients, eway/*, manager/*).
- `src/components/app-shell.tsx` — nav + shared client contexts (`useAppUser`,
  `useEwayAttention`). `IdleProvider` wraps it but is a no-op kept only for the
  recording keep-alive — there is no idle-lock or re-auth modal.
- `src/lib/i18n.ts` — Czech (`cs`) + English (`en`) strings; consumed via the
  `useLang()` hook as `t("key")`. **Every user-facing string lives here, both locales.**

## eWay-CRM integration

`src/lib/eway/`:
- `crypto.ts` — AES-GCM encrypt/decrypt of the worker's stored eWay password.
- `client.ts` — `ewayLogin()` against `EWAY_SERVICE_URL`.
- `session.ts` — `getEwaySessionForCurrentUser()`: decrypt creds → log in → return a
  live session. Shared by the contacts and journal routes. **Returns `status: 404`
  when the worker has no saved credentials** — the UI keys off this. **Known issue:**
  it currently calls `ewayLogin()` fresh on every invocation (no session reuse, no
  `LogOff`), and it's called on every request in `contacts`, `contacts/count`,
  `journal`, and `journal-test` routes — including every keystroke in contact search.
  Stale sessions accumulate on eWay's side until its per-account concurrent-session
  cap rejects logins with `"There is too many sessions for user with GUID '...'"`.
  Not locally reproducible on demand since it depends on session state accrued on
  eWay's server. Fix: cache/reuse the sessionId per worker (TTL Map, same pattern as
  the contacts-list cache below), re-login only on expiry.
- `journal.ts` — pull/filter contacts, save a Journal entry.

## Alerting + health

- `src/lib/notify.ts` — `notify(status, message)` fire-and-forget POSTs to
  `nikpage/app-hub`'s **notify-hub** Cloudflare Worker (project `"scribe"`),
  which fans out to a Slack channel. Silently no-ops if `NOTIFY_HUB_TOKEN`
  isn't set (local dev). Wired into server-side failure paths that are
  otherwise invisible to the worker: eWay login/journal-save failures
  (`lib/eway/session.ts`, `api/eway/journal/route.ts`), transcription
  submission/processing failures (`api/transcribe/route.ts`,
  `lib/transcription/process-result.ts`), upload failures
  (`api/upload/route.ts`), and Gemini summary failures (`warn` — the
  recording still saves, just without an AI summary). When adding a new
  server-side failure path, consider whether it should call `notify()` too —
  anything a worker wouldn't otherwise surface, or that only shows as a
  generic toast, is a candidate.
- `GET /api/health` — unauthenticated liveness check (verifies Supabase
  reachability). Polled daily by app-hub's `scribe-usage-stats-sync.sh` as a
  heartbeat; can also be pointed at by an external uptime monitor.
- `nikpage/app-hub`'s daily cron (`scribe-usage-stats-sync.sh`) also reads
  this app's `recordings` and `audit_log` tables directly (via
  `APP_HUB_SCRIBE_SUPABASE_SERVICE_KEY`) for a daily usage/success-rate
  digest, sent to the same Slack channel. See that repo for the sync script,
  schema, and GH Actions workflow.

Credentials are saved per-worker at `/settings/eway`; the POST only persists after a
successful test login, so a stored credential is always known-good.

### Onboarding + "connect eWay" nudge (the flow to preserve)

1. Setup ends by routing to `/settings/eway?onboarding=1` (after the name step for a
   new number). The page shows an intro ("you can connect later, but you can't pull client names
   or save to eWay until you do") plus a **Skip for now / Continue** button → `/queue`.
2. The nav label for that page is **"eWay"** (`t("eway")`), not "Settings".
3. When any eWay action hits a 404 (no creds) — contact search or save in
   `eway-journal-card.tsx` — it calls `useEwayAttention().flag()`, which **blinks the
   eWay nav link** (desktop + mobile) and shows `ewayNotConnectedHint`. Visiting
   `/settings/eway` calls `.clear()`. The blink state lives in `AppShell`, so it
   survives client-side navigation.

When changing eWay UX, keep these three in sync: the 404 contract in `session.ts`,
the `useEwayAttention` flag/clear calls, and the i18n keys.

## Gotchas

- **Build is webpack, not Turbopack.** Serwist/PWA is installed but disabled in config
  because it conflicted with Turbopack. Don't re-enable Turbopack without checking that.
- **Middleware refreshes the session cookie only — it must NOT gate auth.**
  `src/middleware.ts` is wired and runs on every route (via `updateSession` in
  `src/lib/supabase/middleware.ts`): it refreshes the Supabase auth cookie and sets
  security headers. Auth **gating stays in `(authed)/layout.tsx`**. Do not make the
  middleware redirect unauthenticated users to a login page: `/auth/login` and
  `/auth/phone` just bounce to `/setup`, and `/setup` (where the session is actually
  created client-side) is not session-gated — a redirect here loops forever
  (`ERR_TOO_MANY_REDIRECTS`, the July outage).
- **i18n is partial** — setup/record/eWay screens are fully translated; some other
  screens are still English-only. Add both `cs` and `en` keys for any new string.
- Client components reading search params (e.g. `?onboarding=1`) must be wrapped in
  `<Suspense>` or the production build fails.
- Vonage Verify v2 sends OTP via the default boilerplate SMS text — no custom template
  or support ticket required. `VONAGE_BRAND_NAME` env var controls the brand name shown
  in that text.
- `profiles.phone` is unique again (desktop/new-device login keys off it). If you ever
  see a duplicate-phone error, it means two profile rows share a number — usually
  leftover anonymous accounts from before phone was a login key; resolve by keeping the
  one with real data and deleting the other via the Supabase auth admin API (deleting
  `auth.users` cascades to `profiles`/`recordings`/`eway_credentials`, but **not**
  `clients.created_by`, which is `on delete set null` — check for orphaned `clients` rows
  after any such cleanup).

## Conventions

- Reuse shared helpers (`lib/eway/session.ts`, `lib/clients.ts`, `i18n.ts`) — don't
  re-implement login, client-name normalization, or inline strings.
- API routes return `{ error }` with a meaningful HTTP status; the client switches on
  `res.status` (notably `404` = eWay not connected). Preserve that contract.
