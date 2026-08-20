-- Whole-address removal, per Ari's decisions of 2026-08-20 (recorded in
-- docs/domain-notes.md).
--
-- The bug this fixes: "Remove this address" was a bare
-- `update stops set active = false`. That pulled the address out of *every*
-- publication's booklet at once while logging nothing, so:
--
--   * no Deletion row appeared on any cover sheet -- the courier was never
--     told to stop delivering;
--   * stop_publications still claimed the address was subscribed;
--   * a publication-scoped staffer could therefore end another publication's
--     delivery to a shared address, silently. Reproduced in the browser as
--     voice@example.test on 28 SQUANKUM RD, which receives Voice and Shopper.
--
-- The decisions:
--   (a) a scoped staffer's "remove" drops only the publications they control;
--       the address stays on the route if another publication still wants it.
--   (b) retiring a whole address logs one `removed` event per publication it
--       still receives, so each paper gets its own Deletion row in the
--       confirmed per-publication format.
--
-- Both fall out of one invariant, enforced below: **an address is active if
-- and only if it still receives at least one publication.** Deactivation stops
-- being something a client asks for directly and becomes a consequence of
-- removing the last publication -- which is already permission-checked by the
-- stop_publication_events INSERT policy and already produces the cover-sheet
-- row.

-- 1. Removal goes through one atomic, explicitly-checked call.
--
-- SECURITY DEFINER for the same reasons as create_stop_in_route: PostgREST
-- cannot span a transaction across calls, and the last `removed` event makes
-- the stop invisible to can_access_stop mid-way through, so a scoped staffer's
-- own follow-up writes would start failing. Permissions are therefore checked
-- explicitly in here -- RLS is NOT doing it for us.
create or replace function public.remove_stop_publications(p_stop_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed integer := 0;
  v_remaining integer;
begin
  if not public.can_access_stop(p_stop_id) then
    raise exception 'You do not have access to this address.'
      using errcode = '42501';
  end if;

  insert into public.stop_publication_events (stop_id, publication_id, event_type)
  select p_stop_id, sp.publication_id, 'removed'
    from public.stop_publications sp
   where sp.stop_id = p_stop_id
     and (
       public.is_courier_office()
       or sp.publication_id in (select public.accessible_publication_ids())
     );

  get diagnostics v_removed = row_count;

  if v_removed = 0 then
    raise exception 'There is nothing here for you to remove.'
      using errcode = '42501';
  end if;

  select count(*) into v_remaining
    from public.stop_publications
   where stop_id = p_stop_id;

  if v_remaining = 0 then
    update public.stops set active = false where id = p_stop_id;
  end if;

  return v_removed;
end;
$$;

revoke execute on function public.remove_stop_publications(uuid) from public, anon;
grant execute on function public.remove_stop_publications(uuid) to authenticated;

-- 2. Enforce the invariant, so the event log cannot be sidestepped.
--
-- stops_update is `can_access_stop`, which is true for a Voice staffer on a
-- shared address -- so without this, a forged request could still flip
-- `active` directly and skip the event log entirely. Guarding on the data
-- rather than on the caller's role is what makes that impossible: the only way
-- to reach zero publications is to insert `removed` events, and those are
-- permission-checked and do show up on the cover sheet.
--
-- Deliberately one-directional. Nothing here requires an active stop to have a
-- publication, because create_stop_in_route inserts the stop before its
-- publication events and would otherwise fail on its own first statement.
create or replace function public.enforce_stop_active_invariant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.active and not new.active then
    if exists (select 1 from public.stop_publications where stop_id = new.id) then
      raise exception
        'Remove the publications this address receives before retiring it; use remove_stop_publications().'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_stop_active_invariant on public.stops;
create trigger trg_enforce_stop_active_invariant
before update on public.stops
for each row execute function public.enforce_stop_active_invariant();

-- 3. Re-adding a publication brings a retired address back.
--
-- Without this the invariant is one-way: an address retired by mistake, or
-- dropped and then re-subscribed by a later weekly import, would keep
-- active = false and stay off the route while stop_publications insisted it
-- was subscribed -- the same class of split-brain this migration is fixing.
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

    update public.stops
       set active = true
     where id = new.stop_id
       and not active;
  elsif new.event_type = 'removed' then
    delete from public.stop_publications
    where stop_id = new.stop_id and publication_id = new.publication_id;
  end if;
  return new;
end;
$$;

-- 4. Repair addresses already retired by the old code path.
--
-- These are inactive but still carry stop_publications rows and logged no
-- `removed` event, so they violate the invariant the trigger now enforces and
-- their deletions never reached a cover sheet. Log the missing events (which
-- clears the lookup rows via the trigger) so the courier is finally told.
-- Backdated to the stop's own updated_at, not now(), so the cover sheet shows
-- when the office actually removed it.
insert into public.stop_publication_events (stop_id, publication_id, event_type, created_at)
select sp.stop_id, sp.publication_id, 'removed', s.updated_at
  from public.stop_publications sp
  join public.stops s on s.id = sp.stop_id
 where not s.active;
