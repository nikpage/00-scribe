-- Migration: SMS OTP login via Vonage Verify. Every account keeps a real
-- email (collected at setup) so the existing passkey session bootstrap
-- (generateLink + magiclink) keeps working unchanged for phone-first users.

alter table public.profiles
  add column if not exists phone text unique;
