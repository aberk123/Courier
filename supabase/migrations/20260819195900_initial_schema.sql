-- Core catalog tables

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique,
  name text,
  created_at timestamptz not null default now()
);

-- Stops are stable identities so complaints/changes/events can reference
-- them across weeks, independent of their position in a route.
create table public.stops (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete restrict,
  recipient_name text,
  house_number text not null,
  street text not null,
  floor_side text,
  special_instructions text,
  special_instructions_2 text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stops_zone_id_idx on public.stops(zone_id);

-- One ordered sequence per zone interleaving free-text driving directions
-- and stops, matching the real zone-file structure (direction rows and
-- address rows are one sequence, not two tables joined at render time).
create table public.route_entries (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  sequence integer not null,
  kind text not null check (kind in ('direction', 'stop')),
  direction_text text,
  stop_id uuid references public.stops(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (zone_id, sequence),
  constraint route_entries_kind_shape check (
    (kind = 'direction' and direction_text is not null and stop_id is null) or
    (kind = 'stop' and stop_id is not null and direction_text is null)
  )
);

create index route_entries_stop_id_idx on public.route_entries(stop_id);

-- Current state: which publications a stop receives right now.
create table public.stop_publications (
  stop_id uuid not null references public.stops(id) on delete cascade,
  publication_id uuid not null references public.publications(id) on delete cascade,
  primary key (stop_id, publication_id)
);

create index stop_publications_publication_id_idx on public.stop_publications(publication_id);

-- Historical log driving the cover sheet's Additions/Deletions sections
-- and general reporting. shown_on_cover_sheet_at null = still pending
-- for the next cover sheet; set = permanently excluded from future
-- cover sheets but retained for reporting.
create table public.stop_publication_events (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.stops(id) on delete cascade,
  publication_id uuid not null references public.publications(id) on delete restrict,
  event_type text not null check (event_type in ('added', 'removed')),
  created_at timestamptz not null default now(),
  shown_on_cover_sheet_at timestamptz
);

create index stop_publication_events_stop_id_idx on public.stop_publication_events(stop_id);
create index stop_publication_events_publication_id_idx on public.stop_publication_events(publication_id);
create index stop_publication_events_pending_idx on public.stop_publication_events(shown_on_cover_sheet_at) where shown_on_cover_sheet_at is null;

-- Cover sheet's Changes section (Upstairs/Basement/Apt # updates to an
-- existing stop's special instructions). Same shown-once pattern as
-- publication events and complaints.
create table public.stop_instruction_changes (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.stops(id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now(),
  shown_on_cover_sheet_at timestamptz
);

create index stop_instruction_changes_stop_id_idx on public.stop_instruction_changes(stop_id);
create index stop_instruction_changes_pending_idx on public.stop_instruction_changes(shown_on_cover_sheet_at) where shown_on_cover_sheet_at is null;

-- Complaints: subscriber-originated, tied to a stop, shown to the
-- courier exactly once, retained indefinitely for reporting. No
-- separate resident-facing resolved status exists.
create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.stops(id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now(),
  shown_on_cover_sheet_at timestamptz
);

create index complaints_stop_id_idx on public.complaints(stop_id);
create index complaints_pending_idx on public.complaints(shown_on_cover_sheet_at) where shown_on_cover_sheet_at is null;

-- Access model: role x publication, not a flat role.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  is_courier_office boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.user_publication_access (
  user_id uuid not null references public.profiles(id) on delete cascade,
  publication_id uuid not null references public.publications(id) on delete cascade,
  primary key (user_id, publication_id)
);

-- Keep stop_publications (current state) in sync with the event log,
-- so the app only ever needs to write one event, not two tables.
create or replace function public.apply_stop_publication_event()
returns trigger
language plpgsql
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

create trigger trg_apply_stop_publication_event
after insert on public.stop_publication_events
for each row execute function public.apply_stop_publication_event();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_stops_updated_at
before update on public.stops
for each row execute function public.set_updated_at();

-- New auth.users row gets a profile row automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Seed the confirmed publication catalog.
insert into public.publications (code, name) values
  ('bp', 'BP'),
  ('voice', 'The Voice'),
  ('shopper', 'Shopper'),
  ('yated', 'Yated'),
  ('mishpacha', 'Mishpacha'),
  ('ami', 'Ami'),
  ('circle', 'Circle'),
  ('hamodia', 'Hamodia'),
  ('bina', 'Bina'),
  ('dee_voch', 'Dee Voch'),
  ('hundred', 'Hundred'),
  ('wellsprings', 'Wellsprings'),
  ('lakewood_courier', 'Lakewood Courier'),
  ('kindline', 'Kindline'),
  ('shtenderel', 'Shtenderel');

-- MVP zone placeholders. Real stop/route data is imported separately,
-- not fabricated in a migration.
insert into public.zones (number) values (1), (2), (3), (4), (5);
