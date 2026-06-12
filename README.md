# Scribe

A voice-notes app for field workers. Record a client visit on your phone, get it
transcribed and AI-summarized, and push the note straight into **eWay-CRM** as you.

- **Record** a visit → audio chunked to IndexedDB as you go (worst-case ~5s loss).
- **Transcribe** via a swappable provider (AssemblyAI / Speechmatics).
- **Summarize** with Google Gemini (notes + action items).
- **Send to eWay** — pick the contact, review the note, save it as a Journal entry.

## Stack

- Next.js 16 (App Router) · React · TypeScript · Tailwind
- Supabase — Postgres + cookie-session auth + Realtime
- WebAuthn passkeys (phone) + magic link (cross-device)
- Google Drive storage · Gemini analysis · eWay-CRM integration
- Deployed on Vercel

## Getting Started

```bash
npm run dev      # local dev server at http://localhost:3000
npm run build    # production build (webpack — see CLAUDE.md)
npm run lint
```

Requires Supabase, WebAuthn, transcription, Gemini, Google Drive, and eWay
environment variables (see deployment config / `plan.md`).

## First run

New users go through onboarding: **name → register a passkey → connect eWay**.
eWay is optional at signup, but client-name lookup and saving notes back to eWay
stay disabled until an account is connected under the **eWay** tab.

## Project docs

- `CLAUDE.md` — architecture, conventions, and gotchas for working in this repo.
- `plan.md` — history of the Vercel/mobile login fixes.
