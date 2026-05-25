-- Migration: A recording is either the interview itself or the worker's
-- post-session notes. Notes belong to a parent interview so the queue can
-- group them and so we know which interview a note is summarizing.

alter table public.recordings
  add column if not exists kind text not null default 'interview',
  add column if not exists parent_recording_id uuid references public.recordings(id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recordings_kind_check'
  ) then
    alter table public.recordings
      add constraint recordings_kind_check
      check (kind in ('interview', 'worker_notes'));
  end if;
end $$;

-- A notes recording must point at an interview; an interview must not have a parent.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recordings_parent_kind_check'
  ) then
    alter table public.recordings
      add constraint recordings_parent_kind_check
      check (
        (kind = 'worker_notes' and parent_recording_id is not null)
        or (kind = 'interview' and parent_recording_id is null)
      );
  end if;
end $$;

create index if not exists recordings_parent_recording_id_idx
  on public.recordings (parent_recording_id);
