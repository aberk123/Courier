-- Courier office manages other users' profiles (courier-office flag, name)
-- from the new Manage Users page. Self-update stays implicit via this same
-- policy since is_courier_office() is true for the office itself.
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_courier_office())
  with check (public.is_courier_office());
