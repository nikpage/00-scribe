-- Migration: remember the eWay contact a recording is for, chosen up front on
-- the record screen, so the journal save can attach to it without re-searching.
-- Run in Supabase SQL Editor after migration-008-standalone-notes.sql.

alter table public.recordings
  add column if not exists eway_contact_guid text,
  add column if not exists eway_contact_name text;
