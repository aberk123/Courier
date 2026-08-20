-- Creating an address has to do three things atomically: insert the stop,
-- record its publication events, and place it in the route sequence. Doing
-- that from the client is not possible:
--   * PostgREST cannot span a transaction across calls, so a failure halfway
--     leaves an orphan stop.
--   * The INSERT ... RETURNING is filtered by stops_select (can_access_stop),
--     which is false for a stop that has no publications yet -- so a
--     publication-scoped staffer's insert returns no row at all.
--   * route_entries writes are courier-office only, so scoped staff could
--     never place their own new address in the route.
--
-- SECURITY DEFINER to get past those, which means permissions must be checked
-- explicitly in here -- RLS is NOT doing it for us.
create or replace function public.create_stop_in_route(
  p_zone_id uuid,
  p_recipient_name text,
  p_house_number text,
  p_street text,
  p_floor_side text,
  p_special_instructions text,
  p_publication_ids uuid[]
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
  -- Mirrors the stops_insert policy.
  if not (
    public.is_courier_office()
    or exists (select 1 from public.user_publication_access where user_id = auth.uid())
  ) then
    raise exception 'You do not have permission to add addresses.'
      using errcode = '42501';
  end if;

  -- Mirrors the stop_publication_events_insert policy: you may only assign
  -- publications you actually have access to.
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
    zone_id, recipient_name, house_number, street, floor_side, special_instructions
  )
  values (
    p_zone_id,
    nullif(btrim(coalesce(p_recipient_name, '')), ''),
    p_house_number,
    p_street,
    nullif(btrim(coalesce(p_floor_side, '')), ''),
    nullif(btrim(coalesce(p_special_instructions, '')), '')
  )
  returning id into v_stop_id;

  foreach v_pub in array coalesce(p_publication_ids, '{}'::uuid[])
  loop
    insert into public.stop_publication_events (stop_id, publication_id, event_type)
    values (v_stop_id, v_pub, 'added');
  end loop;

  -- Appended to the end of the route rather than guessed into position: a
  -- street can appear in several separate blocks of one route (SHENANDOAH DR
  -- shows up three times in zone 1), so "after the last stop on this street"
  -- would often be the wrong place. Sequencing is the courier office's call.
  select coalesce(max(sequence), 0) + 1 into v_next_seq
  from public.route_entries
  where zone_id = p_zone_id;

  insert into public.route_entries (zone_id, sequence, kind, stop_id)
  values (p_zone_id, v_next_seq, 'stop', v_stop_id);

  return v_stop_id;
end;
$$;

revoke execute on function public.create_stop_in_route(uuid, text, text, text, text, text, uuid[])
  from public, anon;
grant execute on function public.create_stop_in_route(uuid, text, text, text, text, text, uuid[])
  to authenticated;
