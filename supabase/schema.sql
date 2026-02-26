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

-- No RLS — all access control handled server-side via admin client

-- Realtime: enable for recordings table (queue status updates)
alter publication supabase_realtime add table recordings;
