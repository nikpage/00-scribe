-- Scribe: Row-Level Security Policies
-- Run this in the Supabase SQL Editor AFTER schema.sql.
-- All API routes use the admin (service-role) client which bypasses RLS.
-- These policies protect against direct anon-key access.

-- Helper: check if the current user is a manager
create or replace function public.is_manager()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select is_manager from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- profiles
-- ============================================================
alter table public.profiles enable row level security;

-- Users can read their own profile; managers can read all
create policy "profiles_select" on public.profiles
  for select using (
    auth.uid() = id or public.is_manager()
  );

-- Users can update their own profile
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Insert is done via admin client during registration, but allow self-insert
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

-- ============================================================
-- credentials
-- ============================================================
alter table public.credentials enable row level security;

-- Users can only manage their own credentials
create policy "credentials_select" on public.credentials
  for select using (auth.uid() = user_id);

create policy "credentials_insert" on public.credentials
  for insert with check (auth.uid() = user_id);

create policy "credentials_update" on public.credentials
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "credentials_delete" on public.credentials
  for delete using (auth.uid() = user_id);

-- ============================================================
-- recordings
-- ============================================================
alter table public.recordings enable row level security;

-- Users can read their own recordings; managers can read all
create policy "recordings_select" on public.recordings
  for select using (
    auth.uid() = user_id or public.is_manager()
  );

-- Users can insert their own recordings
create policy "recordings_insert" on public.recordings
  for insert with check (auth.uid() = user_id);

-- Users can update their own recordings; managers can update all
create policy "recordings_update" on public.recordings
  for update using (
    auth.uid() = user_id or public.is_manager()
  )
  with check (
    auth.uid() = user_id or public.is_manager()
  );

-- Users can delete their own recordings
create policy "recordings_delete" on public.recordings
  for delete using (auth.uid() = user_id);
