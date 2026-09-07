-- Migration: make the SQL and JS client match keys agree.
--
-- normalize_client_name() sorted a name's words with the database collation,
-- where c < č < d. The JS copy in src/lib/clients.ts sorts by code point, where
-- č comes after z. For a name starting with Č/Š/Ř/Ž the two keys disagreed: the
-- pre-insert lookup missed, then the insert collided with
-- clients_normalized_address_idx ("duplicate key value violates...").
--
-- Both sides still sort, so "Čeloud Lukáš" and "Lukáš Čeloud" remain one client.
-- The SQL side now sorts with collate "C" (byte order = code-point order), which
-- is exactly what JS .sort() does, and splits on any whitespace like JS does.
--
-- Run in the Supabase SQL Editor. Safe to re-run.

begin;

-- Step 1: refuse to proceed if the new keys would merge two existing clients.
-- Nothing is changed if this raises.
do $$
declare
  clash record;
  found_any boolean := false;
begin
  for clash in
    select
      array_to_string(
        array(
          select tok from unnest(regexp_split_to_array(
            regexp_replace(lower(coalesce(name, '')), ',', '', 'g'), '\s+'
          )) tok where tok <> '' order by tok collate "C"
        ), ' '
      ) as new_key,
      lower(coalesce(address, '')) as addr,
      count(*) as n,
      string_agg(id::text, ', ') as ids
    from public.clients
    group by 1, 2
    having count(*) > 1
  loop
    found_any := true;
    raise warning 'collision: key=% address=% rows=% ids=%',
      clash.new_key, clash.addr, clash.n, clash.ids;
  end loop;

  if found_any then
    raise exception
      'Existing clients would collide under the new key. See the warnings above; merge those rows first.';
  end if;
end $$;

-- Step 2: replace the function. A stored generated column does not recompute on
-- its own, so the column is dropped and re-added (which also drops and rebuilds
-- the unique index depending on it). Recordings link by client_id and are
-- untouched.
create or replace function public.normalize_client_name(input text)
returns text
language sql
immutable
as $$
  select array_to_string(
    array(
      select tok from unnest(regexp_split_to_array(
        regexp_replace(lower(coalesce(input, '')), ',', '', 'g'),
        '\s+'
      )) tok
      where tok <> ''
      order by tok collate "C"
    ),
    ' '
  );
$$;

alter table public.clients drop column normalized;

alter table public.clients
  add column normalized text
  generated always as (public.normalize_client_name(name)) stored;

create unique index clients_normalized_address_idx
  on public.clients (normalized, lower(coalesce(address, '')));

commit;
