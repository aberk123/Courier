# Domain notes — captured 2026-08-19

Sources: Fireflies transcript `01KZY290FK5SMNX0AX9NVZZV12` ("Conversation
with Amrom", 2026-08-13, 31.5 min) and email "zones 1-5" from
amrom@mailpak.com to ari@thevoiceoflakewood.com, 2026-08-19 11:22am ET
(5 attachments: `BP ZONE 1.xlsm` – `BP ZONE 5.xlsm`).

## Current manual workflow (what we're replacing)

1. The Voice sends Lakewood Courier a weekly **master list** — all
   subscriber addresses, zoned. This is a separate file from the routes.
2. Lakewood Courier's office manually diffs the new master list against
   the old one to find additions/deletions, looks up each address's zone,
   then hand-edits the corresponding **route file** and the **cover page**.
3. Every route is printed as an auto-stapled booklet: cover page (that
   week's additions/deletions/complaints) + the route itself, addresses
   listed in actual driving order with turn-by-turn directions woven in.
4. Master list and route files drift out of sync over time (addresses
   removed from routes are not always removed from the master list) —
   Amrom confirmed this on the call. The master list is the intended
   source of truth going forward, but needs a one-time AI-assisted
   reconciliation against the current route files before automation can
   rely on it.

## Real route-file structure (from the 5 sample zone files)

Each zone file (`BP ZONE {n}.xlsm`) has two sheets:

### `ROUTE` sheet
- A header block: courier phone number, then a `Total # of {PUBLICATION}`
  count for each of 14 publications (BP, Voice, Shopper, Yated,
  Mishpacha, Ami, Circle, Hamodia, Bina, Dee Voch, Hundred, Wellsprings,
  Lakewood Courier, Kindline, Shtenderel). **The Voice is one of many
  publications bundled into the same physical delivery run** — this is
  broader than "just the Voice's subscription list."
- Body rows, in strict delivery order, of two kinds:
  - **Direction rows**: free-text driving instructions (e.g. `START AT
    DUNE CT`, `DELIVER EVEN SIDE`, `TURN ONTO ROCKBRIDGE RD`,
    multi-line building-entry instructions with door codes). These must
    stay interleaved with the address rows they precede, not stored
    separately.
  - **Address/stop rows**: recipient name (optional/blank for some
    business or unnamed stops), one column per publication marked with a
    single-letter code when that stop receives it (`B`, `V` = **The
    Voice** — confirmed by Ari 2026-08-19, `S`, `Y`, `M`, `A`, `C`, `H`,
    `N`, `L`, ...), house number, a
    floor/side indicator (`á` upstairs, `â` basement, or blank),
    street name, a special-instructions column (door/porch placement,
    "VIP!!!", "2 CIRCLES", etc.), an occasional second notes column, and
    a trailing **boolean active flag**. Some rows already carry `FALSE`
    — Lakewood Courier keeps removed stops in the sheet rather than
    deleting them, i.e. an existing soft-delete convention. A few rows
    show `#REF!` where a formula broke; treat these as data-cleanup
    findings, not a format to replicate.
- Ends with a `DONE` marker row.

### `ControlSheet`
- A fixed list of the 14 publication names, each flagged `TRUE`,
  annotated "DON'T CHANGE MANUALLY." **Confirmed by Ari 2026-08-19: this
  is pure UI plumbing** — it only feeds the spreadsheet's magazine-picker
  dropdown/macro, it does not function as a per-publication on/off
  switch in the current system. Not a precedent that already exists in
  production, but Ari is open to us using the same *shape* (a fixed,
  explicitly-flagged list of enabled publications) as a design pattern
  for our own publication-config table, if useful — that would be a new
  decision on our end, not something inherited from Lakewood Courier's
  current tooling.

## Requirements from the call (by feature area)

**Weekly update loop**
- Two update paths, both must stay open: (a) The Voice uploads a weekly
  spreadsheet of additions/deletions/instruction-changes, applied in
  bulk; (b) The Voice's subscription staff get direct backend access to
  add/remove/edit addresses in real time as calls come in, no upload
  needed. Either path must be reflected in the next export and on the
  cover page.
- Fuzzy/duplicate address matching on bulk upload: auto-merge when a
  near-match is unambiguous, prompt the user when more than one existing
  address is plausibly similar. Manual backend edits don't need this —
  staff pick the exact record to edit/delete.

**Export**
- One route at a time or all routes at once.
- **Always as separate PDFs per route** (Amrom was explicit: their
  printer auto-staples each print job, so one continuous PDF that has to
  be manually re-sorted and stapled is worse, not more efficient).
- Cover page per route per week, with four distinct sections —
  Additions, Deletions, Changes, Complaints — per Amrom's ask on the
  call (30:19) that complaints read as clearly distinct from
  additions/deletions. See "Cover sheet structure" below for confirmed
  row content and the note that the sample is content-only, not a
  layout to copy.
- Export must preserve the driving-direction text and its position in
  the sequence, and the special-instructions column.

**Complaints** (confirmed by Ari 2026-08-19)
- Originated by a subscriber calling in about how their delivery was
  handled (e.g. misplaced, missed, damaged) — not by the courier. This
  is the subscription department's intake, same as an address
  add/remove call.
- A complaint is tied to a specific stop/address and gets relayed to
  the courier via the cover sheet's Complaints section in the *next*
  week's booklet — same weekly cadence as the rest of the cover page,
  not a separate channel or real-time alert. See "Complaints —
  historical retention" below for what happens to it after that.

**Master list / route reconciliation**
- One-time cleanup: take The Voice's master list, use AI matching to
  align it against Amrom's current route files (which are more
  reliable for "is this address still live") and produce a single
  reconciled source of truth, formatted like the existing route
  structure. After that, the master list drives all future routing.
- Ongoing: new master-list addresses get auto-assigned to the correct
  route/zone; removed ones get pulled from their route automatically.

**Courier mobile app (explicitly scoped as a separate, later
integration — not MVP-blocking)**
- Couriers check off streets or whole routes as completed from their
  phone; optionally check in at start too.
- Couriers can add free-text notes (delivery problems, complaints) but
  cannot delete or edit addresses.
- Alternative low-tech path: courier texts a fixed number ("done route
  31" or just "done" if the number is already tied to a known route),
  which flips that route's status without an app.
- Office sees notes/completions in real time.

**Access model**
- Subscription department: full read/write on addresses and
  instructions, search, no upload required.
- Couriers: read-only on their own route plus notes/check-off, no
  address edit rights.
- Lakewood Courier office: import, export, cover-page layout control.

## Scope decisions (confirmed by Ari)

- **2026-08-19 — full multi-publication tracking, not Voice-only.** The
  platform must track the delivery list for every publication on the
  route sheet (BP, Voice, Shopper, Yated, Mishpacha, Ami, Circle,
  Hamodia, Bina, Dee Voch, Hundred, Wellsprings, Lakewood Courier,
  Kindline, Shtenderel) as first-class, independently add/removable
  subscriber data — not carried through as opaque per-stop flags with
  only The Voice modeled properly. Each publication needs its own
  subscriber list at each stop, not just a shared address list with a
  Voice/BP flag bolted on. This changes the data model: publication
  needs to be a real dimension (e.g. a `stop_publications` join, not a
  fixed set of boolean columns per publication), since new publications
  may need to be added later the same way zones will be.
- **2026-08-19 — per-publication ownership/access is required.** Access
  control is not just role-based (subscription staff vs. courier); it
  also needs a publication dimension. A user (or org) tied to one
  publication should not automatically see or edit another publication's
  subscriber list, exports, or publication-specific notes/complaints.
  **Resolved 2026-08-20 by Ari: The Voice is the sole operator and the
  other publications are scoped participants** — not independent
  tenants. Ari may revisit and make them fully independent later, so
  keep the publication-scoped access layer general enough to support
  that, but do not build multi-tenant isolation now.
- **2026-08-19 — export must support arbitrary publication combinations.**
  Not just single-publication or full-14-bundle: publications are
  sometimes delivered in combinations, so export needs to accept any
  selected subset of publications for a zone/route, both for the
  filtered address list and the cover sheet. See "Export publication
  scope" below.

## Booklet structure (confirmed by Ari 2026-08-19)

A booklet = the route itself (addresses + driving directions, in the
exact structure shown in the zone samples) **plus** a cover sheet.

## Cover sheet structure (confirmed by Ari 2026-08-19)

- **Four distinct sections: Additions, Deletions, Changes, Complaints.**
  Correction to an earlier misreading of the sample: the "VOICE ZONE
  48" PDF is a **content/concept reference only**, not a layout to
  copy — Ari was explicit: "use this page as a concept, not design."
  We own the actual visual design and should do it better than the
  sample's plain flat list; the four-section grouping is the
  structural requirement, not the sample's specific rendering of it.
- Title is scoped to whichever publication(s)/zone the export was run
  for — see "Export publication scope" below; the sample's zone
  numbering (48) means the eventual full rollout is dozens of zones,
  not a handful.
- Row-level content confirmed by the sample (still our best source for
  what data each row needs, independent of layout):
  - **Deletion**: name, address, publication removed (e.g. `Weinstock ·
    6 Goldcrest Dr · Delete Voice`).
  - **Complaint**: address (name optional), free-text description of
    the issue (e.g. `27 Hawk Way · not getting voice`).
  - **Addition**: not present in this sample — presumably parallel to
    deletion; still needs confirming.
  - **Change**: an Upstairs/Basement/Apt # update to an existing stop's
    special instructions.
- **Standing footer**, same every week regardless of that week's
  changes: reminders to review routes weekly, a directive not to slam
  magazines into doors, a request to report missed/hard-to-find
  addresses immediately, "if unsure, ask, don't guess," and a direct
  contact number for Amrom (this sample: 732-666-1311, "24 hours a
  day" — distinct from the 732-546-9333 office line in his email
  signature; record both, no need to reconcile). Static template copy,
  not per-week data — model as a template, not a database field.

## Complaints — historical retention (confirmed by Ari 2026-08-19)

- Complaints must be **persisted and queryable for reporting**, not
  discarded after being printed once.
- Once a complaint has appeared on a cover sheet, **it must never
  appear again on a future cover sheet** — the weekly Complaints
  section only shows complaints not yet surfaced to the courier.
  **Confirmed by Ari 2026-08-19: this is the complaint's entire
  lifecycle** — there is no separate resident-facing "resolved" status.
  Model it as a single `shown_on_cover_sheet_at` timestamp (null =
  still pending, set = excluded from all future cover sheets but
  retained and queryable for reporting).

## Export publication scope (confirmed by Ari 2026-08-19)

- Publications are **sometimes delivered as combinations**, not just a
  single publication or the full 14-publication bundle. Export must
  support selecting **any combination of publications** for a given
  zone/route — not a fixed single/all toggle.
- This applies to both halves of an export: the filtered address/route
  list (which stops appear) and the cover sheet (title, and which
  publications' additions/deletions/changes/complaints appear).

## Route ordering (confirmed by Ari 2026-08-20)

- **Route order is the default view.** The zone screen renders the
  `route_entries` sequence as imported — driving-direction rows
  interleaved in position with the stops they precede — not an
  alphabetical street listing. Search filters that list while keeping
  route order, so a staffer looking someone up also sees where they
  fall in the run.
- Consequence for writes: any stop created in-app must be given a
  `route_entries` row, or it is invisible in the default view. New
  stops are placed after the last existing stop on the same street,
  falling back to the end of the route when that street is not yet in
  the sequence.

## Weekly import file format (assumption, built 2026-08-20)

We have never seen The Voice's actual weekly spreadsheet, so the importer does
not hard-code a layout. It reads CSV and .xlsx, treats row 1 as a header, and
matches column names loosely (`FIELD_ALIASES` / `ACTION_ALIASES` in
`src/lib/import/parse.ts`) against: action, name, house number, street,
publication, floor/side, instructions. `/import/template` serves a known-good
example.

When a real file arrives, the likely change is adding aliases -- not rewriting
the parser. If the office's file splits the address into one cell
("123 Forest Ave") rather than separate house-number and street columns, that
does need a small parser change.

Matching behaviour, per the call: merge automatically only when the address is
unambiguous (street suffixes are canonicalised and a two-character spelling
slip is tolerated, then narrowed by floor/side and name), and otherwise ask.
A brand-new address takes its route from other stops on the same street when
that is unambiguous; otherwise the reviewer picks the route. Nothing is written
until the reviewer confirms, and the plan is re-validated server-side because
it round-trips through the browser.

## Finding an address without knowing its route (confirmed by Ari 2026-08-20)

Ari's words: *"many times the CSR does not know which route a customer is in
until they search their address."* The old home screen was a list of five routes
and nothing else, so every lookup began with a guess about which route to open —
and if the guess was wrong the CSR searched the wrong 700-row list.

The decision: **the home screen leads with a search across every route**, and an
address can be added from there without picking a route first.

How it behaves, since these details are the requirement:

- One box searches all routes at once, on house number, street *and* recipient
  name. A CSR types what they hear on the phone — "28 squankum rd" — so a
  leading house number is split off and matched exactly while the rest is
  matched loosely. Searching a bare street or a surname works too.
- Street-type suffixes are ignored when matching, because the caller says "rd"
  and the route sheet says "ROAD". "28 squankum rd" finds "28 SQUANKUM ROAD".
- Each result is badged with the route it is on, and opens that address directly
  in its route workspace — the CSR never has to find it a second time.
- If nothing matches, the add-address form opens already filled in from the
  search, with the route **pre-selected from the street**: a new house number on
  a street already covered is almost always on that street's route. The CSR can
  override it. If the street is on more than one route, the busiest wins.
- Scoping is unchanged: the search runs through RLS, so a publication-scoped
  staffer finds only addresses that receive a publication they hold, and is
  offered only their own publications when adding.

Deliberately not built: fuzzy/typo-tolerant search. The importer has edit-distance
matching for spreadsheet rows, but that is for reconciling a file against the
list, not for a CSR who can retype. Add it only if real use asks for it.

## Publication marks on the courier booklet (confirmed by Ari 2026-08-20)

Ari asked for each address's publications to be marked so a driver can read them
"at night". He first suggested two-letter codes (his example: The Voice → `TV`),
then chose instead to **keep the single letters the drivers already use** on
Lakewood Courier's own spreadsheets, so nobody has to relearn anything. Printed
large and bold.

- **13.5pt bold black**, against 9.5pt body text — the largest thing on the row
  by a clear margin.
- **Rows are spaced for legibility, not for paper.** The first version squeezed
  the letters' line box so row height stayed identical and no booklet gained a
  page. Ari looked at it and rejected that trade: *"The lines are too close on
  top of each other. There should be more space so that it's easier to follow the
  list, even if some zones will take up an extra page."* So the letters now sit
  at their natural height and the row gap is `marginBottom: 5`.

  What that costs, measured rather than guessed — rows per route page and the
  resulting page count for the largest real route (735 entries):

  | Row gap | Rows/page | Pages for 735 |
  | --- | --- | --- |
  | 1.5 (the rejected tight version) | 57 | 14 |
  | 3 | 44 | 18 |
  | 4 | 41 | 19 |
  | **5 (shipped)** | **39** | **20** |

  Most of the loss comes from letting the letters sit at natural height, not from
  the margin itself. Do not shrink this back to save paper without asking Ari —
  the gap is the point.
- The letters are **per publication in the database** (`publications.courier_letter`),
  not hardcoded, so the office can correct one without a deploy. A unique index
  stops two publications sharing a letter, which would make a route sheet
  ambiguous; the format check keeps it to a single capital.
- **The cover sheet still uses full names** (`Delete The Voice`). That page is for
  the office, not the driver, and its per-publication Deletion format is already
  confirmed.

Ten letters are confirmed by the sample zone files: `B` BP, `V` The Voice,
`S` Shopper, `Y` Yated, `M` Mishpacha, `A` Ami, `C` Circle, `H` Hamodia,
`N` Bina, `L` Lakewood Courier. Note **Bina is N, not B** — BP owns B.

**Five are guesses and need Amrom's confirmation** before the first real print
run, because the sample files' columns trail off before showing them:
`D` Dee Voch, `W` Wellsprings, `K` Kindline, `T` Shtenderel (S is Shopper's),
`U` Hundred (H is Hamodia's). Four of these five reach fewer than 20 addresses
each and Hundred currently reaches none, so the exposure is small — but a wrong
letter on a route sheet is a misdelivery.

## The real publication master list — measured 2026-08-21

Ari supplied two genuine Mishpacha subscriber reports (issues 906 and 907) and
said *"the Mishpacha list that we have now in the system should match the 907
list."* **It does not.** Measured, not assumed:

| Comparison | Result |
| --- | --- |
| 906 vs 907, streets we deliver | 2 dropped, 3 added |
| **907 vs our Mishpacha list** | **60 deletions, 86 additions, 107 matched** |

The first row is the control: two consecutive weeks of the publication's own file
differ by five addresses, which is believable churn and proves the parsing and
matching work. The second row therefore is not a matching artifact — **our list
and Mishpacha's list have genuinely diverged.** Our data came from Amrom's route
spreadsheets, which the courier maintains by hand; the file is Mishpacha's own
billing view. Whole streets we carry (CLAIRE DR, PRINCEWOOD AVE, STONEWALL CT)
appear nowhere in the file.

**Consequence: the first master-list import is a data-reconciliation event of
~150 changes, not a routine week of ~5.** It must not be auto-applied.

### Ari's decisions on reconciliation (2026-08-21)

- **New addresses slot in by house number.** Read the neighbouring house numbers
  already on that street within that route and insert between them, so the
  courier's existing walking pattern is inherited. If the street appears in
  several separate blocks of the route, ask rather than guess. No map.
- **Out-of-area rows are listed in full** as an "unknown street" section, not
  merely counted. Note this is ~1,600 rows on the Mishpacha file, which will
  dwarf the ~150 that need action — revisit if it proves unusable.
- The ~150-change first import is understood to be a test of whether the system
  picks up weekly changes, not a decision about whose list is authoritative.
  **That question is still open** and must be settled before any real apply.

### Match by address only, and count (Ari, 2026-08-21)

Ari, after spot-checking a sample and finding my unit assignments wrong: *"why do
we need to use surname matching? I think that's adding an item that can cause
more complexity. I think rather just match addresses. If there are two of the
same address, then keep two of the same thing again in the delivery list as
well."*

**Reconciliation is a count per address, not an identity match.** For each
(house number, street): compare how many lines we hold against how many the file
has. More in the file → add that many lines. Fewer → remove that many. Equal →
no change. Names are never compared, and no unit is assigned.

Measured against issue 907, this is not a worse answer — it is the same answer
without the guessing:

| Method | Additions | Deletions |
| --- | --- | --- |
| Surname + unit matching | 86 | 60 |
| Address counting only | 88 | 60 |

It also removes three real errors that surname matching had introduced into a
hand-built sample: an addition placed on the upstairs unit when the file said
`BSMT`, a kept row placed on the wrong unit, and an address counted as matched
when the file's household was neither of ours. Under counting, all three are
either "one line, driver picks the door" or "no change".

And it is immune to the two sources spelling one family differently, which they
do constantly: DIAMANT/DIAMOND, NOSENCHUCK/NOSENCHUK, HERSKOWITZ/HERSHKOWITZ,
Neuhaus/NEWHOUSE, ZELKOWITZ/ZELKOVITZ, KOEGEL/KOGEL, Kaplan/KAPLUN,
KRONGLAS/KRONGLASS, Weinreb/WEINRIB. Nine of twenty apparent name conflicts were
just spelling.

**Accepted limitation:** counting cannot notice a change of occupant. 12
BRIDGEWOOD went Greenwald → Pressburger between our list and the file, and
counting calls that no change. That is correct for the courier — still one paper
to that door. Only the publication's billing would care.

**Implementation note:** when a count drops from 2 to 1 at an address, either of
our two stops may lose the publication; the driver treats them as
interchangeable. Today no Mishpacha address is held twice, so the case does not
yet arise. The 907 file does list three of our addresses twice (17 NEWBERRY,
5 CEDAR, 55 CANARY), so it will.

### The street NAME varies too, not just the suffix (2026-08-21)

An independent review of the first corrected booklets caught two deletions that
would have cut real subscribers. The suffix rules below were right but
incomplete: **the publication misspells the street name itself.**

- `2 BRIDGE WOOD` is our `2 BRIDGEWOOD AVE` — one inserted space, no suffix at
  all. The household name matches exactly (SENDER), and the file carries it in
  every issue from 906 to 1125.
- `22 NEWWOOD HILL AVE` is our `22 NEWWOOD HILLS AVE` — one missing character.
  The same file spells the same street `NEWWOOD HILLS AVE` two rows later, at 24
  and 31. It is inconsistent about its own street.

So, in addition to the suffix rules:

4. **Strip all whitespace from the street base before comparing.** That alone
   resolves `BRIDGE WOOD`, with no fuzzy matching at all.
5. **Tolerate a one-character slip, but only on a base of six or more
   characters.** `NEWWOOD HILL` → `NEWWOOD HILLS` is safe at that threshold.
   A looser rule is actively dangerous: at two characters it matched
   `RIVKA LA`→`RICKY LN`, `DINO BLVD`→`PINE BLVD` and `DINA PL`→`GILA PL`, all
   different streets. Tested against the real file, ≤1 on 6+ characters accepts
   only three variants across 1,960 rows — `NETHERWOOOD DR`, `HADASSA LANE` and
   `NEWWOOD HILL AVE` — and rejects every false one.
6. **A near-miss must suppress the matching deletion.** If a file row is held
   back as unresolved, our address at that house number must not then be counted
   as removed — that is precisely the deletion the near-miss list exists to
   prevent. Withholding `781 CYPRESS ST` while still printing "delete 781
   CYPRESS AVE" is the same mistake wearing a different hat.

With rules 1-6, issue 1125 against our list is **160 of 167 matched, 11 added,
4 removed, 3 held back** — against 154/13/11 at the start of the day, when three
of those removals were real households.

### New addresses are not sequenced without confirmation

The review also found that `1471 OAK ST` and the six odd-side Pine St addresses
had been given route positions while the cover sheet simultaneously said the
position needed confirming. Ari's rule is to ask, not guess, when a street spans
several blocks — Oak St is reached at five separate points in zone 3, Pine St at
four in zone 2 — or when the house number falls outside the covered range.

**An unconfirmed address is listed on the cover as unplaced and kept off the
route pages entirely.** A note in the instructions column is not enough: it sits
on a row the driver will otherwise simply walk.

### Street-suffix rules, learned the hard way (2026-08-21)

A worker spotted that the first sample booklets looked wrong. He was right, and
the cause was street-suffix handling. Both naive approaches fail, in opposite
directions:

- **Ignoring suffixes** merges genuinely different streets. Lakewood has OAK ST,
  OAK LN *and* OAK DR; READ ST and READ PL; CEDAR ST, CEDAR CT and CEDAR DR;
  PINE ST and PINE BLVD. Dropping the suffix silently merged them and invented
  additions that did not exist.
- **Requiring exact suffixes** invents deletions. The publication writes
  `6 SHENANDOAH` with no suffix at all, `22 EAGLE LA` for Eagle Ln, and
  `781 CYPRESS ST` for what our route calls Cypress Ave.

The rule that works:

1. **Canonical match including the suffix.** Expand abbreviations first — `LA`,
   `CRT`, `DRV`, `PLC`, `WY` and friends all normalise. This is the only
   automatic match.
2. **A missing suffix may match**, but only when exactly one of our streets has
   that base name. `6 SHENANDOAH` → SHENANDOAH DR is safe because we carry no
   other Shenandoah.
3. **A different suffix is a different street.** Never auto-match. `781 CYPRESS
   ST` against our CYPRESS AVE is *probably* the same street — the house numbers
   sit in the same run as 658/707/761 — but "probably" must go to a human, not
   into a deletion. These belong in a near-miss list.

With those rules, issue 1125 against our list: **156 of 167 matched, 11 added,
11 removed.** Under exact-suffix-only it looked like 154/13/11, and three of
those "removals" were real subscribers.

### What this does NOT change: the printed floor label (Ari, 2026-08-21)

Asked whether the upstairs/basement label should stop printing, since the driver
can infer it when an address appears twice, Ari was specific: *"Keep all labels.
If there is currently no label at an address, keep it that way but don't delete
two of the same address. Most likely one is upstairs and one is downstairs. But
we don't need to add a label to it if it's not currently there."*

So the booklet's printing is unchanged. The rules are:

- **Keep every floor label we already hold.** 1,305 active stops carry one, and
  292 of those are the only unit at their address — there the label is the only
  thing telling the driver which of two doors, so dropping it would have been a
  misdelivery risk. This is why the label was not removed.
- **Never invent a label.** An address with no floor label keeps none. The
  importer must not guess "upstairs" or "basement" for a new line.
- **Never collapse two identical addresses.** If the file lists an address twice,
  the delivery list carries it twice. The driver assumes one door each. Two bare
  identical lines are correct output, not a bug to be deduplicated.
- **Apartment numbers always print.** They are not in `floor_side` at all —
  `floor_side` only ever holds `upstairs`, `basement` or nothing. Apartments live
  in the instructions column (35 stops, e.g. `APT 409` in the Cedar Bridge
  buildings) and print regardless. A 40-unit building cannot be inferred the way
  a two-family house can.

### Most "additions" are not new addresses

Measured on zone 1: of the 10 additions the 907 file implies, **nine are
addresses the courier already delivers to** — they simply have no Mishpacha link
yet. Only one (314 CEDAR BRIDGE AVE) is genuinely new and needs inserting into
the route.

That reframes the work. The dominant case is *turn a publication on for a stop we
already have*, which needs no sequencing at all. Route insertion is the rare
case. It also means the importer must match an existing stop before considering
creating one, or it would duplicate nine addresses out of ten.

Two further things the real data forces:

- **Floor/side is part of identity.** `7 SHENANDOAH DR` exists twice — upstairs
  and basement, different families. The file writes the basement one as
  `7 SHENANDOAH DR BSMT`. Matching on house and street alone would pick the wrong
  household, so the unit token has to be parsed and used.
- **The surname disambiguates.** Where a house has several units, the file's name
  column is the only way to tell which one. `12 SHENANDOAH DRV | HOLLANDER` is the
  upstairs Hollander, not the basement Friedman.

### What the real file actually looks like

Nothing like what the importer currently expects:

- **Legacy `.xls`** (BIFF8, Excel 97). `exceljs` cannot read it and the upload
  only accepts `.csv`/`.txt`/`.xlsx`, so today the file is rejected outright.
- **No header row.** Data starts at row 0.
- **Three columns**: last name, first name(s), and the whole address in **one
  cell** — `1 DEBRA WAY`.
- **No action column** and **no publication column**. It is a plain list, so the
  publication has to be chosen by the user at upload time, and additions and
  deletions can only come from comparing.
- **1801 rows covering all of Lakewood.** Only ~169 fall on the 71 streets our
  five routes cover; 1619 addresses across 778 streets do not. Deletions must be
  scoped to what we actually deliver, or the diff would try to cancel nothing and
  add 1600 addresses to routes that do not exist.

### Address variants that break naive matching

Found in the real file, each of which produced a false deletion or a false
addition before being handled:

- `7 SHENANDOAH DR BSMT` — floor/side rides along in the address cell.
- `1024 NETHERWOOD DR # A` — unit marker likewise.
- `12 SHENANDOAH DRV`, `140 LANCEWOOD CRT` — suffix abbreviations absent from
  our table (`DRV`, `CRT`).
- `6 SHENANDOAH` — no street suffix at all.

Handling these moved matched from 101 to 107 out of 167. The remainder is real
divergence, not spelling.

## Items to confirm with Amrom (neither is blocking)

Both only matter once export / the cover sheet exist, and both have a
high-confidence default we are building on rather than waiting.

- **Combination export inclusion logic: ALL vs ANY.** "Any combination"
  (confirmed 2026-08-19) means the export accepts an arbitrary subset
  of publications, but doesn't say whether a stop needs to receive
  *every* selected publication to appear, or just *any one* of them.
  **Building on ANY** — the courier carries the selected publications
  on one run and physically visits any stop needing at least one of
  them, so ALL only makes sense as an analytics question, not a routing
  one. Flag on the first export for confirmation.
- **Addition row format** — no real example yet (only a deletion and a
  complaint appear in the one sample). **Building the symmetric form**
  of the confirmed deletion row: `Name · Address · Add {Publication}`.
  Cheap to change; show Amrom the first rendered booklet and let him
  correct it on a real page rather than describing it in the abstract.

## Raised by browser testing 2026-08-20 — answered and built

Found by exercising the app against the test branch, not by reading the code.
Recorded here because it was a *requirements* question, not a defect with an
obvious fix. Both parts have since been decided and implemented.

### Whole-address removal is per-publication (Ari, 2026-08-20)

The problem, for the record: "Remove this address" set `stops.active = false`,
which pulled the address out of every publication's booklet at once while
logging no `removed` events. Nothing appeared in any Deletions section,
`stop_publications` still claimed the address was subscribed, and a Voice
staffer could therefore end Shopper's delivery to a shared address silently —
reproduced in the browser as `voice@example.test` on 28 SQUANKUM RD.

Ari's decisions:

- **A publication-scoped staffer removes only their own publications.** On a
  shared address the address stays on the route and keeps receiving the other
  paper. Voice has no authority over Shopper's delivery; only the courier office
  retires an address outright. A staffer's removal *can* still retire it, but
  only when theirs was the last publication on it — which is exactly when
  retiring is correct and affects nobody else.
- **Retiring a whole address logs one `removed` event per publication it
  receives**, so each paper gets its own Deletion row in the already-confirmed
  per-publication format (`… · Delete Voice`). No new whole-address row format
  was introduced, since Amrom has not confirmed one.
- **Churn inside one cover-sheet cycle nets out.** An address added and then
  removed before the courier ever saw either event prints nothing at all,
  rather than printing an Addition for somewhere that has already left the
  route. The events stay in the log for history and are still stamped as shown,
  so they do not resurface next week.

Built as one invariant — **an address is active if and only if it still receives
at least one publication.** Deactivation is no longer something a client asks
for directly; it is a consequence of removing the last publication, which is
already permission-checked and already produces the cover-sheet row. A database
trigger refuses to retire an address that still receives something, so the
event log cannot be sidestepped by a forged request. Re-adding a publication
brings a retired address back, so the two tables cannot drift apart.

See `supabase/migrations/20260820160000_whole_address_removal.sql`, and the
`remove_stop_publications` block in `supabase/tests/rls.sh` — including a test
that fails against the old code path.
