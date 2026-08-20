-- Corrects the previous migration.
--
-- Revoking EXECUTE from PUBLIC as well as anon/authenticated left the
-- `authenticated` role with no EXECUTE at all, and Postgres DOES enforce
-- function permissions inside RLS policy expressions. Every select against
-- stops / route_entries then failed outright with:
--     42501: permission denied for function can_access_stop
--
-- These three are referenced by RLS policies, so `authenticated` must keep
-- EXECUTE. What the previous migration usefully removed still stands: the
-- blanket PUBLIC grant and the anon grant are gone (every policy is
-- `to authenticated`, so anon has no legitimate use for them).
grant execute on function public.is_courier_office(uuid) to authenticated;
grant execute on function public.can_access_stop(uuid, uuid) to authenticated;
grant execute on function public.accessible_publication_ids(uuid) to authenticated;

-- handle_new_user is deliberately NOT restored. It is only ever invoked by the
-- trigger on auth.users, and Postgres checks EXECUTE at CREATE TRIGGER time,
-- not at fire time -- verified with an isolated fixture: a trigger function
-- with EXECUTE revoked from PUBLIC/anon/authenticated still fires for an
-- `authenticated` caller.
