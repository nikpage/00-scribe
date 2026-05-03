-- Migration: Security baseline.
-- Idempotent. Enables RLS on every public table and (re)defines all policies
-- as a single source of truth. Run this in Supabase SQL Editor any time the
-- security model needs to be re-asserted.

-- ============================================================
-- Helper
-- ============================================================
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

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_manager());

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ============================================================
-- credentials
-- ============================================================
alter table public.credentials enable row level security;

drop policy if exists "credentials_select" on public.credentials;
create policy "credentials_select" on public.credentials
  for select using (auth.uid() = user_id);

drop policy if exists "credentials_insert" on public.credentials;
create policy "credentials_insert" on public.credentials
  for insert with check (auth.uid() = user_id);

drop policy if exists "credentials_update" on public.credentials;
create policy "credentials_update" on public.credentials
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "credentials_delete" on public.credentials;
create policy "credentials_delete" on public.credentials
  for delete using (auth.uid() = user_id);

-- ============================================================
-- recordings
-- ============================================================
alter table public.recordings enable row level security;

drop policy if exists "recordings_select" on public.recordings;
create policy "recordings_select" on public.recordings
  for select using (auth.uid() = user_id or public.is_manager());

drop policy if exists "recordings_insert" on public.recordings;
create policy "recordings_insert" on public.recordings
  for insert with check (auth.uid() = user_id);

drop policy if exists "recordings_update" on public.recordings;
create policy "recordings_update" on public.recordings
  for update using (auth.uid() = user_id or public.is_manager())
  with check (auth.uid() = user_id or public.is_manager());

drop policy if exists "recordings_delete" on public.recordings;
create policy "recordings_delete" on public.recordings
  for delete using (auth.uid() = user_id);

-- ============================================================
-- recording_notes
-- ============================================================
alter table public.recording_notes enable row level security;

drop policy if exists "Managers can manage recording notes" on public.recording_notes;
drop policy if exists "recording_notes_all" on public.recording_notes;
create policy "recording_notes_all" on public.recording_notes
  for all using (public.is_manager()) with check (public.is_manager());

-- ============================================================
-- worker_notes
-- ============================================================
alter table public.worker_notes enable row level security;

drop policy if exists "Managers can manage worker notes" on public.worker_notes;
drop policy if exists "worker_notes_all" on public.worker_notes;
create policy "worker_notes_all" on public.worker_notes
  for all using (public.is_manager()) with check (public.is_manager());

-- ============================================================
-- clients
-- ============================================================
alter table public.clients enable row level security;

drop policy if exists "clients_select" on public.clients;
create policy "clients_select" on public.clients
  for select using (
    exists (select 1 from public.recordings r where r.client_id = clients.id and r.user_id = auth.uid())
    or created_by = auth.uid()
    or public.is_manager()
  );

drop policy if exists "clients_insert" on public.clients;
create policy "clients_insert" on public.clients
  for insert with check (auth.uid() is not null);

drop policy if exists "clients_update" on public.clients;
create policy "clients_update" on public.clients
  for update using (public.is_manager() or created_by = auth.uid())
  with check (public.is_manager() or created_by = auth.uid());

-- Refresh PostgREST schema cache so new tables/policies become visible.
notify pgrst, 'reload schema';
