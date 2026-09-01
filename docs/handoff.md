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
- Weekly import reads a publication's own roster: `.xlsm`, a whole address in
  one cell, two floor/side columns, no action or publication column
- Roster removals: an address the new list no longer carries becomes a Deletion,
  guarded by `removalsLookWrong` so an implausibly large run stops instead of
  applying
- `npm test` — 18 import-matcher tests, on Node's built-in runner, no new
  dependency. Every case is a shape the real Voice roster contained and the code
  got wrong before

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

- **Dead stretches are collapsed, never deleted** (`collapseSkippedStretches` in
  `src/lib/booklet.ts`). A publication-scoped booklet inherits the whole route's
  directions, so filtering to one publication leaves long runs with nothing under
  them — 21 of zone 1's 32 directions, 46 of zone 2's 65, with unbroken runs of 17
  and 14. **The code before this deleted those runs, which silently removed real
  turns.** Now every word is kept and a dead run is merged into one quiet line.
  Approved by Ari 2026-08-24 with the deadness correction below applied first.

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
| All publications | 380 | 8 | **0** |
| BP | 225 | 10 | **0** |
| The Voice | 203 | 17 | **0** |
| Shopper | 286 | 9 | **0** |
| Mishpacha | 30 | 20 | **0** |
| Lakewood Courier | 236 | 10 | **0** |

Count these as a **multiset, not as distinct texts.** A first pass here counted
distinct texts and understated `main`'s loss in half the rows, because
`CONTINUE TO STAIRS, GO DOWN TO THIRD FLOOR` appears four times in zone 1 and
`main` dropping one copy is invisible if another survives. This is the duplicate-text
trap `.claude/agents/lakewood-courier-routing.md` warns about, and it caught the
person writing that agent's brief.

Every direction the change still drops is strictly *after the last delivery* for
that publication — checked programmatically, not by eye. For zone 1 the only such
row is `DONE`. Whether that holds for zones 2–5 has **not** been verified against
their route data; a query showed their trailing rows are `DONE!` and
`END OF ROUTE`, but the per-publication tails were not checked.

**The defect: the collapse groups on adjacency in the already-filtered list**, so
it cannot tell "these directions had their stops filtered out" from "these
directions simply sit next to each other in the route". Consecutive direction
rows are normal in the source — a door code follows the drive to the building,
`WALKING ROUTE` follows the park instruction. So the collapse fires on booklets
where **nothing was skipped at all**, including an all-publications booklet.
(Note: Ari confirmed 2026-08-28 that an all-publications booklet is *not* what
gets printed — the drivers do about three runs a week, each with a different mix.
The defect was still real on any booklet where a run of directions was not
actually skipped.)

Zone 1 sequences 158–160 are three consecutive direction rows with live
deliveries right after them, so the all-publications booklet prints:

> *Nothing for this booklet along here — BACK TO CAR, DRIVE TO 419 CEDAR BRIDGE
> (RIGHT BLDG)  >  DOOR CODE: 1,3 THEN 5 TAKE THE ELEVATOR…*

at 8pt grey italic, directly above **23** deliveries in that building (seq 161–189;
162 and 163 are retired). The identical
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

**The fix, applied 2026-08-24 before merging (Ari's call):** decide deadness from the *unfiltered*
route. A run of consecutive direction rows is one navigation unit, and it is dead
only when every stop it leads to was filtered out or retired. On zone 1 the whole
diff against this change is a single hunk — 419's drive and door code return to
full weight — and the Voice, Mishpacha and Voice+Shopper booklets come out
byte-identical. Over all 16 filters: nothing mislabelled, no words lost, same page
count. The "keep the last direction of a run loud" rule becomes unnecessary once
deadness is computed properly, because a dead run is always followed either by a
live direction (already loud) or by the end of the route (already dropped) — so it
was removed.

`markDeadDirections` is the function that does it, and it is deliberately separate
from `collapseSkippedStretches`: the first decides *what* is dead from the whole
route, the second only decides *how loud* it prints. `survives` is named and shared
so the liveness test and the stop filter cannot drift apart — if they ever did, a
live stretch would be muted again.

Re-verified against the real zone 1 route with the fix in `src/`, over all 16
publication filters: **0 mislabelled directions, 0 directions missing from before
the last delivery**, page counts unchanged (all-publications 12, Voice 7,
Mishpacha 3). The code's own dead set was cross-checked against an independently
recomputed one — 0 mismatches on every filter. `supabase/tests/rls.sh` 34/34,
`npm run build` and `eslint` clean.

### Two things the fix above does NOT solve

Found by auditing the rendered booklets, and they are Ari's calls, not the code's.

**Muted text is sometimes load-bearing, even when the run is genuinely dead.** On
a sparse-publication booklet the whole opening of the route is legitimately dead,
so `START AT DUNE CT` lands inside the grey block. Verified on zone 1:

| Booklet | Stops | First full-weight direction |
| --- | --- | --- |
| Bina only | 5 | `RIGHT ON CEDARBRIDGE, LEFT ON NEW HAMPSHIRE…` |
| Hamodia only | 3 | `BACK TO CEDARBRIDGE, TURN RIGHT…` |
| BP only | 225 | `START AT DUNE CT` ✅ |

Both of those loud lines are *relative* — "back to" and "right on" presuppose a
position the muted text established. A driver who trusts the label has no start
point. Also affected: `BACK TO CAR, TURN RIGHT ON CEDARBRIDGE AVE (OUT OF
COMPLEX)` is muted on every booklet that collapses, including all-publications.

The same shape produces something sharper in zone 2. Sequences 357–359 are
`CROSS THE STREET TO YOUR BAG AT 1 FOREST PARK CIR` / `CONTINUE ODD NUMBERS` /
`CROSS THE STREET AND DELIVER EVEN NUMBERS`, and 356 and 360 are both active
stops — so on an all-publications booklet the first two are muted and only
*deliver even numbers* stays loud. Where the driver's bag of papers is becomes the
quietest line on the page. (Correcting deadness per the fix above removes this
one, since the run is not dead. It remains for any publication that genuinely
skips that stretch.)

**A dead run renders as a paragraph, not a list.** The Cedar Bridge stretch on the
Mishpacha booklet is 16 instructions joined by `>` into one 8pt italic paragraph
that wraps over 9 lines, breaking mid-phrase (`…WASHINGTON / SQUARE`). Bina's is
23 instructions. At 8pt the `>` carries no more weight than the commas inside an
instruction, so the block has no readable unit boundaries. Fine as an archival
"here is what you are skipping"; not something to navigate from — which the
paragraph above shows a driver sometimes must.

Suggested shape if the collapse is kept: render a muted run as **one small line
per direction** rather than a joined paragraph, and keep door codes, `PARK…` and
`WALKING ROUTE` at full weight regardless of deadness.

**Also worth a line of UI:** a booklet for a publication with no stops in the zone
renders as a bare `Zone 1 — route / In delivery order.` header and nothing else —
four of fifteen publications in zone 1 (Dee Voch, Hundred, Kindline, Shtenderel).
Not a regression, `main` does the same, but it reads as a print failure. It should
say so explicitly.

### What this verification does NOT cover

- **Only zone 1's route data was used.** Findings about zones 2–5 are inference
  from their direction texts and run lengths, plus spot queries confirming an
  active stop follows each run. Their stop data was never dumped.
- **The cover sheet is completely unexercised.** The harness passes empty event
  tables, so Additions / Deletions / Changes / Complaints and `netPendingEvent`
  got zero coverage.
- **RLS is bypassed.** This is the courier-office view. For a publication-scoped
  staffer PostgREST returns fewer `stop_publications` rows before the filter runs,
  which can change which runs are dead — exactly what `CLAUDE.md` says a stub
  cannot prove.
- The stub ignores `.order("sequence")`, so it cannot catch an ordering bug.
  (`zone1.route` was checked to be contiguous 1..457, ascending, no duplicates.)
- `lakewood-courier-routing` was **not** the agent that audited this. Its file
  only entered the tree that day and agents load at session start, so a
  general-purpose agent ran with its instructions loaded verbatim. It is
  registered now; re-running it against a rendered booklet is cheap and worth
  doing before the first real print run.

### Verified 2026-08-25 against the real zone 2 route — the letters column overflows

Zone 2 (735 entries: 65 directions, 670 stops) was dumped and rendered the same
way. This time the dump's provenance is **proven, not asserted**: the `md5` of the
local file equals the `md5` of the same string built inside the production
database (`e79a82dea4ca69bc043e6be44eecea92`; zone 1 is
`4f5ae43fa3cb6c123528e324d2f99d16`, checked retroactively, which closes the gap
the zone 1 review left open). Note `string_agg` produces no trailing newline, so
compare with the file's final newline stripped.

`lakewood-courier-routing` — the real agent this time — audited it.

**The collapse behaves correctly on zone 2.** Over all 16 publication filters: 0
mislabelled directions, 0 directions missing from before the last delivery. The
agent independently rebuilt each filter's expected direction list from the dump
and compared it as an **ordered exact list** — stronger than a multiset check, so
`CROSS OVER TO ODD SIDE` (×4) and `CROSS BACK TO EVEN SIDE` (×4) cannot hide a
drop: `ordered_exact=YES` on all 18 filters it tested. Every stop present and
intact, verified from the PDFs positionally rather than by pattern matching:
676/676, 408/408, 79/79, 254/254 rows, 0 problems. All-publications booklet is 20
pages, matching the measured table in `docs/domain-notes.md`.

**The deadness fix matters more here than on zone 1.** It restored 4–8 directions
to full weight on *every* filter, and the all-publications booklet now has zero
collapsed blocks — correct, since nothing is filtered out. Most important:
`CROSS THE STREET TO YOUR BAG AT 1 FOREST PARK CIR` (seq 357) had been muted on
ALL, Voice, Shopper, BP, Lakewood Courier and Circle. That line is where the
driver's papers are staged, and the old behaviour left only *deliver even numbers*
loud. It is still muted on 8 of 18 filters where that stretch is genuinely dead.

#### The new defect: the publication-letters cell is too narrow, and a letter lands on a line with no address

`stopPubs` in `src/lib/booklet-pdf.tsx` is `width: "20%"` — on a LETTER page with
`paddingHorizontal: 34` that is 20% of 544pt = **108.8pt** — at 13.5pt bold with
`letterSpacing: 1`. Eight letters is already at the limit.

Measured by rendering all 15 active stops on the five real routes that carry 8+
publications: **10 of them wrap.** Zone 1's maximum is 7 letters, which is exactly
why the zone 1 review could not have found this.

| Zone | Stop | Letters | |
| --- | --- | --- | --- |
| 2 | 106 SPRUCE ST (upstairs) | `ABCLMNSVWY` | wraps |
| 2 | 41 NEWBERRY CT (upstairs) | `BCLMNSVY` | wraps |
| 2 | 142 SPRUCE ST | `BCHLNSVY` | fits, at 106.2 of 108.8 |
| 3 | 24 HIGH ST | `ABCHLMSVY` | wraps |
| 3 | 41 CANARY DR | `ABCLMNSV` | wraps |
| 3 | 46 CANARY DR | `BCHLMNSV` | wraps |
| 3 | 272 READ ST | `BCHLNSVY` | fits |
| 4 | 1021 NETHERWOOD DR | `BCHKLNSVY` | wraps |
| 4 | 67 FINCHLEY BLVD | `BCHLMSVY` | wraps |
| 5 | 105 HADASSAH LN, 166 CHATEAU DR, 53 RENA LN | 8 each | wrap |
| 5 | 48 / 28 CUSHMAN ST, 25 HEKEL RD | 8 each | fit, at 106.2 |

The discriminator is glyph width, not count: every wrapping set contains `M`, `W`
or `K`. The sets that fit sit within 3pt of the edge, so one more publication on a
7-letter stop, or a confirmed letter for one of the five guesses, tips more over.

**Severity, stated precisely, because it is easy to overstate.** The zebra band
grows with the row, so on a *shaded* row the wrap is contained and reads correctly
— `106 SPRUCE ST (upstairs)` shows `A B C L M N S` / `V W Y` inside one band. On a
*white* row there is no band to bind it: `41 NEWBERRY CT (upstairs)` prints
`B C L M N S V` and then a bare `Y` on the next line, delimited only by the shaded
bands of 37 above and 43 below. It is not wrong, but at night a hurried driver
could read that `Y` as 43's — and 41's instruction is `YATED ON PORCH`, so the one
publication with a placement instruction is the one whose letter is stranded.

**Widening the column is only a partial fix**, measured: at 24% (130.6pt) the ten
drop to two; `106 SPRUCE ST` still wraps at 26% (141.4pt), and any hypothetical
stop with 11+ letters always wraps. Halving `letterSpacing` to 0.5 achieves about
the same as 22%. So the durable fix has to make a wrapped line unambiguous rather
than try to prevent wrapping. **This is Ari's call** — he set 13.5pt at natural
height deliberately and rejected squeezing the letters once already — and it is a
layout question for `lakewood-courier-ux`.

**Not a regression from the collapse work.** `stopPubs` predates it (commits
`1336534`, `e6d8518`). It only appears when a stop has 8+ *selected* letters, so
single-publication booklets are unaffected, and it needs 8+ letters on one stop.
**Closed 2026-08-28:** a real run selects a handful of publications, never
fifteen, so this cannot arise in practice. Ari: "You don't have to be concerned
about the ones that don't fit on the line." Do not widen the column.

#### Other findings from the zone 2 audit

- **`545 HOWARD DR` decodes as two real households.** Read against the
  spreadsheet's column order, `I STEIN BOYS V S 545 HOWARD DR` and
  `I V 545 HOWARD DR` are address rows: a `V`+`S` household and a `V` household.
  If that reading is right, two Voice subscriptions and one Shopper are on no
  booklet at all. The leading `I` is unexplained — possibly a mangled floor glyph
  — so **a human must open `BP ZONE 2.xlsm` and read the cells.** The route
  position is *not* in doubt: `545 HOWARD DR` appears only at seq 613–616, one
  contiguous block, so the recovered rows belong at 613–618. No interpolation
  needed. All four existing rows are `active=false`, one carrying
  `5 COPIES TO THIS ADDRESS`, which also needs reconciling.
- **The corrupted rows now print loud, and that is correct.** They render in
  `#d8d8d8` bold between `553 HOWARD DR` and `TURN LEFT ON NEAL CT` on the ALL,
  Voice, Shopper, BP, Circle and Lakewood Courier booklets. Quiet-and-wrong would
  print "Nothing for this booklet along here" over what may be three undelivered
  papers — an affirmative false statement. A visible anomaly is what gets
  reported; that is the only thing that fixes it. The pre-fix muting was
  accidental, not protective.
- **37 active stops carry an instruction naming a publication they do not
  receive** — 27 in zone 2, 10 in zone 1, after excluding every case where another
  unit at the same house number holds that letter. Examples:
  `49 FOREST PARK CIR [BS]` / `YATED AT DOOR`; `25 NEWBERRY CT [BCLSV]` /
  `PUT AMI AT DOOR!`; `16 CHELSEA CT [BSV]` / `PUT MISHPACHA IN MAIL SLOT`. Each
  is either a missing `stop_publications` link — a paying subscriber getting
  nothing, silently — or a stale note. Inherited from the route spreadsheets;
  present on `main` before and after this work. A reconciliation question, and the
  asymmetry rule applies: do not resolve it by deleting.
- **Forest Park Cir may be missing a stretch, or may be one-sided.** Measured on
  zone 2: 113 odd-numbered stops covering 1→167, and only 11 even — 4, 6, 8, 10,
  12. Evens 14–166 are absent entirely. So `CROSS THE STREET AND DELIVER EVEN
  NUMBERS` (seq 359) leads to five houses, and `CONTINUE ODD NUMBERS` (seq 358)
  sits *after* all 113 odds are already delivered. Either seq 358 is vestigial and
  the circle is genuinely one-sided, or a stretch never got imported. **Needs
  Amrom**; do not guess.
- **`START 485 RIVER AVE` prints loud only by luck.** On the all-publications
  booklet the whole dead set is `{1, 519, 735}`, and seq 1 is dead because its only
  stop (`485 RIVER AVE`, seq 2) is retired. It stays at full weight purely because
  a run of 1 is below `SKIP_RUN_MIN`. **Anyone lowering `SKIP_RUN_MIN` mutes the
  route's start point on the booklet that goes out every week.**
- **`getBooklet` never checks `.error`.** Every query is consumed as
  `x.data ?? []`, so a failed or truncated PostgREST response yields a shorter
  booklet with no warning. Zone 2 is the largest route at 735 entries and the
  zone page's own `ROW_CAP` is 1000, so there is not much headroom. Worth a real
  check against production.
- **Three publications render a blank route page** in zone 2 (Dee Voch, Hundred,
  Kindline) — the same "reads as a print failure" issue already recorded for zone 1.

#### Corrections to the zone 1 verification method

Both are worth knowing because they made that pass weaker than it looked.

- The zone 1 harness's `truthDead` was a **transliteration of
  `markDeadDirections`, not an independent recomputation** — same unit boundaries,
  same latch. "0 dead-set mismatches" proved the transcription was faithful, not
  that the rule was right. The load-bearing evidence is the ordered/multiset
  direction comparison, which does not depend on the deadness rule at all.
- The pre-fix/post-fix comparison used set membership (`!includes`) rather than a
  counted multiset, so a text muted 4× before and 3× after would have reported
  zero change. Recomputed properly: the promotions are right, and **nothing is
  newly muted** on any zone 2 filter.

### What the zone 2 verification still does NOT cover

- **Zones 3, 4 and 5 have never been dumped.** The letters-overflow table above
  is from the database directly, not from rendered booklets for those zones.
- The cover sheet remains completely unexercised, and RLS remains bypassed.
- The harness hardcodes the five unconfirmed courier letters. Wellsprings and
  Shtenderel — the two worst-rendered sparse booklets — exist only on guesses.
- There is no unplaced/near-miss section in `Booklet` or `BookletDocument` at all
  (`grep -rn "unplaced" src/` is empty), so `docs/domain-notes.md`'s rule that an
  unconfirmed address is listed on the cover and kept off the route pages has no
  implementation to test. That is the open item below.

## What is open

- **Where the weekly import stands, 2026-09-01.** The 2026-08-31 figures were
  verified through the real screen signed in against production; the removal
  count then moved once more when Ari closed the River Ave question (see
  `docs/domain-notes.md`, "River Ave is a commercial road"), measured through
  the real `planRoster` on the same file:

  ```
  19,642 rows · 62 to apply · 187 need a choice · 1,257 already correct
         · 18,123 not on our routes · 13 we could not read
  ```

  (The row total counts the 21 appended removal rows. The questions were 188
  until Ari settled `122 CAREY ST` — the recorded answer lives in production's
  `address_rulings`.)

  62 to apply = 41 additions + 21 removal lines at 16 addresses — the 12 lines
  beyond the previous 9 are the seven River Ave addresses `covered()` had been
  holding back. Nothing is auto-created; every new address names the line it
  should sit beside and waits. Both guards pass without tripping: removals 16
  of 1,102 against a limit of 55, additions 41 against 165.

  Terminology (Ari, 2026-08-31): the **master list** is the spreadsheet The Voice
  sends; the **zones** are what is in the system.

- **The 27 Aug roster still needs re-planning after the paging fix.** Every count
  produced before 2026-08-28 came off a 1,000-address list and is wrong — the
  "42 ready / 392 need a choice" numbers included. The deployed screen now reads
  **73 to apply, 582 need a choice, 881 already correct, 18,101 not on our
  routes** — confirmed 2026-08-30 by an independent recomputation that matches
  the app exactly. `73 = 57 plan rows + 16 roster removals`, because `planImport`
  pushes the removals into `rows` before computing `summary.ready`.

  **Those figures are themselves superseded** by the block above: the near-miss
  evidence rule, the coverage rule and the rulings table have all landed since.

  An earlier draft of this line predicted "roughly 61", and the way it went wrong
  is worth keeping: its other three figures were exactly right, so the full list
  was in hand for the plan rows (57). The 61 is `57 + 4` — the **truncated**
  removal count carried across instead of the real 16. A stale component inside
  an otherwise correct calculation, which is harder to spot than a wrong method.

- **All four gaps the counting rewrite left are closed** (2026-08-31, PRs #17 and
  #18). Recorded because each was found by review rather than by testing, and the
  shape of each is worth knowing:

  - **The addition side now has a tripwire too.** `additionsLookWrong` — floor of
    40, else 15% of the publication's addresses. Deliberately looser than the
    removal guard, because a wrong addition wastes a paper where a wrong deletion
    loses a subscriber, and a publication's first run genuinely is a large
    reconciliation. The 27 Aug roster's 20 additions sit against a limit of 165.
  - **`/import` is courier office only**, matching Manage Users. RLS already
    refused every write a scoped staffer could attempt, but the failure came at
    the first statement with an opaque Postgres error — and upstream of it, their
    `loadContext` returns only stops that already carry their publication, so the
    whole count premise was computed from a partial list.
  - **Nothing is auto-created.** `create_stop_in_route` appends at
    `max(sequence) + 1`, which on every production route is *after* `DONE`. 48
    rows would have been created in one click. A create now names the line it
    should sit beside and waits for a person.
  - **`applyImport` re-checks the premise, not just the ids.** Every create
    carries `linesAtPlanTime`; apply compares it against the list it re-reads and
    skips the row if an address gained a line in between. A create has no id to
    validate — the address simply exists now and did not before. Two staff each
    uploading the same roster is the same shape.

- **The >1 MB import post-deploy check.** Upload and review only, do not apply.
  Needs a signed-in production session. Last item from `SETUP.md`.
- **Five unconfirmed courier letters** (above), before the first real print run.
- **A near-miss list has nowhere to go.** Unresolved addresses are correctly
  withheld from the courier, but nothing tells the office they exist, so they
  would be withheld silently forever. Needs a fourth cover section or an
  office-only sheet. As of 2026-08-26 this has **49 concrete rows** attached to it
  from the real Voice roster — see `docs/domain-notes.md`. `grep -rn "unplaced" src/`
  is still empty, so there is no implementation to put them in.
- **The 27 Aug Voice roster has not been applied.** Re-derived 2026-08-30 against
  the whole address list: **57 additions, 16 removals, 582 needing a choice**.
  The older "111 additions / 68 needing a choice" is invalidated and not
  recoverable — see `docs/domain-notes.md`. Where the three open questions stand:

  - **River Ave — resolved (Ari, 2026-09-01).** The single `611 River Ave` row
    is expected, not a coverage failure: the road is commercial. Its unlisted
    addresses are removals like any other, including the residential
    `809 River Ave · Preschel`. `covered()` no longer requires the file to name
    an address we hold — see `docs/domain-notes.md`, "River Ave is a commercial
    road". The removals now show on the review screen; nothing is applied
    without a person.
  - **The 71 tail rows** (`Zone1_1`…`zone2_8`, grid rows 19552–19622) move the
    result by **+6 additions, −10 removals, +16 needing a choice**. The earlier
    "about 40 additions and 25 removals" was measured on truncated zones 1 and 2
    and is **invalidated**. Without them removals rise to 26, still under the
    guard's limit of 55.
  - **9 of the 12 addition ADDRESSES are odd-side Pine St (151–233)** — twelve,
    not fifty-seven, because most additions attach the publication to a stop we
    already hold rather than creating one; only 18 lines at 12 addresses are new
    doors. All
    21 of our Pine St stops are even (150–270); same shape for `7 Chelsea Ct`
    against our even 2–20. That is a new side of a street, not infill, and the
    range check passed it only because 151–233 sits inside 150–270.
    `lakewood-courier-routing` should place these before any are created.

  For the record, the guard does **not** stop this run: `removalsLookWrong(16,
  1102)` gives a limit of 55 and does not trip, with 39 of headroom. An earlier
  claim in this session that it would trip was wrong — the guard only ever sees
  `planRosterRemovals`' whole-address count.
- **Two corrupted rows in zone 2's production route.** `I STEIN BOYS V S 545
  HOWARD DR` and `I V 545 HOWARD DR` are stored as `direction` rows but are
  clearly address rows. They print as loud driving instructions, and because
  545 Howard Dr is not a stop record it is invisible to every publication filter.

## Closed since this file was last rewritten

- **"Whose list wins" is answered (Ari, 2026-08-27).** The publication's new list
  wins. Each week its full Lakewood roster is reconciled against the database, the
  result is applied, and the database becomes the list we work from; next week's
  file is compared against that. Removals are therefore in scope and are built —
  see `planRosterRemovals` and the weekly-cycle section of `docs/domain-notes.md`.
- **Donath's password.** The open item said she had never set one. She had:
  `rdonath@circmag.com` shows `last_sign_in_at` 2026-08-21 13:14 and signed in
  again on 2026-08-27. Nothing to do. Worth knowing *why* the old reading was
  wrong, because the same trap is easy to fall into again: `updated_at` moving
  without `last_sign_in_at` moving does **not** mean a failed password set. A
  refresh-token rotation logs as `action: login` with `login_method: token` and
  bumps `updated_at` alone. Ari's own account looked broken for exactly that
  reason on 2026-08-27 — an `updated_at` of 25 Aug that was a session refresh,
  not a password change. Check `login_method` in the auth logs before concluding
  anything from those two timestamps.

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
  St is reached at five separate points in zone 3, Pine St at four in zone 2 --
  though only two of Pine St's four are blocks with deliveries; see
  `docs/domain-notes.md` for the measured per-street counts.
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
- **PostgREST caps an unpaged select at 1,000 rows, silently.** Not an error, not
  a flag in the response — just a short array. This had the weekly importer
  planning against the first 1,000 of 2,427 active addresses, and every symptom
  looked like a matching problem rather than a truncation:

  | On the Review screen | Truncated (what staff saw) | Whole list |
  | --- | --- | --- |
  | need a choice | 392 | 582 |
  | already correct | 392 | 881 |
  | not on our routes | 18,799 | 18,101 |

  So 698 addresses we already deliver to were reported as *not on our routes*, and
  of 14 rows offered as new addresses **12 already existed — 8 of them houses
  already receiving The Voice.** Applying would have put a second paper and a
  second booklet line on eight doors. Found 2026-08-28 by reproducing the exact
  first 1,000 rows in physical order (`order by ctid limit 1000`) and matching all
  three disputed buckets exactly; the full list matches none of them. Fixed with
  `fetchAllPages` in `src/lib/fetch-all.ts` — it pages and, importantly, **throws
  rather than returning what arrived**, because a partial list makes every address
  the roster did not mention look like a cancellation. `loadContext` and
  `getBooklet`'s route query both use it. Route entries are the next thing to
  watch: zone 2 is 735 of the 1,000 cap.

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
