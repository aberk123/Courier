-- Stop the SECURITY DEFINER helpers being callable as public RPC endpoints
-- (/rest/v1/rpc/...) by browser clients. They exist to be referenced from RLS
-- policies and triggers, not to be called directly.
--
-- NOTE: this migration over-revoked; see the follow-up migration
-- restore_execute_for_rls_helpers, which grants EXECUTE back to `authenticated`
-- for the three functions that RLS policies reference. Both are kept so the
-- recorded history matches what actually ran against the database.
revoke execute on function public.is_courier_office(uuid) from public, anon, authenticated;
revoke execute on function public.can_access_stop(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.accessible_publication_ids(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- The two trigger functions were the only ones left with a caller-mutable
-- search_path. Both already fully-qualify everything they touch, so pinning
-- this changes no behavior -- it just removes the object-shadowing vector.
-- Matches the search_path=public already set on the four functions above.
alter function public.set_updated_at() set search_path = public;
alter function public.apply_stop_publication_event() set search_path = public;
