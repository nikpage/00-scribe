# Fix: Login Broken on Vercel (Mobile)

## Root Causes Found

### 1. CRITICAL: No session middleware (`src/middleware.ts` doesn't exist)
The Supabase session refresh middleware (`src/lib/supabase/middleware.ts`) was written but **never wired up** — there's no `src/middleware.ts` to call it. This means:
- Auth cookies are never refreshed on requests
- Sessions expire quickly
- Protected pages redirect to login even when user just authenticated

### 2. CRITICAL: WebAuthn origin/rpID hardcoded to `localhost`
`WEBAUTHN_RP_ID=localhost` and `WEBAUTHN_ORIGIN=http://localhost:3000` in env vars. On Vercel (`https://your-app.vercel.app`), WebAuthn verification always fails because:
- `expectedOrigin` doesn't match actual browser origin
- `expectedRPID` doesn't match actual domain
- Both passkey registration and login silently fail with "Verification failed"

### 3. MAJOR: Webhook URL uses WEBAUTHN_ORIGIN
`assemblyai.ts` line 16: `webhook_url: ${process.env.WEBAUTHN_ORIGIN}/api/webhook` — if WEBAUTHN_ORIGIN is wrong, transcription webhooks never arrive.

### 4. MINOR: No error diagnostics
Auth failures return generic messages — impossible to debug on mobile.

---

## Plan

### Step 1: Create `src/middleware.ts`
Wire up the existing `updateSession()` function. Add `/api/webhook` and static assets to the exclude list.

**File**: `src/middleware.ts` (new)

### Step 2: Auto-detect WebAuthn origin from request
Instead of relying solely on env vars, derive `origin` and `rpID` from the incoming request's `Origin` or `Host` header. Fall back to env vars if headers missing. This makes the app work on localhost AND Vercel without changing env vars.

**Files**:
- `src/app/api/auth/authenticate/route.ts` — use request origin
- `src/app/api/auth/register/route.ts` — use request origin

### Step 3: Separate webhook URL from auth origin
Add `WEBHOOK_BASE_URL` env var (falls back to `WEBAUTHN_ORIGIN` for backward compat). Update AssemblyAI provider.

**Files**:
- `src/lib/transcription/assemblyai.ts` — use new env var
- `.env.example` — document new var

### Step 4: Add env var validation
Create a startup check that warns about missing critical env vars (log to console, don't crash).

**File**: `src/lib/env.ts` (new), imported in `src/app/layout.tsx`

### Step 5: Better auth error messages
Add specific error details to auth API responses so mobile users (and console logs) can see what went wrong.

**Files**:
- `src/app/api/auth/authenticate/route.ts`
- `src/app/api/auth/register/route.ts`

### Step 6: Update `.env.example`
Add `WEBHOOK_BASE_URL`, `GEMINI_API_KEY`, and comments about Vercel setup.

---

## Vercel Setup Required (by user)
After code changes, set these in Vercel Dashboard > Settings > Environment Variables:
- `WEBAUTHN_RP_ID` = `your-app.vercel.app` (or custom domain)
- `WEBAUTHN_ORIGIN` = `https://your-app.vercel.app`
- `WEBHOOK_BASE_URL` = `https://your-app.vercel.app`
- `GEMINI_API_KEY` = your key
- All existing Supabase + AssemblyAI vars

Also in **Supabase Dashboard** > Auth > URL Configuration:
- Add `https://your-app.vercel.app/auth/callback` to Redirect URLs
