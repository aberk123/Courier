-- Answers the office has already given, so the same question is not asked every
-- week.
--
-- Ari, 2026-08-31, asked whether this was worth building: "Yes, it does make
-- sense to build something to record decisions about specific addresses so that
-- we don't have to answer the same questions every week."
--
-- The problem it solves, measured on the 27 Aug master list: of the questions the
-- weekly import puts to the office, 55 are "this house number is outside the
-- stretch of that street our routes cover" -- 106 VINE AVENUE, 921 CLAIRE DR.
-- The answer is the same this week, next week and next year, because it is a
-- fact about geography rather than about the roster. There was nowhere to put it,
-- so the office re-answered all of them every week.
--
-- A ruling is deliberately about an ADDRESS or a STREET, never about a
-- subscriber. Subscribers come and go; "Bruce St is a real Lakewood street we do
-- not deliver to" does not.

create table if not exists public.address_rulings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,

  -- Normalised the same way the matcher normalises, so a ruling recorded against
  -- "Bruce St" also answers "BRUCE STREET".
  street text not null,
  -- Null means the whole street. A house number narrows it to one address.
  house_number text,

  -- Null means every publication. Set it when a street is off one publication's
  -- round but not another's.
  publication_id uuid references public.publications(id) on delete cascade,

  ruling text not null check (ruling in ('not_ours', 'ours')),

  -- Why, in the office's own words. Shown back to them next time it applies.
  note text,

  unique (street, house_number, publication_id)
);

comment on table public.address_rulings is
  'Answers the office has already given about an address or a street, so the '
  'weekly import stops asking. not_ours = not on any of our routes, stop '
  'proposing it. ours = it is on our routes, so do not treat it as out of area.';

create index if not exists address_rulings_street_idx on public.address_rulings (street);

alter table public.address_rulings enable row level security;

-- Courier office only, matching Manage Users and the import screen itself: a
-- ruling changes what every future import proposes.
drop policy if exists address_rulings_select on public.address_rulings;
create policy address_rulings_select on public.address_rulings
  for select to authenticated
  using (public.is_courier_office());

drop policy if exists address_rulings_insert on public.address_rulings;
create policy address_rulings_insert on public.address_rulings
  for insert to authenticated
  with check (public.is_courier_office() and created_by = auth.uid());

drop policy if exists address_rulings_delete on public.address_rulings;
create policy address_rulings_delete on public.address_rulings
  for delete to authenticated
  using (public.is_courier_office());
