-- Migration: login removed. Identity is name + phone captured at /setup,
-- backed by a silent anonymous auth user per device. Phone is no longer a
-- login key, so drop its uniqueness: a reinstall or second device is a new
-- anonymous user and would otherwise collide on the same number.

alter table public.profiles
  drop constraint if exists profiles_phone_key;
