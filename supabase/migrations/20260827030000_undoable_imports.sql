-- Undoable imports, and a way to mark a stop the publication's roster does not
-- manage.
--
-- Two problems, both found by running the real Voice roster against the real
-- routes:
--
-- 1. An import writes to three tables and nothing tied those writes together.
--    stops, stop_publication_events and route_entries each carry created_at,
--    but no run id, so undoing meant "find everything written between 14:32 and
--    14:33 and reverse it by hand". stop_publications has no timestamps at all.
--
-- 2. A publication's roster is its *subscriber* list. The commercial drops on
--    the round -- Silvino's Auto, Lipa's Auto Service, Ocean Dental, Leisure
--    Chateau, a yeshiva -- are never in it, so a roster import reads all of them
--    as cancellations, every single week. That is the silent-deletion failure
--    the whole import path is built to avoid.

-- ---------------------------------------------------------------------------
-- 1. Run provenance
-- ---------------------------------------------------------------------------

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  file_name text,
  publication_id uuid references public.publications(id) on delete set null,
  applied_count integer not null default 0,
  undone_at timestamptz,
  undone_by uuid references auth.users(id) on delete set null
);

comment on table public.import_runs is
  'One row per applied import, so the whole run can be reversed as a unit.';

-- Provenance on the rows an import writes. Nullable: everything already in the
-- database, and every change made by hand in the app, has no run.
alter table public.stop_publication_events
  add column if not exists import_run_id uuid references public.import_runs(id) on delete set null;

alter table public.stops
  add column if not exists import_run_id uuid references public.import_runs(id) on delete set null;

create index if not exists stop_publication_events_import_run_id_idx
  on public.stop_publication_events (import_run_id) where import_run_id is not null;
create index if not exists stops_import_run_id_idx
  on public.stops (import_run_id) where import_run_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Stops a publication's roster does not manage
-- ---------------------------------------------------------------------------

alter table public.stops
  add column if not exists roster_managed boolean not null default true;

comment on column public.stops.roster_managed is
  'False for a stop that will never appear in a publication''s subscriber '
  'export -- commercial drops, institutions. A roster import may still ADD to '
  'such a stop, but must never read its absence from a roster as a '
  'cancellation.';

-- ---------------------------------------------------------------------------
-- 3. Reading and creating runs
-- ---------------------------------------------------------------------------

alter table public.import_runs enable row level security;

drop policy if exists import_runs_select on public.import_runs;
create policy import_runs_select on public.import_runs
  for select to authenticated
  using (public.is_courier_office());

drop policy if exists import_runs_insert on public.import_runs;
create policy import_runs_insert on public.import_runs
  for insert to authenticated
  with check (public.is_courier_office() and created_by = auth.uid());

drop policy if exists import_runs_update on public.import_runs;
create policy import_runs_update on public.import_runs
  for update to authenticated
  using (public.is_courier_office())
  with check (public.is_courier_office());

-- ---------------------------------------------------------------------------
-- 4. The undo itself
-- ---------------------------------------------------------------------------

-- Reversing an import is not table surgery. Publication membership is a
-- projection of the stop_publication_events log -- see
-- apply_stop_publication_event -- so the way to take a publication back off an
-- address is to log the opposite event and let the same trigger apply it. That
-- keeps stop_publications, the stops.active invariant and the cover sheet all
-- consistent by construction.
--
-- Two shapes, handled differently:
--
--   * A publication turned on or off at an address that already existed is
--     reversed by an opposite event. If the original has not yet reached a
--     booklet, netPendingEvent cancels the pair and the courier sees nothing.
--     If it HAS been printed, the reversal prints next week -- which is right,
--     because the courier acted on the first one.
--
--   * An address the import created is deleted outright, along with its events,
--     its publication links and its route entry. A counter-event would leave a
--     retired stop and an orphan route row behind. Guarded: if anything has
--     touched that stop since the import, it is left alone and reported, rather
--     than destroying work somebody did on top of it.
--
-- SECURITY DEFINER because it writes route_entries and deletes stops, neither
-- of which a client may do directly. Permission is therefore checked here.
create or replace function public.undo_import_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.import_runs;
  v_reversed integer := 0;
  v_deleted integer := 0;
  v_kept integer := 0;
  v_event record;
  v_stop record;
  v_foreign integer;
begin
  if not public.is_courier_office() then
    raise exception 'Only the courier office can undo an import.'
      using errcode = '42501';
  end if;

  select * into v_run from public.import_runs where id = p_run_id for update;
  if not found then
    raise exception 'That import run does not exist.' using errcode = 'P0002';
  end if;
  if v_run.undone_at is not null then
    raise exception 'That import was already undone on %.', v_run.undone_at
      using errcode = 'P0001';
  end if;

  -- Addresses this run created. Deleted, newest first, but only where nothing
  -- has been added on top of them since.
  for v_stop in
    select id from public.stops where import_run_id = p_run_id order by created_at desc
  loop
    select count(*) into v_foreign
    from public.stop_publication_events e
    where e.stop_id = v_stop.id
      and (e.import_run_id is distinct from p_run_id);

    if v_foreign > 0 then
      v_kept := v_kept + 1;
      continue;
    end if;

    delete from public.route_entries where stop_id = v_stop.id;
    delete from public.stop_publication_events where stop_id = v_stop.id;
    delete from public.stop_publications where stop_id = v_stop.id;
    delete from public.stop_instruction_changes where stop_id = v_stop.id;
    delete from public.complaints where stop_id = v_stop.id;
    delete from public.stops where id = v_stop.id;
    v_deleted := v_deleted + 1;
  end loop;

  -- Publication changes this run made to addresses that already existed. The
  -- stops deleted above took their own events with them, so anything left here
  -- belongs to a pre-existing address.
  for v_event in
    select e.id, e.stop_id, e.publication_id, e.event_type
    from public.stop_publication_events e
    where e.import_run_id = p_run_id
    order by e.created_at desc
  loop
    insert into public.stop_publication_events (stop_id, publication_id, event_type)
    values (
      v_event.stop_id,
      v_event.publication_id,
      case when v_event.event_type = 'added' then 'removed' else 'added' end
    );
    v_reversed := v_reversed + 1;
  end loop;

  update public.import_runs
     set undone_at = now(), undone_by = auth.uid()
   where id = p_run_id;

  return jsonb_build_object(
    'reversed', v_reversed,
    'deleted', v_deleted,
    'kept_because_edited', v_kept
  );
end;
$$;

revoke execute on function public.undo_import_run(uuid) from public, anon;
grant execute on function public.undo_import_run(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Creating a stop as part of a run
-- ---------------------------------------------------------------------------

-- Same function as before plus the run id, so an undo can find what it made.
-- The old four-argument signature is dropped rather than left around, so a
-- caller cannot accidentally create an untracked stop.
create or replace function public.create_stop_in_route(
  p_zone_id uuid,
  p_recipient_name text,
  p_house_number text,
  p_street text,
  p_floor_side text,
  p_special_instructions text,
  p_publication_ids uuid[],
  p_import_run_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stop_id uuid;
  v_next_seq integer;
  v_pub uuid;
begin
  if not (
    public.is_courier_office()
    or exists (select 1 from public.user_publication_access where user_id = auth.uid())
  ) then
    raise exception 'You do not have permission to add addresses.'
      using errcode = '42501';
  end if;

  if not public.is_courier_office() then
    if exists (
      select 1
      from unnest(coalesce(p_publication_ids, '{}'::uuid[])) as pid
      where pid not in (select public.accessible_publication_ids())
    ) then
      raise exception 'You cannot assign a publication you do not have access to.'
        using errcode = '42501';
    end if;
  end if;

  insert into public.stops (
    zone_id, recipient_name, house_number, street, floor_side, special_instructions,
    import_run_id
  )
  values (
    p_zone_id,
    nullif(btrim(coalesce(p_recipient_name, '')), ''),
    p_house_number,
    p_street,
    nullif(btrim(coalesce(p_floor_side, '')), ''),
    nullif(btrim(coalesce(p_special_instructions, '')), ''),
    p_import_run_id
  )
  returning id into v_stop_id;

  foreach v_pub in array coalesce(p_publication_ids, '{}'::uuid[])
  loop
    insert into public.stop_publication_events (stop_id, publication_id, event_type, import_run_id)
    values (v_stop_id, v_pub, 'added', p_import_run_id);
  end loop;

  -- Appended to the end of the route rather than guessed into position: a
  -- street can appear in several separate blocks of one route (Shenandoah Dr
  -- three times in zone 1), so "after the last stop on this street" would often
  -- be the wrong place. Sequencing is the courier office's call.
  select coalesce(max(sequence), 0) + 1 into v_next_seq
  from public.route_entries
  where zone_id = p_zone_id;

  insert into public.route_entries (zone_id, sequence, kind, stop_id)
  values (p_zone_id, v_next_seq, 'stop', v_stop_id);

  return v_stop_id;
end;
$$;

drop function if exists public.create_stop_in_route(uuid, text, text, text, text, text, uuid[]);

revoke execute on function public.create_stop_in_route(uuid, text, text, text, text, text, uuid[], uuid)
  from public, anon;
grant execute on function public.create_stop_in_route(uuid, text, text, text, text, text, uuid[], uuid)
  to authenticated;
