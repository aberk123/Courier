-- Two corrections to address_rulings, both found by review before it was used.
--
-- 1. The unique constraint deduplicated nothing. Postgres unique constraints are
--    NULLS DISTINCT by default, and both house_number and publication_id are
--    routinely null -- publication_id is null whenever the upload is a file with
--    its own action column. So a `not_ours` and an `ours` for the same address
--    could both be stored, and which one the importer honoured was whatever order
--    PostgREST happened to return. Verified against Postgres 16: the same ruling
--    inserted twice gave two rows.
--
-- 2. A ruling is always about ONE ADDRESS. The street-level scope was written for
--    a case nothing creates, and defending against it caused two defects: a
--    street-level `ours` was silently discarded, and a street-level `not_ours`
--    could reach the addresses we serve when the master list spelled the street
--    its own way (our Vine Ave is written VINE ST, so the guard's "do we hold
--    this street" test missed and five real Vine Ave rows went to blocked).
--    Removing the scope removes both.

delete from public.address_rulings where house_number is null;

alter table public.address_rulings
  alter column house_number set not null;

alter table public.address_rulings
  drop constraint if exists address_rulings_street_house_number_publication_id_key;

alter table public.address_rulings
  add constraint address_rulings_address_key
  unique nulls not distinct (street, house_number, publication_id);

comment on column public.address_rulings.house_number is
  'Always set. A ruling is about one address; there is deliberately no way to '
  'rule out a whole street, because a street we deliver on is spelled several '
  'ways in the master list and a street-wide answer would blank the doors we serve.';
