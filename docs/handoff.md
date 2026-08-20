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
- Manage Users page: invite, edit (email/name), delete, publication scoping,
  password-reset links
- RLS throughout, with a regression suite (`supabase/tests/rls.sh`)

Deliberately deferred by Ari — do not build these without being asked:

- Master-list reconciliation across all routes (MVP is five routes only)
- Courier check-off app and SMS check-off
- Courier-to-route assignment

## Browser testing — done 2026-08-20

Every screen has now been driven in real Chromium against the test branch, as
both `office@example.test` and `voice@example.test`, with each write verified in
the database afterwards. Scripts are throwaway (they lived in the session
scratchpad), but what they covered:

- Auth: unauthenticated deep links redirect, bad credentials error correctly,
  both logins work, signed-in `/login` bounces home, sign-out clears the cookie.
- Zone workspace: route order, search (including matching on instructions),
  publication toggle on *and* off, details edit, complaint, add address, remove
  address. All landed correctly in the database.
- Cover sheet: all four sections populate, publication chips scope the export,
  "Mark as printed" stamps only the selected publications and leaves the others
  pending — verified with a Voice-only run against pending Shopper events.
- Booklet PDF: real multi-page PDFs, correct per-publication scoping, standing
  footer, page numbers. Text extracted and asserted, not just byte-counted.
- Weekly import: loose header aliases, fuzzy matching, auto zone inference,
  needs-a-choice and blocked rows, row exclusion, apply, and re-upload
  correctly reporting already-applied rows. CSV and xlsx both. Also found and
  fixed the 1 MB Server Action body cap (see below) — a 2 MB spreadsheet used
  to fail with a 500 and *nothing shown on screen*.

One thing worth knowing before the first real import: the review table renders
every row of the file. A 2 MB / ~20,000-row spreadsheet plans correctly but the
page becomes very heavy (a full-page screenshot of it times out). The real
weekly file is expected to be a few hundred rows of changes, not the whole
list, so this is not urgent — but if the office ever uploads a full master list,
the table needs virtualising or paging.
- Access boundary: the Voice-only user sees only Voice everywhere, cannot reach
  `/users`, and is refused by RLS on every forged write attempted with their own
  access token — except the two cases now recorded in `docs/domain-notes.md`.

- Manage Users, once Ari supplied the branch's service_role key: the page
  renders, invite creates a confirmed account with the right publication scope,
  edit changes email and name, delete removes the account, and the scoped user
  is still redirected away from `/users`. The self-delete guard was tested
  adversarially — rewriting the delete form's hidden `userId` to the signed-in
  user's own id is refused by the server, not just hidden in the UI.
- The **password-reset flow end to end**, which had also never run: generated a
  link from Manage Users, opened it in a clean browser, set a password at
  `/reset-password`, then signed in as that new staffer and confirmed they saw
  only their own publication's addresses. `/auth/confirm` works, and the link
  points at our own domain rather than Supabase's `/verify`.

Note for whoever tests this next: `SUPABASE_SERVICE_ROLE_KEY` is required for
`/users` to render at all, and the Supabase MCP cannot supply it (it only
exposes publishable keys). Get it from the *branch's* dashboard — the branch is
not in the projects list, since it is a preview branch of `lakewood-courier`;
go to `https://supabase.com/dashboard/project/txfulvngxgjwdoicurdv` directly, or
use the branch dropdown. Never point a dev server at production to test this.

Do not browser-test against production; the branch exists for this.

## The immediate next task

**Deploy to `lakewooddeliveries.com`.** Ari's decision, taken 2026-08-20 ahead of
fixing the removal issue below. The full runbook — current state, exact env var
values, the Cloudflare gotcha, and the four post-deploy checks — is the
deployment section of `SETUP.md`. Read that before touching anything; a Vercel
project called `courier` already exists and already holds the service-role key,
so this is link-and-configure, not create-from-scratch.

Two things that will waste your time if you miss them:

- **Vercel deploys `main`.** Confirm what `main` contains. As of this writing the
  browser-testing work is in PR #1 and not yet merged, so deploying would ship
  the old code — including the 1 MB import bug.
- **`vercel.com`, `api.cloudflare.com` and `lakewooddeliveries.com` are blocked**
  by the default cloud network policy (403 on CONNECT); only `api.vercel.com`
  gets through. `vercel login` therefore cannot work. See the runbook for which
  hosts to allow and which env vars to set, and note both only apply to a
  container started after the change.

After that, the two questions at the bottom of `docs/domain-notes.md`
(whole-address removal) need Ari's answer before the cover sheet can be trusted
for a real week. Nothing else is known-broken.

Deployment to `lakewooddeliveries.com` (Ari's domain, on Cloudflare) is decided
and documented in `SETUP.md` — the app goes there, the database stays on its
Supabase hostname. The steps need a Cloudflare and a hosting account, so they
cannot be done from a sandboxed session.

## Supabase projects

| Purpose | Project ref | Contains |
| --- | --- | --- |
| Production | `qysltpkdmuozsphftzps` | The real subscriber list. Read freely; do not write casually. |
| Test branch `browser-testing` | `txfulvngxgjwdoicurdv` | Same schema, synthetic fixture only. Write freely. |

The branch costs about $9.70/month while it exists. Ask Ari before deleting it,
and remind him it is still running if the testing work is finished. Note it is a
**non-persistent preview branch**: Supabase auto-pauses it after inactivity and
deletes it when its PR closes, so it may disappear on its own. If it is wanted
as a standing staging environment, mark it persistent.

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
everything) and `voice@example.test` (Voice-only, publication-scoped). Both
passwords were reset to `BrowserTest!2026` on 2026-08-20. If they are lost,
reset them:

```sql
update auth.users set encrypted_password = crypt('<new password>', gen_salt('bf'))
where email = 'office@example.test';
```

## What is in the test branch's fixture

Synthetic only, but shaped like the real thing. As of 2026-08-20: zone 1 has a
direction row and ~10 stops, zone 2 has 4, zone 3 has 1, and **zone 4 has 220
stops** — added deliberately so the booklet spills across several PDF pages,
which is the only way to test paging and footer behaviour. `999 HIDDEN LANE` in
zone 1 is Shopper-only and exists to prove the Voice user cannot see it. Keep
these if you can; rebuilding them is tedious.

## Gotchas that have already cost time

- **A hand-inserted `auth.users` row breaks login with a 500.** The fixture's
  two users were inserted with `confirmation_token`, `recovery_token`,
  `email_change_token_new` and `email_change` left NULL. GoTrue scans those
  columns into non-nullable Go strings, so the password grant fails with
  `{"code":500,"msg":"Database error querying schema"}` — for the *real* user
  only; a nonexistent email still returns a clean 400, which makes it look like
  a password problem rather than a data problem. Fix is to set them to `''`
  (and add an `auth.identities` row). This cost the first part of a session;
  if you rebuild the fixture, insert users through the Admin API instead.

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
- **Server Actions cap the request body at 1 MB by default**, and the rejection
  happens in the framework *before* the action runs — so it cannot be caught and
  turned into a message. The import page advertises 5 MB, so a 2 MB spreadsheet
  produced a 500 and a button that appeared to do nothing.
  `next.config.ts` now sets `experimental.serverActions.bodySizeLimit` to `6mb`,
  above the app's own 5 MB check, and the import form also checks the size in
  the browser so oversized files get a real message. Keep the config value above
  the app's limit if either is ever changed.
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
