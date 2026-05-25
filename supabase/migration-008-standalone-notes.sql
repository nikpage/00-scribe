-- Migration: Worker notes are the primary flow — the in-person interview
-- itself is not recorded in Scribe, only the worker's post-session dictation.
-- So notes must be allowed to exist without a parent interview recording.

alter table public.recordings
  drop constraint if exists recordings_parent_kind_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recordings_parent_kind_check'
  ) then
    alter table public.recordings
      add constraint recordings_parent_kind_check
      check (
        kind in ('interview', 'worker_notes')
        and (kind = 'worker_notes' or parent_recording_id is null)
      );
  end if;
end $$;
