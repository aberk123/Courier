# Handoff — read this first

Written 2026-08-20 at the end of a session, for whoever (or whatever) picks
this up next. `docs/domain-notes.md` is the requirements record and is the
authority on *what* to build; this file is the current *state* of the work.

## What this is

A subscription-list and courier-route dashboard for **The Voice of Lakewood**
(Ari Berkowitz), working with **The Lakewood Courier** (Amrom Jacobovics,
732-666-1311). It replaces a manual paper process: the office marks up route
booklets by hand each week and the courier re-keys them.

Requirements came from a 2026-08-13 call plus Amrom's emailed route
spreadsheets. Every decision Ari has confirmed is recorded in
`docs/domain-notes.md` — read it before changing behaviour, and add to it when
he decides something new.

## Where the work stands

Built and pushed:

- Zone/route workspace, in route order by default, with publication scoping
- Five real routes imported from Amrom's spreadsheets (~8,000 publication links)
- Cover sheet (Additions / Deletions / Changes / Complaints) per route
- Booklet PDF export, per route, filtered to selected publications
- Weekly import: CSV/xlsx upload, fuzzy address matching, auto route assignment
- Manage Users page: invite, publication scoping, password-reset links
- RLS throughout, with a regression suite (`supabase/tests/rls.sh`)

Deliberately deferred by Ari — do not build these without being asked:

- Master-list reconciliation across all routes (MVP is five routes only)
- Courier check-off app and SMS check-off
- Courier-to-route assignment

## The immediate next task

**Browser-test the app.** Nothing has ever been exercised in a real browser —
the previous sandbox was blocked by network policy from reaching
`*.supabase.co`, so every screen is unverified against live data. The build is
clean and the logic is tested, but that is not the same thing.

A Supabase dev branch exists for exactly this. Do not browser-test against
production.

## Supabase projects

| Purpose | Project ref | Contains |
| --- | --- | --- |
| Production | `qysltpkdmuozsphftzps` | The real subscriber list. Read freely; do not write casually. |
| Test branch `browser-testing` | `txfulvngxgjwdoicurdv` | Same schema, synthetic fixture only. Write freely. |

The branch costs about $9.70/month while it exists. Ask Ari before deleting it,
and remind him it is still running if the testing work is finished.

### Getting the app pointed at the branch

`.env.branch.local` is gitignored, so it does not survive into a fresh clone.
Regenerate it with the Supabase MCP tools (`get_project_url` and
`get_publishable_keys` against `txfulvngxgjwdoicurdv`):

```
NEXT_PUBLIC_SUPABASE_URL=https://txfulvngxgjwdoicurdv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

Then `cp` it to `.env.local`, `npm install`, `npm run dev`. Chromium is
preinstalled at `/opt/pw-browsers/chromium` with `PLAYWRIGHT_BROWSERS_PATH`
already set — do not run `playwright install`.

Test logins on the branch are `office@example.test` (courier office, sees
everything) and `voice@example.test` (Voice-only, publication-scoped). The
passwords are not committed. If they are lost, reset them:

```sql
update auth.users set encrypted_password = crypt('<new password>', gen_salt('bf'))
where email = 'office@example.test';
```

## Gotchas that have already cost time

- **`service_role` bypasses RLS entirely.** Anything verified only through the
  Supabase MCP or a service-role client proves nothing about what a real user
  can do. A whole class of bug hid behind this: `apply_stop_publication_event`
  silently failed for every signed-in user, so removing a publication logged the
  deletion while the address kept receiving the paper. Run
  `supabase/tests/rls.sh` after touching any policy, trigger, or grant.
- **Never revoke EXECUTE from `PUBLIC` on a function referenced by an RLS
  policy.** Postgres enforces function permissions inside policy expressions, so
  it fails every query for every user with `42501` — not a permission denial, a
  hard error. This broke production once. `is_courier_office`,
  `can_access_stop`, and `accessible_publication_ids` must keep their grants.
  Trigger functions are different: firing does not consult the caller's EXECUTE.
- **Before modifying an RLS policy, read the live one first**
  (`select policyname, qual from pg_policies where ...`). Drop-and-recreate
  reproduces every clause or silently loses one.
- **Cookies cannot be set during a Server Component render** in Next.js — only
  from a Route Handler or Server Action. `lib/supabase/server.ts` swallows the
  failure in a try/catch, so session loss is silent. Auth token exchange belongs
  in `/auth/confirm`, not in a page.
- **PostgREST cannot span a transaction across calls**, and `INSERT ...
  RETURNING` is filtered by the SELECT policy. That is why creating an address
  goes through the `create_stop_in_route` RPC rather than three client writes.
- **Use `exceljs`, not `xlsx`** — the latter has two high-severity advisories
  with no fix available.
- Next.js treats underscore-prefixed app directories as private; a route in one
  will 404 with no error.
- On Node >= 22.21 behind a proxy, set `NODE_USE_ENV_PROXY=1` or the Supabase
  client's `fetch` silently bypasses the proxy.

## Verifying schema drift

The migration files reproduce production exactly as of 2026-08-20 — columns,
constraints, indexes, function bodies, and all 18 policies match by checksum.
`supabase/tests/rls.sh` replays them into a throwaway local Postgres, so it is
also a drift check. Keep it that way: apply schema changes as migration files,
not as ad-hoc SQL in the dashboard.

## Open with Ari

- Leaked-password protection is still disabled (Supabase → Authentication →
  Sign In / Providers → Email). It cannot be set via SQL.
- The real weekly spreadsheet from The Voice has never been seen. The importer
  matches header names loosely and will probably need new aliases on first
  contact; if the address arrives as one cell rather than separate house-number
  and street columns, that needs a small parser change.
- Two working assumptions are noted at the bottom of `docs/domain-notes.md`
  under "Items to confirm with Amrom". Neither blocks anything.
