# Handoff — read this first

Rewritten 2026-08-21 for a fresh session. `docs/domain-notes.md` is the
requirements record and the authority on *what* to build; this file is the
current *state* of the work and the shortest path into it.

**The one habit that matters here:** every serious defect on this project was
caught by a person looking at real output, not by a test — a courier reading a
booklet, a worker spot-checking deletions, Ari noticing directions that made no
sense. Render the actual artifact, look at it, and use the subagents below
before anything reaches a driver.

## What this is

A subscription-list and courier-route dashboard for **The Voice of Lakewood**
(Ari Berkowitz), working with **The Lakewood Courier** (Amrom Jacobovics,
732-666-1311). It replaces a manual paper process: the office marks up route
booklets by hand each week and the courier re-keys them.

Requirements came from a 2026-08-13 call plus Amrom's emailed route
spreadsheets. Every decision Ari has confirmed is recorded in
`docs/domain-notes.md` — read it before changing behaviour, and add to it when
he decides something new.

## Start here

1. Read `docs/domain-notes.md` — the requirements record, and the authority on
   what to build. Its later sections carry rules that were learned by getting
   them wrong on real data; do not re-derive them.
2. Skim "Gotchas that have already cost time" below before writing code.
3. Check "What is open" for the current front.

## What is live

The app runs at **`https://lakewooddeliveries.com`** and production deploys from
`main` automatically. `SETUP.md` has the deployment runbook, DNS records and
Vercel ids.

Shipped and working:

- Home-screen address search across all five routes, with add-from-home
- Zone/route workspace in route order, scoped per publication
- Five real routes from Amrom's spreadsheets (~8,000 publication links)
- Cover sheet (Additions / Deletions / Changes / Complaints) per route
- Booklet PDF per route, filtered to selected publications, dated filename
- Weekly import: upload, fuzzy match, review, apply
- Manage Users: invite, edit, delete, publication scoping, reset links
- Breadcrumb navigation
- RLS throughout, with a regression suite (`supabase/tests/rls.sh`, 34 passing)

Deliberately deferred by Ari — do not build without being asked: master-list
reconciliation across all routes beyond the five-route MVP, the courier check-off
app and SMS check-off, and courier-to-route assignment.

## The courier booklet: current state

This is where the recent work has been, and where the recent mistakes were.

Confirmed by Ari and built:

- **Publication letters, not names.** The drivers' own single letters — `V`, `B`,
  `S`, `M` — at 13.5pt bold. Ten are confirmed from the sample zone files; five
  (`D` Dee Voch, `W` Wellsprings, `K` Kindline, `T` Shtenderel, `U` Hundred) are
  collision-free guesses **still needing Amrom's confirmation**. Note Bina is
  `N`, not `B` — BP owns `B`.
- **No recipient names anywhere in the booklet.** Floor/side distinguishes two
  households at one house number. Names stay on the in-app screens.
- **Spaced rows and zebra shading**, `#ededed` on stops and `#d8d8d8` on
  directions. Costs pages; Ari accepted that explicitly.
- Every floor label already in the data prints; none is ever invented; two
  identical addresses print twice.

Unmerged on the branch, and the one judgement call waiting: `collapseSkippedStretches`
in `src/lib/booklet.ts`. A publication-scoped booklet inherits the whole route's
directions, so filtering to one publication leaves long runs with nothing under
them — 21 of zone 1's 32 directions, 46 of zone 2's 65, with unbroken runs of 17
and 14. **The shipped code deleted those runs, which silently removed real
turns.** The replacement collapses them into one quiet line and keeps every word.
It changes output for every publication, so Ari has not yet said to merge it.

### Verified 2026-08-24 against the real zone 1 route — one defect found

Verification method, because it is reusable: zone 1 of the **production** route
was dumped verbatim (457 entries — 32 directions, 425 stops, matching
production's own counts) and fed through the *real* `getBooklet` and the *real*
`BookletDocument` with a stub PostgREST client, then rasterised and read page by
page. The dump and harness are throwaway; the shape was
`D|seq|text` / `S|seq|house|street|floor|instr|instr2|active|courier_letters`.

**The central claim holds.** Directions lost, out of zone 1's 31 (excluding the
trailing `DONE`), measured over all 16 publication filters:

| Filter | Stops | `main` loses | This change loses |
| --- | --- | --- | --- |
| All publications | 380 | 7 | **0** |
| The Voice | 203 | 17 | **0** |
| Mishpacha | 30 | 20 | **0** |
| Lakewood Courier | 236 | 7 | **0** |

Every direction the change still drops is strictly *after the last delivery* for
that publication — checked programmatically, not by eye. In production the only
such rows are `DONE`, `DONE!` and `END OF ROUTE`.

**The defect: the collapse groups on adjacency in the already-filtered list**, so
it cannot tell "these directions had their stops filtered out" from "these
directions simply sit next to each other in the route". Consecutive direction
rows are normal in the source — a door code follows the drive to the building,
`WALKING ROUTE` follows the park instruction. So the collapse fires on booklets
where **nothing was skipped at all**, including the all-publications booklet that
is printed today.

Zone 1 sequences 158–160 are three consecutive direction rows with live
deliveries right after them, so the all-publications booklet prints:

> *Nothing for this booklet along here — BACK TO CAR, DRIVE TO 419 CEDAR BRIDGE
> (RIGHT BLDG)  >  DOOR CODE: 1,3 THEN 5 TAKE THE ELEVATOR…*

at 8pt grey italic, directly above 24 deliveries in that building. The identical
door code for 417 prints full-weight bold, because its run is only two long and
`SKIP_RUN_MIN` is 3. Nothing is deleted — the never-delete rule holds — but the
code the driver needs to get in the door becomes the quietest thing on the page,
under a label that is false.

All four other runs of ≥3 consecutive directions in the real routes are followed
by an active stop, so all four mislabel the same way on an all-publications
booklet:

| Route | Sequences | What gets muted | Next stop |
| --- | --- | --- | --- |
| 1 | 158–160 | the 419 Cedar Bridge door code | 419 Cedar Bridge apt 415 (`L`) |
| 2 | 357–359 | `CROSS THE STREET TO YOUR BAG AT 1 FOREST PARK CIR` | 12 Forest Park Cir (`BLSV`) |
| 2 | 617–619 | the two corrupted `545 HOWARD DR` rows | 126 Neal Ct (`BCLSV`) |
| 3 | 410–412 | `TURN BACK TO SPRUCE, TURN RIGHT` + the Washington/Pine/Raven chain | 1 Raven Ln (`BLSV`) |
| 4 | 234–237 | `PARK ON CORNER OF JENNA CT & HEARTSTONE`, `WALKING ROUTE` | 148 Clairmont Ct (`BLSV`) |

**The fix, verified but not yet applied:** decide deadness from the *unfiltered*
route. A run of consecutive direction rows is one navigation unit, and it is dead
only when every stop it leads to was filtered out or retired. On zone 1 the whole
diff against this change is a single hunk — 419's drive and door code return to
full weight — and the Voice, Mishpacha and Voice+Shopper booklets come out
byte-identical. Over all 16 filters: nothing mislabelled, no words lost, same page
count. The "keep the last direction of a run loud" rule becomes unnecessary once
deadness is computed properly, because a dead run is always followed either by a
live direction (already loud) or by the end of the route (already dropped).

One thing the render also shows, for Ari to judge rather than for the code: a
genuinely dead run of 16 directions — the Cedar Bridge stretch on the Mishpacha
booklet — becomes one dense 8pt paragraph joined by `>`. Every word is there and
the next real turn is loud, but the useful navigation out of the complex sits
among in-building instructions the driver does not need.

## What is open

- **The >1 MB import post-deploy check.** Upload and review only, do not apply.
  Needs a signed-in production session. Last item from `SETUP.md`.
- **Donath (`rdonath@circmag.com`) has never set a password.** Her `updated_at`
  is 2ms after her `last_sign_in_at` — the same transaction. She needs a fresh
  reset link, generated from Manage Users and opened by her.
- **Five unconfirmed courier letters** (above), before the first real print run.
- **Whose list wins.** When our list says an address takes a publication and the
  publication's file does not, nobody has decided who is right. Do not build the
  apply step for master-list import until Ari answers. Measured against
  Mishpacha issue 1125: 160 of 167 matched, 11 added, 4 removed, 3 unresolved.
- **A near-miss list has nowhere to go.** Unresolved addresses are correctly
  withheld from the courier, but nothing tells the office they exist, so they
  would be withheld silently forever. Needs a fourth cover section or an
  office-only sheet.
- **Two corrupted rows in zone 2's production route.** `I STEIN BOYS V S 545
  HOWARD DR` and `I V 545 HOWARD DR` are stored as `direction` rows but are
  clearly address rows. They print as loud driving instructions, and because
  545 Howard Dr is not a stop record it is invisible to every publication filter.

## Subagents — use them, especially on anything that reaches a courier

`.claude/agents/` holds five. They load at session start, so a newly added one is
not callable until the next session. Two of the five exist because a human caught
something this project's own testing did not, so treat them as load-bearing
rather than optional.

| Agent | Reach for it when |
| --- | --- |
| **lakewood-courier-advisor** | Architecture, data model, scope. Before deciding, not after. |
| **lakewood-courier-reviewer** | A plan or diff exists and needs checking against the requirements record. |
| **lakewood-courier-ux** | Screens, forms, export layout, wording staff will read. |
| **lakewood-courier-routing** | Route order, driving directions, where a new address goes, which zone owns a street. |
| **lakewood-courier-reconciliation** | Parsing a publication's weekly file, matching addresses, deciding additions and deletions. |

### The mapping / routing agent

`lakewood-courier-routing` is the one to call for anything physical about the
round. Added after a courier looked at a booklet and said the directions did not
make sense — and he was right.

**Call it when** a change touches route sequencing or `route_entries`; when a new
address needs a position; when deciding which zone a street belongs to; when
street names are being matched; and — always — **before any booklet goes to a
real driver.**

**What it knows, which is not obvious from the code:**

- A stretch with no deliveries still carries the turns *between* the places that
  do have them. Zone 2's dead run holds `TURN LEFT ON MARC DR`, `TURN RIGHT ONTO
  SPRUCE`, `TURN RIGHT ON HOWARD DR`. Directions may be collapsed or quietened;
  they may never be dropped.
- Interpolating a new address by house number is only safe when the street is one
  contiguous block of the route and the number is inside the covered range. Oak
  St is reached at five separate points in zone 3, Pine St at four in zone 2.
  Otherwise it asks — and an unplaced address stays off the route pages entirely.
- The sequence is a walking pattern, not geometry. `761 → 658 → 707 CYPRESS AVE`
  is correct. Never "fix" an order that looks unsorted, and never reach for a map
  to place a stop: the existing sequence encodes knowledge no map has.
- Auditing method: align directions **sequentially**, never by count —
  `CROSS OVER TO ODD SIDE` appears four times in one zone and a count would hide
  a drop. Watch substring traps: `2 BRIDGEWOOD AVE` sits inside
  `12 BRIDGEWOOD AVE`, and direction text can begin with a house number.

**Give it**: the PDFs, the route's direction rows and stops with their sequence
numbers, and what you believe you changed. **Ask it to certify** that no turn was
lost and that a driver can still get from each delivery to the next. It is told
to say "a human must confirm" rather than guess, so a hedged answer is the
correct answer, not a failure.

### The reconciliation agent

`lakewood-courier-reconciliation` owns the weekly file. Call it before any diff
that could add or remove a subscriber.

Its governing rule is the asymmetry: a wrong addition wastes a paper, a wrong
deletion stops a paying subscriber and nobody finds out, because they complain to
the publication rather than the courier. Five real households were nearly cut in
two separate passes — `6 SHENANDOAH`, `22 EAGLE LA`, `781 CYPRESS ST`,
`2 BRIDGE WOOD`, `22 NEWWOOD HILL AVE` — each an exact-match rule meeting a file
that spells streets loosely. Both times a human caught it, not a test.

Useful control it will apply: diff two consecutive issues of the same
publication. Real weekly churn on these routes is a handful of addresses, so a
large file-to-database diff next to a tiny file-to-file diff means divergence or
a matching fault — never "this week's changes".

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
