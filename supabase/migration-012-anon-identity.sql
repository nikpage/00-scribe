-- Migration: login removed. Identity is name + phone captured at /setup,
-- backed by a silent anonymous auth user per device. Phone is no longer a
-- login key, so drop its uniqueness: a reinstall or second device is a new
-- anonymous user and would otherwise collide on the same number.

alter table public.profiles
  drop constraint if exists profiles_phone_key;

-- profiles_select called is_manager(), which reads profiles, which re-fires
-- this same policy -> "infinite recursion detected in policy for relation
-- profiles". It only surfaced once profile writes stopped going through the
-- service-role admin client and started coming from the anon user under RLS.
-- Managers already read profiles via the admin client (RLS bypassed), so the
-- manager branch here is dead weight -- scope the policy to self-reads only.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id);
