-- Scribe: Social Worker Interview Recording & Transcription
-- Run this in the Supabase SQL Editor to set up the schema.

-- Users/profiles (extends Supabase auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  is_manager boolean default false,
  created_at timestamptz default now()
);

-- WebAuthn credentials (for biometric/PIN login on phone)
create table if not exists credentials (
  id text primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[] default '{}',
  created_at timestamptz default now()
);

-- Recordings
create table if not exists recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  label text not null,
  filename text not null,
  recorded_at timestamptz not null,
  duration_seconds int,
  file_size_bytes int,
  status text not null default 'pending',
  drive_audio_id text,
  drive_text_id text,
  transcription_id text,
  transcript jsonb,
  speakers jsonb default '{}',
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS policies
alter table profiles enable row level security;
alter table recordings enable row level security;
alter table credentials enable row level security;

-- Workers see own profile; managers see all profiles
create policy "Users see own profile" on profiles
  for select using (
    auth.uid() = id
    or exists (select 1 from profiles where id = auth.uid() and is_manager = true)
  );
create policy "Users update own profile" on profiles
  for update using (auth.uid() = id);

-- Workers see own recordings; managers see all
create policy "Users see own recordings" on recordings
  for select using (
    auth.uid() = user_id
    or exists (select 1 from profiles where id = auth.uid() and is_manager = true)
  );
create policy "Users manage own recordings" on recordings
  for all using (auth.uid() = user_id);

create policy "Users see own credentials" on credentials
  for all using (auth.uid() = user_id);

-- Realtime: enable for recordings table (queue status updates)
alter publication supabase_realtime add table recordings;
