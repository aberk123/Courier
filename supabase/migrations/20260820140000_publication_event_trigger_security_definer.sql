-- apply_stop_publication_event() projects the stop_publication_events log onto
-- the stop_publications lookup table. It was NOT security definer, so its
-- writes ran as the calling user and hit RLS on stop_publications -- which has
-- a SELECT policy and nothing else. The result, for every signed-in user
-- including the courier office:
--
--   * adding a publication raised "new row violates row-level security policy"
--     and aborted the whole event insert;
--   * removing one silently affected zero rows, so the deletion appeared on
--     the cover sheet while the address kept receiving the publication.
--
-- Only writes made as postgres/service_role (the initial data load, and
-- create_stop_in_route, which is already security definer) worked, which is
-- why this survived until the policies were exercised as a real user.
--
-- The fix is to run the projection as the definer. The permission decision has
-- already been made at this point by the stop_publication_events INSERT policy,
-- which is what checks publication access; this trigger only mirrors the row it
-- was handed. Adding INSERT/DELETE policies to stop_publications instead would
-- be worse -- it would let clients write the lookup table directly and bypass
-- the event log the cover sheet is built from.
create or replace function public.apply_stop_publication_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type = 'added' then
    insert into public.stop_publications (stop_id, publication_id)
    values (new.stop_id, new.publication_id)
    on conflict do nothing;
  elsif new.event_type = 'removed' then
    delete from public.stop_publications
    where stop_id = new.stop_id and publication_id = new.publication_id;
  end if;
  return new;
end;
$$;

-- Repair any address left receiving a publication that was already recorded as
-- removed (or missing one that was recorded as added) while the trigger was
-- silently failing. Replays the event log in order and rebuilds the lookup
-- table from it.
with latest as (
  select distinct on (stop_id, publication_id) stop_id, publication_id, event_type
  from public.stop_publication_events
  order by stop_id, publication_id, created_at desc, id desc
)
delete from public.stop_publications sp
using latest l
where sp.stop_id = l.stop_id
  and sp.publication_id = l.publication_id
  and l.event_type = 'removed';

with latest as (
  select distinct on (stop_id, publication_id) stop_id, publication_id, event_type
  from public.stop_publication_events
  order by stop_id, publication_id, created_at desc, id desc
)
insert into public.stop_publications (stop_id, publication_id)
select l.stop_id, l.publication_id from latest l where l.event_type = 'added'
on conflict do nothing;
