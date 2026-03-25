-- Migration: Add AI analysis, notes, and dashboard support
-- Run this in Supabase SQL Editor after schema.sql

-- Add analysis columns to recordings
alter table recordings
  add column if not exists analysis jsonb,
  add column if not exists metrics jsonb;

-- Notes on individual recordings (by managers)
create table if not exists recording_notes (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid references recordings(id) on delete cascade not null,
  author_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Notes on workers (by managers)
create table if not exists worker_notes (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references profiles(id) on delete cascade not null,
  author_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for notes: only managers can read/write
alter table recording_notes enable row level security;
alter table worker_notes enable row level security;

create policy "Managers can manage recording notes"
  on recording_notes for all
  using (
    exists (select 1 from profiles where id = auth.uid() and is_manager = true)
  );

create policy "Managers can manage worker notes"
  on worker_notes for all
  using (
    exists (select 1 from profiles where id = auth.uid() and is_manager = true)
  );
