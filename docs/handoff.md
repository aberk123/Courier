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

- Home-screen address search across every route, with add-from-home
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

## Deployed — 2026-08-20

**The app is live at `https://lakewooddeliveries.com`.** PR #1 was merged, so
`main` (and therefore production) has the browser-testing work and the 1 MB
import fix. Full detail, including the exact DNS records and Vercel ids, is the
deployment section of `SETUP.md`.

The short version of what was done: the Vercel repo link already existed, so
this was mostly configuration — re-scoping env vars, attaching the apex and
`www`, and creating three grey-cloud records in an empty Cloudflare zone.

Two things worth knowing:

- **All three Supabase env vars had been scoped to `preview` *and*
  `production`** — including `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS.
  Every preview build of every branch was a live editor for the real subscriber
  list. Fixed: production vars are Production-only, and Preview now points at the
  `browser-testing` branch project. Preview deliberately has no service-role key,
  so `/users` will not render on a preview deployment.
- **The post-deploy checks in `SETUP.md` were not run by the deploying session.**
  Every one of them needs a signed-in session and that session had no production
  password. Since then, real use has settled the reset-link one (see the incident
  below); the booklet-PDF and large-import checks are still outstanding. What *was* verified from outside: valid TLS, `/login` renders, and
  the unauthenticated redirect boundary holds on the real domain.

## PR #2 merged and deployed — 2026-08-20

Merged as `ab6ddac`; production deployed from it and was verified from outside:

- A scanner-style GET of `/auth/confirm?token_hash=…` now returns 200 with the
  "Set your password" form instead of redirecting to the expired page. The token
  is only spent on the explicit POST, so preview fetches are harmless.
- The expired page names the likely cause.
- The Remove button works again — the code matching the new trigger is live.

Also done in that pass:

- **The three stray sessions were revoked** (two on Amrom, one on Donath),
  created by whatever spent their links. Ari's own session was left alone, the
  refresh tokens cascaded, and Amrom's *pending* link was checked to still be
  intact first — revoking sessions does not touch `auth.one_time_tokens`.
- **The booklet PDF was measured rather than guessed.** See `SETUP.md`: a
  synthetic 735-entry route renders in 3.6–3.9s / 14 pages on a production
  build, so the feared timeout is not close. `maxDuration = 60` is set on the
  route regardless, for cold-start headroom.

## The immediate next task

**One post-deploy check is left** (see `SETUP.md` for all four): **import a
spreadsheet over 1 MB — upload and review only, do not click apply.** That
exercises the Server Action body-size cap without writing a row to the real
list. It needs a signed-in production session, which is the only reason it is
still open.

The other three are settled: signing in is proven by three real accounts, the
reset-link host by a link that a recipient actually used, and the booklet PDF by
measurement (3.6–3.9s for a 735-entry route). One standing caveat from the
reset-link one: generated links carry whatever host the office had open, so keep
staff on `lakewooddeliveries.com` rather than the `*.vercel.app` alias.

## Whole-address removal — answered and built 2026-08-20

The two open questions about whole-address removal have been answered by Ari and
implemented; the decisions are recorded in `docs/domain-notes.md`. Removal is now
per-publication: a scoped staffer takes off only their own publications, the
courier office takes off all of them and each gets its own Deletion row, and
churn that cancels inside one cover-sheet cycle prints nothing.

**The migration is applied; the code is not merged yet.**
`supabase/migrations/20260820160000_whole_address_removal.sql` was applied to
**both** the production project and the `browser-testing` branch on 2026-08-20,
deliberately ahead of the code, because it is additive — deploying the code
first would make every removal fail with "function does not exist". It is also
replayed into a throwaway Postgres by `supabase/tests/rls.sh` (28 passing, 8 of
them new).

**Consequence while PR #2 is open:** production still runs `main` @ `7622734`,
whose Remove button does the bare `update stops set active = false` that the new
trigger now refuses. So removing an address in production currently fails with a
visible error instead of silently ending another publication's delivery. That is
fail-closed and better than the bug it replaces, but it is live breakage —
merging PR #2 is what fixes it. Nothing else on `main` writes `stops.active`,
so nothing else is affected.

The migration also backfills addresses left in the split-brain state by the old
code path — inactive, but still carrying `stop_publications` rows and no
`removed` event — by writing the missing events, backdated to the stop's
`updated_at`. Checked against both databases before writing it:

- **Production: a no-op.** All 196 inactive addresses there already carry zero
  publication links, so the invariant already holds and the backfill writes
  nothing. Production's event log is empty entirely (0 rows) — the ~8,000
  publication links were loaded straight into `stop_publications` as
  service_role — so there are no catch-up Deletions and the next cover sheet is
  unaffected.
- **Test branch: writes 2 events for 1 address**, the one retired through the
  old Remove button during browser testing. That is the case this backfill
  exists for, and a good place to see it work.

## Home-screen address search — built 2026-08-20

Ari: CSRs often don't know which route a customer is on until they search the
address, so the home screen now leads with a search across all five routes
instead of a list of routes to guess between. Requirement and behaviour are
recorded in `docs/domain-notes.md`; results badge their route and deep-link
into it via `/zones/N?stop=<id>`, and an address can be added from home with the
route pre-selected from the street.

Driven in real Chromium against the test branch as both fixture users — 25
checks over two scripts, all passing, with the writes verified in the database
and the two test addresses deleted afterwards (fixture back to 236 stops, zone 1
back to 11). Worth knowing:

- The zone suggestion is computed from a **street-only** query, deliberately not
  from the search results. Deriving it from the results was the first attempt and
  was wrong in the one case that matters: a new house number on a known street
  matches nothing, so there were no results to derive it from and the route
  select came up blank. Browser testing is what caught it.
- `/zones/N?stop=<id>` only opens the address if it is among the first
  `ROW_CAP` (1000) route entries. The largest real route is 735 entries, so this
  does not bite today; if a route ever passes 1000 the page now says the address
  is on the route but not shown, rather than silently opening nothing. Real fix
  is still pagination.
- Search is a plain GET form, so a result survives a reload and the back button
  — a CSR is usually on the phone while using it.

Nothing else is known-broken.

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

## Incident: "Invalid login credentials" after a password reset (2026-08-20)

Amrom could not sign in. The login itself was working correctly; the problem was
one step earlier, and the shape of it will recur, so it is worth knowing.

**Two separate bugs, and the second one hid the first.**

*A first pass at this blamed the sender for opening the links to test them. That
was wrong, and worth recording as a warning about plausible-but-unverified
diagnoses. Both recipients — Amrom and Donath — hit "expired" on their **first**
tap, before anyone else had touched their link. Two independent people failing
the same way is a system bug, not user error.*

**Cause 1: `/auth/confirm` spent the one-time token on a plain GET.** These links
are single-use, and a link sent by text or email is fetched by things that are not
the recipient — iMessage/WhatsApp building a preview card, Outlook Safe Links and
other mail scanners, antivirus, corporate proxies. Whichever touched the URL first
consumed the token; the actual person then got "expired". The Manage Users copy
even suggested sending it by "text, email", which is exactly what triggers a
preview fetch.

Confirmed empirically rather than reasoned: a single unauthenticated POST to
GoTrue's `/verify` with a token — precisely what the old GET handler did on *any*
fetch — returns `200` and removes the row from `auth.one_time_tokens`. One
automated fetch was enough.

Fixed: `/auth/confirm` is now a page, not a Route Handler. The GET only renders a
"Set your password" form; the token is spent by a Server Action on explicit POST.
A preview fetch renders the page and changes nothing. Verified in Chromium
against the test branch — two scanner GETs followed by a successful human
Continue, and correct refusal on reuse.

**Cause 2: the replacement password never saved.** Leaked-password protection
refused it, and the refusal reads like advice, so it looked like it had worked.

One further consequence worth knowing: because a recovery link authenticates *as
its recipient*, pressing Continue signs the opener in as that person. Production
accumulated two live sessions on Amrom's account, at 17:24:01 and 18:31:45 — the
two times a link was successfully spent — while Amrom never got in. Those
sessions belong to whatever consumed the links. Revoking them is harmless
housekeeping.

What the auth logs showed, in order:

1. `17:23:10` a link was generated for Amrom; `17:24:01` something spent it
   successfully. `17:22:10`–`17:22:21` shows the same shape for Donath: a
   success, then a second `/verify` **one second later** that failed — the
   signature of an automated fetch beating the human to it.
2. `18:08`–`18:28` Amrom's own taps: "One-time token not found", every time.
3. `18:31:37` a fresh link was generated; `18:31:45` it was spent — the one time
   somebody got through. This is also the last time `auth.users.updated_at`
   changed for him.
4. `18:34`–`18:35` further taps: "One-time token not found". Single-use, already
   spent.
5. `18:40:06` a new password was submitted and Supabase **refused it**: "Password
   is known to be weak and easy to guess, please choose a different one."
5. `18:44` he tried to sign in with that password: `400 Invalid login
   credentials` — correctly, because it was never saved.

`updated_at` still being `18:31:45` is what proves step 4 saved nothing.

The diagnosis is worth repeating because the symptom points at the wrong screen.
"Invalid login credentials" on `/login` meant the *reset* had failed, not the
login. Note also the distinction already recorded under Gotchas: a wrong password
or unknown email gives a clean `400 Invalid login credentials`, whereas a
hand-inserted `auth.users` row with NULL token columns gives a `500 Database
error querying schema`. Amrom's was the 400, which is what ruled out the schema
bug immediately.

Fixed on the app side, in three places:

- Manage Users now says, on both the reset link and the invite link, **don't open
  it yourself** — that it works only once, that opening it is what makes the
  recipient see "expired", that it signs the opener in as that person, and that
  each new link cancels the last.
- `/reset-password`'s expired page now names the likely cause (already opened,
  often by the sender, or superseded by a newer link) instead of just saying the
  link is invalid.
- The weak-password refusal now leads with "That password was not saved" and
  suggests three or four unrelated words. Other errors pass through unchanged.

Operationally, a staffer in this state needs a **fresh** link, opened by *them*,
and a password not in the breach list. Better still, let them choose it — a
password relayed by the office is one the office also knows.

Worth doing once: the two stray sessions on Amrom's account should be revoked, so
nobody is left holding his account in a browser tab.

## Open with Ari

- Leaked-password protection is now **enabled** on production (it was disabled
  when this file was first written). Confirmed from the auth logs, not the
  dashboard: a password update on 2026-08-20 was refused with "Password is known
  to be weak and easy to guess". Keep it on — but see the incident below, because
  it has already confused one real user.
- The real weekly spreadsheet from The Voice has never been seen. The importer
  matches header names loosely and will probably need new aliases on first
  contact; if the address arrives as one cell rather than separate house-number
  and street columns, that needs a small parser change.
- Two working assumptions are noted at the bottom of `docs/domain-notes.md`
  under "Items to confirm with Amrom". Neither blocks anything.
