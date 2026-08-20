#!/usr/bin/env bash
#
# RLS regression tests.
#
# These exercise the policies as a real `authenticated` user, which is the only
# way this class of bug shows up: every load done as postgres/service_role
# bypasses RLS entirely and passes for the wrong reason. The publication-event
# trigger bug (fixed in 20260820140000) was invisible until these ran.
#
# Usage:  supabase/tests/rls.sh            # spins up a throwaway local Postgres
#         PGHOST=... PGDATABASE=... rls.sh --no-setup   # against an existing DB
#
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
CLUSTER=${CLUSTER:-/var/lib/postgresql/ctest}

OFFICE=11111111-1111-1111-1111-111111111111
VOICE=22222222-2222-2222-2222-222222222222
NONE=33333333-3333-3333-3333-333333333333
Z=bbbbbbbb-0000-0000-0000-000000000001
A=cccccccc-0000-0000-0000-00000000000a   # receives The Voice only
B=cccccccc-0000-0000-0000-00000000000b   # receives The Shopper only
C=cccccccc-0000-0000-0000-00000000000c   # receives both

pass=0; fail=0

# Runs SQL as `uid` under the authenticated role -- the same shape PostgREST
# uses -- and rolls back so tests cannot contaminate each other.
as() {
  local uid="$1"; shift
  psql -tAq -v ON_ERROR_STOP=0 2>&1 <<SQL
begin;
set local "request.jwt.claims" = '{"sub":"$uid"}';
set local role authenticated;
$*
rollback;
SQL
}

check() {
  local label="$1" actual expected="$3"
  actual=$(printf '%s' "$2" | grep -v '^$' | paste -sd, -)
  if [ "$actual" = "$expected" ]; then
    printf '  \033[32mPASS\033[0m  %s\n' "$label"; pass=$((pass+1))
  else
    printf '  \033[31mFAIL\033[0m  %s\n        expected: %s\n        actual:   %s\n' \
      "$label" "$expected" "$actual"; fail=$((fail+1))
  fi
}

setup() {
  rm -rf "$CLUSTER"; mkdir -p "$CLUSTER/data" "$CLUSTER/sock"
  chown -R postgres:postgres "$(dirname "$CLUSTER")"
  su postgres -s /bin/bash -c "$PGBIN/initdb -D $CLUSTER/data -U postgres --auth=trust" >/dev/null 2>&1
  # Socket-only, no TCP. Set in the config rather than via pg_ctl -o, whose
  # quoting does not survive the su indirection.
  {
    echo "listen_addresses = ''"
    echo "unix_socket_directories = '$CLUSTER/sock'"
  } >> "$CLUSTER/data/postgresql.conf"
  su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $CLUSTER/data -l $CLUSTER/pg.log -w start" >/dev/null 2>&1
  export PGHOST="$CLUSTER/sock" PGUSER=postgres PGDATABASE=courier_test
  psql -q -U postgres -d postgres -c "create database courier_test;"

  # Stand-in for the parts of Supabase the migrations depend on. auth.uid() is
  # Supabase's own definition; the grants match the live project exactly (ALL
  # on every public table to anon/authenticated/service_role), so RLS really is
  # the only boundary here, same as in production.
  psql -q -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth authorization postgres;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
SQL

  for f in "$MIGRATIONS"/*.sql; do
    psql -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "migration failed: $f"; exit 1; }
  done

  psql -q -v ON_ERROR_STOP=1 <<'SQL'
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','office@test'),
  ('22222222-2222-2222-2222-222222222222','voice@test'),
  ('33333333-3333-3333-3333-333333333333','noaccess@test');
update profiles set is_courier_office = true where id = '11111111-1111-1111-1111-111111111111';
insert into user_publication_access (user_id, publication_id)
  select '22222222-2222-2222-2222-222222222222', id from publications where code='voice';

insert into zones (id, number, name) values ('bbbbbbbb-0000-0000-0000-000000000001', 901, 'Test Zone');
insert into stops (id, zone_id, recipient_name, house_number, street) values
  ('cccccccc-0000-0000-0000-00000000000a','bbbbbbbb-0000-0000-0000-000000000001','Voice Only','1','ALPHA ST'),
  ('cccccccc-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000001','Shopper Only','2','BETA ST'),
  ('cccccccc-0000-0000-0000-00000000000c','bbbbbbbb-0000-0000-0000-000000000001','Both','3','GAMMA ST');
insert into stop_publication_events (stop_id, publication_id, event_type)
  select s.id, p.id, 'added' from (values
    ('cccccccc-0000-0000-0000-00000000000a'::uuid,'voice'),
    ('cccccccc-0000-0000-0000-00000000000b'::uuid,'shopper'),
    ('cccccccc-0000-0000-0000-00000000000c'::uuid,'voice'),
    ('cccccccc-0000-0000-0000-00000000000c'::uuid,'shopper')
  ) v(sid,pcode) join stops s on s.id=v.sid join publications p on p.code=v.pcode;
insert into route_entries (zone_id, sequence, kind, direction_text, stop_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001',1,'direction','Start at the depot',null),
  ('bbbbbbbb-0000-0000-0000-000000000001',2,'stop',null,'cccccccc-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000001',3,'stop',null,'cccccccc-0000-0000-0000-00000000000b'),
  ('bbbbbbbb-0000-0000-0000-000000000001',4,'stop',null,'cccccccc-0000-0000-0000-00000000000c');
insert into complaints (stop_id, description) values ('cccccccc-0000-0000-0000-00000000000a','Missed delivery');
insert into stop_instruction_changes (stop_id, description) values ('cccccccc-0000-0000-0000-00000000000c','Use the side gate');
SQL
}

[ "${1:-}" = "--no-setup" ] || setup
: "${PGHOST:=$CLUSTER/sock}"; export PGHOST PGUSER=${PGUSER:-postgres} PGDATABASE=${PGDATABASE:-courier_test}
PV=$(psql -tAq -c "select id from publications where code='voice';")
PS=$(psql -tAq -c "select id from publications where code='shopper';")

echo
echo "Stop visibility"
check "courier office sees every stop" \
  "$(as $OFFICE "select recipient_name from stops where zone_id='$Z' order by house_number;")" \
  "Voice Only,Shopper Only,Both"
check "Voice-only staffer sees only stops that receive The Voice" \
  "$(as $VOICE "select recipient_name from stops where zone_id='$Z' order by house_number;")" \
  "Voice Only,Both"
check "staffer with no publication access sees no stops" \
  "$(as $NONE "select count(*) from stops where zone_id='$Z';")" "0"
check "logged-out visitor sees nothing at all" \
  "$(psql -tAq 2>&1 <<'SQL'
begin; set local role anon;
select (select count(*) from stops)+(select count(*) from zones)+(select count(*) from publications);
rollback;
SQL
)" "0"

echo
echo "Which publications a stop appears to receive"
check "Voice-only staffer cannot see the Shopper link on a shared stop" \
  "$(as $VOICE "select p.code from stop_publications sp join publications p on p.id=sp.publication_id where sp.stop_id='$C';")" \
  "voice"
check "courier office sees both links on a shared stop" \
  "$(as $OFFICE "select p.code from stop_publications sp join publications p on p.id=sp.publication_id where sp.stop_id='$C' order by 1;")" \
  "shopper,voice"

echo
echo "Route ordering"
check "Voice-only staffer sees directions plus only accessible stops" \
  "$(as $VOICE "select sequence from route_entries where zone_id='$Z' order by sequence;")" "1,2,4"
check "courier office sees the whole route in order" \
  "$(as $OFFICE "select sequence from route_entries where zone_id='$Z' order by sequence;")" "1,2,3,4"
check "only the courier office can resequence a route" \
  "$(as $VOICE "update route_entries set sequence=99 where zone_id='$Z' and sequence=2;
     select count(*) from route_entries where sequence=99;")" "0"

echo
echo "Adding and removing publications (regression: trigger must be security definer)"
check "office can add a publication to an existing address" \
  "$(as $OFFICE "insert into stop_publication_events (stop_id,publication_id,event_type) values ('$B','$PV','added');
     select p.code from stop_publications sp join publications p on p.id=sp.publication_id where sp.stop_id='$B' order by 1;")" \
  "shopper,voice"
check "office removal actually stops delivery, not just logs it" \
  "$(as $OFFICE "insert into stop_publication_events (stop_id,publication_id,event_type) values ('$A','$PV','removed');
     select count(*) from stop_publications where stop_id='$A';")" "0"
check "removal is surgical -- the other publication survives" \
  "$(as $VOICE "insert into stop_publication_events (stop_id,publication_id,event_type) values ('$C','$PV','removed');
     reset role;
     select p.code from stop_publications sp join publications p on p.id=sp.publication_id where sp.stop_id='$C';")" \
  "shopper"
check "Voice-only staffer cannot add a publication they do not hold" \
  "$(as $VOICE "insert into stop_publication_events (stop_id,publication_id,event_type) values ('$A','$PS','added');" \
    | grep -c 'row-level security')" "1"

echo
echo "Editing addresses"
check "Voice-only staffer can edit an address they can see" \
  "$(as $VOICE "update stops set special_instructions='ok' where id='$A'; select special_instructions from stops where id='$A';")" "ok"
check "Voice-only staffer cannot edit a Shopper-only address" \
  "$(as $VOICE "update stops set special_instructions='nope' where id='$B'; select count(*) from stops where special_instructions='nope';")" "0"

echo
echo "create_stop_in_route RPC"
check "scoped staffer can create an address, its links and its route entry" \
  "$(as $VOICE "select public.create_stop_in_route('$Z','Newcomer','9','DELTA ST',null,null,array['$PV'::uuid]);
     reset role;
     select (select count(*) from stop_publications sp join stops s on s.id=sp.stop_id where s.house_number='9')
          + (select count(*) from route_entries re join stops s on s.id=re.stop_id where s.house_number='9');" \
    | tail -1)" "2"
check "scoped staffer cannot attach a publication they do not hold" \
  "$(as $VOICE "select public.create_stop_in_route('$Z','Sneaky','8','DELTA ST',null,null,array['$PS'::uuid]);" \
    | grep -c 'do not have access')" "1"
check "staffer with no publication access cannot create an address" \
  "$(as $NONE "select public.create_stop_in_route('$Z','Nobody','7','DELTA ST',null,null,array[]::uuid[]);" \
    | grep -c 'do not have permission')" "1"

echo
echo "mark_cover_sheet_printed RPC"
check "only the courier office can mark a booklet printed" \
  "$(as $VOICE "select public.mark_cover_sheet_printed('$Z', array['$PV'::uuid]);" | grep -c 'Only the courier office')" "1"
check "a Voice-only run does not bury pending Shopper changes" \
  "$(as $OFFICE "select public.mark_cover_sheet_printed('$Z', array['$PV'::uuid]);
     reset role;
     select count(*) from stop_publication_events where publication_id='$PS' and shown_on_cover_sheet_at is null;" \
    | tail -1)" "2"

echo
echo "remove_stop_publications RPC (whole-address removal)"
# The bug: "Remove this address" was a bare `update stops set active = false`,
# so a Voice staffer could end The Shopper's delivery to a shared address with
# nothing logged and no Deletion row anywhere.
check "scoped staffer's removal takes only their own publication off a shared address" \
  "$(as $VOICE "select public.remove_stop_publications('$C');
     reset role;
     select p.code from stop_publications sp join publications p on p.id=sp.publication_id where sp.stop_id='$C';
     select active from stops where id='$C';")" \
  "1,shopper,t"
check "that removal is logged, so the cover sheet can show the Deletion" \
  "$(as $VOICE "select public.remove_stop_publications('$C');
     reset role;
     select p.code || ':' || e.event_type from stop_publication_events e
       join publications p on p.id=e.publication_id
      where e.stop_id='$C' and e.event_type='removed';")" \
  "1,voice:removed"
check "scoped staffer cannot retire a shared address out from under another publication" \
  "$(as $VOICE "update stops set active=false where id='$C';" | grep -c 'before retiring it')" "1"
check "courier office retiring a shared address logs one Deletion per publication" \
  "$(as $OFFICE "select public.remove_stop_publications('$C');
     reset role;
     select count(*) from stop_publication_events where stop_id='$C' and event_type='removed';
     select active from stops where id='$C';")" \
  "2,2,f"
check "removing the last publication retires the address" \
  "$(as $VOICE "select public.remove_stop_publications('$A');
     reset role;
     select active from stops where id='$A';")" \
  "1,f"
# Asserts the retired state and the revival in one transaction, so it cannot
# pass by the address having simply never been retired.
check "re-adding a publication brings a retired address back" \
  "$(as $OFFICE "select public.remove_stop_publications('$A');
     select 'retired:' || active from stops where id='$A';
     insert into stop_publication_events (stop_id,publication_id,event_type) values ('$A','$PV','added');
     select 'revived:' || active from stops where id='$A';")" \
  "1,retired:false,revived:true"
check "scoped staffer cannot remove an address they cannot see" \
  "$(as $VOICE "select public.remove_stop_publications('$B');" | grep -c 'do not have access')" "1"
check "staffer with no publication access cannot remove anything" \
  "$(as $NONE "select public.remove_stop_publications('$A');" | grep -c 'do not have access')" "1"

echo
printf 'ceil %d passed, %d failed\n' "$pass" "$fail" | sed 's/^ceil //'
[ "$fail" -eq 0 ]
