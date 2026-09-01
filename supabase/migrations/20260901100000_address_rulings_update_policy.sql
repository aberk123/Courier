-- Changing a recorded answer must actually work. recordRuling upserts with
-- ON CONFLICT DO UPDATE ("changing your mind replaces the old answer"), and
-- Postgres enforces the UPDATE policy on that path -- but the table shipped
-- with only SELECT/INSERT/DELETE policies, so the office's SECOND click on the
-- same address failed with an RLS violation. The rls.sh test for it passed
-- vacuously: its fixture insert rolled back with each as() block, so the
-- conflict never fired. Found by adversarial review 2026-09-01, reproduced
-- against the replayed migrations.

drop policy if exists address_rulings_update on public.address_rulings;
create policy address_rulings_update on public.address_rulings
  for update to authenticated
  using (public.is_courier_office())
  with check (public.is_courier_office());
