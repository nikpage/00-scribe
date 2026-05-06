-- Migration: Audit log for sensitive data access.
-- Idempotent. Records who viewed or changed client / recording data and when.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  action text not null,
  target_type text not null,
  target_id uuid,
  target_label text,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_id_idx on public.audit_log (actor_id);
create index if not exists audit_log_target_idx on public.audit_log (target_type, target_id);

alter table public.audit_log enable row level security;

-- Only managers may read the audit log. Inserts always go through the service-
-- role admin client (server-side helper); no user-facing insert policy is
-- required and we do not want one — workers should not be able to forge events.
drop policy if exists "audit_log_select" on public.audit_log;
create policy "audit_log_select" on public.audit_log
  for select using (public.is_manager());

notify pgrst, 'reload schema';
