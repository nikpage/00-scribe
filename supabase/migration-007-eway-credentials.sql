-- Migration: Per-worker eWay-CRM credentials.
-- The service URL is org-wide (env: EWAY_SERVICE_URL). Each worker keeps
-- their own username + password so journals end up owned by the right
-- Vlastník in eWay. Password is encrypted at rest with AES-256-GCM
-- (key in env: EWAY_ENC_KEY) — we never store plaintext.

create table if not exists public.eway_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  username text not null,
  password_ciphertext text not null,
  password_iv text not null,
  password_tag text not null,
  last_verified_at timestamptz,
  last_verified_ok boolean,
  last_verified_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.eway_credentials enable row level security;

-- Workers may read their own row (to see "connected as X, last verified Y").
-- The plaintext password never leaves the server, so exposing the row is safe.
drop policy if exists "eway_credentials_select_own" on public.eway_credentials;
create policy "eway_credentials_select_own" on public.eway_credentials
  for select using (auth.uid() = user_id);

-- Workers may delete their own connection. Inserts/updates go through the
-- service-role server route so the password gets encrypted server-side; we
-- do not want a client-side write path.
drop policy if exists "eway_credentials_delete_own" on public.eway_credentials;
create policy "eway_credentials_delete_own" on public.eway_credentials
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
