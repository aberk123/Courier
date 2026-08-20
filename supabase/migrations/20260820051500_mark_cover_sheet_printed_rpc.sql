-- The three log tables have SELECT and INSERT policies but no UPDATE, so
-- stamping shown_on_cover_sheet_at would fail outright. Rather than open a
-- broad UPDATE policy on all three (which would also permit rewriting
-- descriptions), this does the stamping in one checked, atomic call.
--
-- Printing/exporting is the courier office's job per the requirements, so this
-- is gated on that. SECURITY DEFINER, so the check is explicit.
create or replace function public.mark_cover_sheet_printed(
  p_zone_id uuid,
  p_publication_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_n integer;
begin
  if not public.is_courier_office() then
    raise exception 'Only the courier office can mark a booklet as printed.'
      using errcode = '42501';
  end if;

  -- Additions/deletions are stamped only for the publications this booklet
  -- covered; a Shopper-only run must not bury pending Voice changes.
  update public.stop_publication_events e
     set shown_on_cover_sheet_at = now()
    from public.stops s
   where e.stop_id = s.id
     and s.zone_id = p_zone_id
     and e.shown_on_cover_sheet_at is null
     and e.publication_id = any(coalesce(p_publication_ids, '{}'::uuid[]));
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- Instruction changes and complaints are address-level, not per-publication,
  -- so they are stamped whenever the zone is printed.
  update public.stop_instruction_changes c
     set shown_on_cover_sheet_at = now()
    from public.stops s
   where c.stop_id = s.id
     and s.zone_id = p_zone_id
     and c.shown_on_cover_sheet_at is null;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  update public.complaints c
     set shown_on_cover_sheet_at = now()
    from public.stops s
   where c.stop_id = s.id
     and s.zone_id = p_zone_id
     and c.shown_on_cover_sheet_at is null;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  return v_total;
end;
$$;

revoke execute on function public.mark_cover_sheet_printed(uuid, uuid[]) from public, anon;
grant execute on function public.mark_cover_sheet_printed(uuid, uuid[]) to authenticated;
