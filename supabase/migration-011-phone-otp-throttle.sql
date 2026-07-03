-- Migration: rate limit for SMS OTP sends. Each Vonage verify.start call is a
-- billed SMS — without this, a retry loop or a malicious caller can hit
-- /api/auth/phone/start freely and run up the bill for no reason.

create table if not exists public.phone_otp_throttle (
  phone text primary key,
  last_sent_at timestamptz not null,
  window_start timestamptz not null,
  count_in_window int not null default 1
);

-- Only the service-role admin client touches this table (used pre-login,
-- before any auth.uid() exists), so no client-facing RLS policy is needed —
-- but enable RLS anyway so it defaults closed if that ever changes.
alter table public.phone_otp_throttle enable row level security;
