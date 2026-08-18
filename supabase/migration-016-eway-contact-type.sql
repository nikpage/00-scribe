-- Migration: remember whether the eWay person a recording is for is a Contact
-- (a client) or a User (a colleague from the staff list), so the journal save
-- links to the right eWay module. Existing rows are all contacts.
-- Run in Supabase SQL Editor after migration-015-trusted-devices.sql.

alter table public.recordings
  add column if not exists eway_contact_type text
    not null default 'contact'
    check (eway_contact_type in ('contact', 'user'));
