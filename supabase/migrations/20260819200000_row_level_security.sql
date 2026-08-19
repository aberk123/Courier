-- Access control: role x publication (courier office sees everything;
-- publication-scoped staff see only stops tied to their publications).

create or replace function public.is_courier_office(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_courier_office from public.profiles where id = p_user_id),
    false
  );
$$;

create or replace function public.accessible_publication_ids(p_user_id uuid default auth.uid())
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.publications where public.is_courier_office(p_user_id)
  union
  select publication_id from public.user_publication_access where user_id = p_user_id;
$$;

-- A stop is visible if it currently receives at least one publication
-- the caller can access. A stop with zero current publications (e.g.
-- mid-creation) is visible only to courier office.
create or replace function public.can_access_stop(p_stop_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_courier_office(p_user_id) or exists (
    select 1 from public.stop_publications sp
    where sp.stop_id = p_stop_id
      and sp.publication_id in (select public.accessible_publication_ids(p_user_id))
  );
$$;

alter table public.publications enable row level security;
alter table public.zones enable row level security;
alter table public.stops enable row level security;
alter table public.route_entries enable row level security;
alter table public.stop_publications enable row level security;
alter table public.stop_publication_events enable row level security;
alter table public.stop_instruction_changes enable row level security;
alter table public.complaints enable row level security;
alter table public.profiles enable row level security;
alter table public.user_publication_access enable row level security;

-- Lookup tables: not sensitive on their own.
create policy publications_select on public.publications
  for select to authenticated using (true);

create policy zones_select on public.zones
  for select to authenticated using (true);

-- Stops
create policy stops_select on public.stops
  for select to authenticated using (public.can_access_stop(id));

create policy stops_insert on public.stops
  for insert to authenticated with check (
    public.is_courier_office()
    or exists (select 1 from public.user_publication_access where user_id = auth.uid())
  );

create policy stops_update on public.stops
  for update to authenticated
  using (public.can_access_stop(id))
  with check (public.can_access_stop(id));

-- No delete policy: stops are soft-deleted via `active`, matching the
-- existing soft-delete convention found in the real zone files.

-- Route entries: direction text isn't publication-specific; stop rows
-- inherit the underlying stop's access boundary. Only courier office
-- edits sequencing (driving order is their operational concern).
create policy route_entries_select on public.route_entries
  for select to authenticated using (
    kind = 'direction' or public.can_access_stop(stop_id)
  );

create policy route_entries_write on public.route_entries
  for all to authenticated
  using (public.is_courier_office())
  with check (public.is_courier_office());

-- Stop publications (current state): readable/writable by anyone
-- scoped to that publication or courier office. This is the real
-- access-boundary enforcement point for cross-publication data leaks.
create policy stop_publications_select on public.stop_publications
  for select to authenticated using (
    public.is_courier_office()
    or publication_id in (select public.accessible_publication_ids())
  );

create policy stop_publication_events_select on public.stop_publication_events
  for select to authenticated using (
    public.is_courier_office()
    or publication_id in (select public.accessible_publication_ids())
  );

create policy stop_publication_events_insert on public.stop_publication_events
  for insert to authenticated with check (
    public.is_courier_office()
    or publication_id in (select public.accessible_publication_ids())
  );

-- Instruction changes and complaints are address-level, not tied to a
-- single publication -- scoped via the stop's current publications.
create policy stop_instruction_changes_select on public.stop_instruction_changes
  for select to authenticated using (public.can_access_stop(stop_id));

create policy stop_instruction_changes_insert on public.stop_instruction_changes
  for insert to authenticated with check (public.can_access_stop(stop_id));

create policy complaints_select on public.complaints
  for select to authenticated using (public.can_access_stop(stop_id));

create policy complaints_insert on public.complaints
  for insert to authenticated with check (public.can_access_stop(stop_id));

-- Profiles and access grants: self-service read, courier office manages access.
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_courier_office());

create policy user_publication_access_select on public.user_publication_access
  for select to authenticated using (user_id = auth.uid() or public.is_courier_office());

create policy user_publication_access_write on public.user_publication_access
  for all to authenticated
  using (public.is_courier_office())
  with check (public.is_courier_office());
