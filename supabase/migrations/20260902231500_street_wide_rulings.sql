-- A street-wide ruling: house_number NULL means the whole street. Exists for
-- boundary facts like "Henry St beyond our 28–111 is across Route 9 — a
-- different route" (Ari, 2026-09-02), so a NEW house number on the far side
-- does not re-ask every week. Constrained to not_ours: a street-wide "ours"
-- would confirm every house on the street, and the matcher additionally
-- refuses to apply a street-wide not_ours to any address we deliver (the
-- recorded Vine Ave trap).
alter table public.address_rulings alter column house_number drop not null;
alter table public.address_rulings
  add constraint street_wide_is_not_ours check (house_number is not null or ruling = 'not_ours');
