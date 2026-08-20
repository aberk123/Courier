@AGENTS.md

# Lakewood Courier dashboard

Start every session by reading `docs/handoff.md` (imported below): it is the
current state of the work, the immediate next task, and the mistakes already
made once.

`docs/domain-notes.md` is the requirements record — the authority on what to
build and what Ari has decided. Read the relevant section before changing
behaviour, and record any new decision there rather than only in chat.

Run `supabase/tests/rls.sh` after touching any RLS policy, trigger, or grant.
Verifying with `service_role` or the Supabase MCP proves nothing about what a
real signed-in user can do.

@docs/handoff.md
