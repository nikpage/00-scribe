-- Migration: phone becomes a login key again, this time for desktop OTP
-- login (Vonage Verify v2) that signs the worker into their EXISTING
-- anonymous account (the one their phone created at /setup) rather than
-- creating a second, empty one.
--
-- migration-012 dropped the unique constraint because phone briefly wasn't a
-- login key. It is again, so two workers can no longer collide on the same
-- number. Existing values were stored digits-only (e.g. "420777123456"); this
-- backfills the leading "+" to match normalizePhoneE164() before the
-- constraint goes on, so old rows and new lookups always agree on format.
update public.profiles
  set phone = '+' || phone
  where phone is not null and phone not like '+%';

alter table public.profiles
  add constraint profiles_phone_key unique (phone);

-- Desktop login mints a session via generateLink(magiclink), which requires
-- the auth user to have a real (confirmed) email — anonymous accounts don't
-- have one. /setup sets this synthetic, never-emailed address right after
-- creating the anonymous account (see /api/auth/ensure-identity), but existing
-- workers created before this migration need it backfilled too.
update auth.users
  set email = id::text || '@phone.internal.scribe',
      email_confirmed_at = coalesce(email_confirmed_at, now())
  where email is null
    and id in (select id from public.profiles where phone is not null);
