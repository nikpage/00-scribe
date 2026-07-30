-- Migration: trusted devices. After one OTP verification (or new-account
-- creation, which never sent an OTP to begin with), remember the device so
-- future logins from it skip Vonage entirely. Logging out only clears the
-- Supabase session cookie, not this one, so the same device never needs a
-- second OTP.

create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists trusted_devices_user_id_idx on public.trusted_devices(user_id);

-- Only the service-role admin client touches this table (pre-login, before
-- any auth.uid() exists), so no client-facing RLS policy is needed — but
-- enable RLS anyway so it defaults closed if that ever changes.
alter table public.trusted_devices enable row level security;
