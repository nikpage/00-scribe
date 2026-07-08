-- Migration: kill the profiles recursion for good.
-- migration-012 dropped "profiles_select" by name, but the live DB may still
-- carry an older self-referencing policy under a different name. Drop EVERY
-- policy on profiles dynamically, then recreate only the minimal self-scoped
-- set. None of these reference profiles again, so no policy can recurse.

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;
end $$;

alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- is_manager() reads profiles; keep it SECURITY DEFINER with a pinned
-- search_path so it runs as owner (RLS bypassed) and can never re-enter a
-- profiles policy. Used only by other tables' policies, never by profiles'.
create or replace function public.is_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_manager from public.profiles where id = auth.uid()),
    false
  );
$$;
