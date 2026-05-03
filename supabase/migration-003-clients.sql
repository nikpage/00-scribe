-- Migration: Promote client name from a free-text label to a real entity.
-- Run this in Supabase SQL Editor after migration-002-dashboards.sql.

-- Normalize client names for matching: lowercase, strip commas, sort tokens.
-- Diacritics are preserved (Czech names rely on them).
create or replace function public.normalize_client_name(input text)
returns text
language sql
immutable
as $$
  select array_to_string(
    array(
      select tok from unnest(string_to_array(
        regexp_replace(lower(coalesce(input, '')), ',', '', 'g'),
        ' '
      )) tok
      where tok <> ''
      order by tok
    ),
    ' '
  );
$$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  normalized text generated always as (public.normalize_client_name(name)) stored,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Same normalized name + same address (case-insensitive) is treated as the same client.
-- NULL addresses get a sentinel so the unique index applies.
create unique index if not exists clients_normalized_address_idx
  on public.clients (normalized, lower(coalesce(address, '')));

alter table public.recordings
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists address text;

create index if not exists recordings_client_id_idx on public.recordings (client_id);

-- Backfill: one client per distinct normalized label from existing recordings.
insert into public.clients (name, created_by)
select distinct on (public.normalize_client_name(label))
  label,
  user_id
from public.recordings
where label is not null and trim(label) <> ''
order by public.normalize_client_name(label), created_at
on conflict do nothing;

-- Link existing recordings to their client.
update public.recordings r
set client_id = c.id
from public.clients c
where r.client_id is null
  and public.normalize_client_name(r.label) = c.normalized
  and c.address is null;

-- RLS for clients: workers see clients they've recorded; managers see all.
alter table public.clients enable row level security;

create policy "clients_select" on public.clients
  for select using (
    exists (select 1 from public.recordings r where r.client_id = clients.id and r.user_id = auth.uid())
    or public.is_manager()
  );

create policy "clients_insert" on public.clients
  for insert with check (auth.uid() is not null);

create policy "clients_update" on public.clients
  for update using (
    public.is_manager() or created_by = auth.uid()
  ) with check (
    public.is_manager() or created_by = auth.uid()
  );
