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
- **Auth** — **No login screen.** First open silently creates an anonymous Supabase
  account per device (`signInAnonymously` in `src/app/setup/page.tsx`), then captures
  **name + phone** into `profiles`. Per-worker data stays separated via a real
  `auth.uid`, with no password, code, email, or passkey. (The old
  passkey/SMS/magic-link/password stack was removed — see the auth note in Gotchas.)
- **Transcription** — provider-swappable behind `src/lib/transcription/index.ts`
  (AssemblyAI + Speechmatics). Results processed in `process-result.ts`.
- **Analysis** — Google Gemini (`src/lib/analysis/gemini.ts`) for summaries / action items.
- **Storage** — Google Drive (audio + `.txt` transcripts) via service account.
- **eWay-CRM** — `src/lib/eway/` (see below).
- Deployed on Vercel (`00-scribe.vercel.app`).

## Layout

- `src/app/auth/login/` — legacy path; just `redirect("/setup")` for old bookmarks / sign-out.
- `src/app/setup/` — first-run onboarding: **name + phone → eWay connect** (silent anon
  sign-in on submit, then profile upsert, then `/settings/eway?onboarding=1`).
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
  when the worker has no saved credentials** — the UI keys off this.
- `journal.ts` — pull/filter contacts, save a Journal entry.

Credentials are saved per-worker at `/settings/eway`; the POST only persists after a
successful test login, so a stored credential is always known-good.

### Onboarding + "connect eWay" nudge (the flow to preserve)

1. Setup ends by routing to `/settings/eway?onboarding=1` (after passkey **or** skip).
   The page shows an intro ("you can connect later, but you can't pull client names
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
  middleware redirect unauthenticated users to a login page: login was removed, so
  `/auth/login` just bounces to `/setup`, and `/setup` (where the session is actually
  created client-side) is not session-gated — a redirect here loops forever
  (`ERR_TOO_MANY_REDIRECTS`, the July outage).
- **i18n is partial** — setup/record/eWay screens are fully translated; some other
  screens are still English-only. Add both `cs` and `en` keys for any new string.
- Client components reading search params (e.g. `?onboarding=1`) must be wrapped in
  `<Suspense>` or the production build fails.
- **Login was removed** (silent name+phone identity). The passkey/SMS/magic-link/
  password code and the Vonage integration are gone from the app; only
  `scripts/setup-vonage-webotp-template.mjs` remains as a parked, unwired script.
  If SMS/OTP is ever revived, note the account never had custom Verify v2 templates
  enabled — that needs a Vonage support ticket, not a self-service toggle.

## Conventions

- Reuse shared helpers (`lib/eway/session.ts`, `lib/clients.ts`, `i18n.ts`) — don't
  re-implement login, client-name normalization, or inline strings.
- API routes return `{ error }` with a meaningful HTTP status; the client switches on
  `res.status` (notably `404` = eWay not connected). Preserve that contract.
