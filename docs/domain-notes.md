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
  `route_entries` row, or it is invisible in the default view. **A new stop is
  appended to the end of the route** — `max(sequence) + 1` — and the courier
  office positions it. It is deliberately not slotted in after the last stop on
  the same street: a street can appear in several separate blocks of one route
  (Shenandoah Dr three times in zone 1, Ponderosa Dr four times in zone 2), so
  that guess would often be wrong. See `create_stop_in_route`.

  An earlier version of this note described the after-the-last-stop-on-the-street
  behaviour, which the function has never done. Read the migration, not this
  paragraph, if it matters.

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

### Which streets you may not interpolate on — measured, zone 2 (2026-08-25)

"Reached at N separate points" and "has N blocks of deliveries" are different
numbers, and the second is the one the interpolation rule needs. Zone 2's route
*touches* Pine St at four points, but only two of them have deliveries: seq 47-50
(150, 150, 150-retired, 152) and seq 422-439 (198-270). The other two touches are
direction text only (`EXIT PINE RIVER, TURN RIGHT ON PINE ST`, `GO BACK TO PINE
ST, TURN LEFT ON PINE ST AND LEFT ON MARK DR`). So a new Pine St number outside
150-152 and outside 198-270 has **no safe position** in zone 2.

Zone 2's multi-block delivery streets, measured from the route dump — do not
interpolate on any of these without asking:

| Street | Delivery blocks in zone 2 |
| --- | --- |
| Ponderosa Dr | 4 |
| Spruce St | 3 |
| Pine St | 2 |
| Juniper Ln | 2 |
| Marc Dr | 2 |
| Daniel Dr | 2 |
| Howard Dr | 2 |

Zones 1 and 3-5 have not been measured this way.

### The publication-letters column has a hard width limit (2026-08-25)

`stopPubs` is 20% of the 544pt content width — 108.8pt — at 13.5pt bold with
`letterSpacing: 1`. **Eight letters is the limit, and only without a wide glyph:**
every 8-letter set containing `M`, `W` or `K` overflows onto a second line, and
sets without one fit with under 3pt to spare. Ten of the fifteen stops on the five
real routes that carry 8+ publications overflow today (see `docs/handoff.md`).

Consequence for this record: **confirming one of the five guessed courier letters,
or adding a publication to a stop that already has seven, can push a row over.**
Check the render, not just the data.

## The Voice's real roster — measured 2026-08-26

Ari supplied `Address changes for 08272026.NEW.xlsm`. **Despite the name it is not a
changes file**: it is a full roster of 19,621 rows / 19,568 distinct `customers.id`,
covering all of Lakewood (1,927 streets). Confirmed by Ari as The Voice's list, and
corroborated by a coverage fingerprint rather than taken on trust — of our zone 1+2
addresses, **98% of the Voice ones appear in the file**, against 74% BP, 73% Shopper,
73% Lakewood Courier, 78% Circle, 83% Yated. A broken matcher could not produce a 98%
hit rate on one publication, so the fingerprint doubles as end-to-end validation.

Shape, and how it differs from what the importer expects:

- **`.xlsm`, not `.xls`.** It is the same OOXML container as `.xlsx`, so `exceljs`
  reads it — unlike the legacy BIFF8 files recorded above. Only the file picker's
  `accept` list rejects it.
- Columns: `customers.id | customers.first_name | customers.last_name |
  addresses.addr | addresses.extended_addr | addresses.extended_addr2`. A header row
  is present. **No action column, no publication column, no zone column.**
- The whole address is in one cell (`999 Morris Ave`). 19,608 of 19,621 split cleanly
  on `^(\d+[A-Za-z]?)\s+(.*)$`; the 13 that do not are reversed (`Meadowood Road 429`)
  or glued (`1OMNI CT`), and none is on our streets.
- Scope against our five routes: **1,590 rows land on our 71 streets**; 18,018 fall on
  1,856 streets we do not deliver to.

### `extended_addr2` holds most of the basement labels

The two extension columns are **near-disjoint**, not duplicates: `extended_addr` is
filled on 3,475 rows, `extended_addr2` on 2,198, **both on only 18**, and identical on
exactly **one** (`14 Palm Ct | Basement | Basement`). They split by kind:

| | `extended_addr` | `extended_addr2` |
| --- | --- | --- |
| basement | 953 | **1,537** |
| upstairs | 1,477 | 363 |
| other (unit, copy count, placement) | 1,045 | 298 |

**Reading only `extended_addr` loses roughly 1,500 basement labels**, silently merging
each basement household into the upstairs one at the same door. Floor/side is part of
identity, so any parser must read and union both columns.

### `normalizeFloorSide` gets real values wrong

Tested against all 970 distinct `extended_addr` / `extended_addr2` values in the file.
The shipped regexes are `/base|bsmt|bsmnt|down/` then `/up|second|2nd|top/`, unanchored:

- **Six real basements return no label**: `Basment`, `Lower level`, `bmnst`, `bmsnt`,
  `bmsnt of 105`, `bmsnt, side door`. (`Basment` misses because the alternation has
  `base|bsmt|bsmnt` and none of them is a substring of `basment`.)
- **`upstairs (no one lives in basement)` returns basement** — the note says the
  opposite of what the code concludes.
- **`/up/` has no word boundary**: `plz put on steps WITH the railing, older couple`
  returns upstairs, on the `up` inside *couple*.
- Placement text becomes an invented floor label: `plz put on top of mailbox` →
  upstairs, `down the driveway` → basement, `entrance is on the left side of the house
  by the second driveway` → upstairs.

### How to rule a near-miss street name

The rule that matters is not "strip the suffix". Three tests, in order, each measured
against the file itself rather than guessed:

1. **No street type at all, and exactly one of our streets carries that base** →
   same street. A bare base word cannot be a *different* street. (`PONDEROSA`,
   `GRASSMERE`, `CANARY`, `SHERATON`, `HILTON`, `HEARTHSTONE`, `BRIDGEWOOD`.)
2. **Does the file also use our spelling, and do the two number sets overlap?**
   Disjoint sets are the signature of one street written two ways; overlapping sets
   mean two real streets. `HAZELWOOD CT` = {4, 6, 11, 14, 19} against the file's own
   `HAZELWOOD LN` = {1, 3, 8, 9, 10, 12, 15, 16} — never the same number, and together
   they fill our 1–17. Contrast `CHELSEA RD` (3–65, odds included) where the file
   *also* lists `CHELSEA CT` as exactly our 2–20 evens: two roads.
3. **Are the variant's house numbers inside the range we cover?** `READ PL` is
   1341–1485 against our Read St 241–280; `OAK LN` is 240–317 against Oak St 26–110;
   `ALAN TER` is 4–41 against Alan Ct 120–128. Different parts of town.

Applied to this file, 181 raw candidates resolve to **98 rows on genuinely different
streets, 12 auto-matched, and 49 rows needing a human across 14 decisions.** Only
`VINE ST` has to be split row by row: the file uses that one name both for a road in
the 100s that we do not serve and for 580–736, which is our Vine Ave.

**This is implemented, not just recorded.** `ruleStreetVariants` in
`src/lib/import/match.ts` does it, over the whole upload at once — the evidence is
whether the file *also* uses our spelling and for which numbers, which no single row
can see. `planRow` then auto-applies a variant street only where the ruling says
`same`; `unresolved` becomes a choice for the office and `different` is reported as
out of area. Checked both ways: the 14 tests in `src/lib/import/import.test.ts`
(`npm test`) pin the shapes, and run against the real 19,621-row roster the ruling
reproduces the hand analysis on **24 of 24** street spellings, with **0** rows on a
`different` or `unresolved` street reaching `ready`.

Two things the same pass fixed, both measured against the real file:
`normalizeFloorSide` now reads all 970 distinct floor cells with 0 missed basements
and 0 invented labels (it had six and eight); and reading both extension columns
takes basement labels from 953 to **2,487**.

One consequence worth knowing: the ruling needs the *complete* stop list to be
right. Run against zones 1–2 only, `VINE ST` comes out `different` rather than
`unresolved`, because our Vine Ave then looks like 550–580 instead of 550–736. The
app always passes every stop, so this only bites a partial harness.

### Things about this file that must be settled before anything is applied

- **71 rows at the tail (19552–19622) are not from the subscription system.** Their
  `customers.id` values are `Zone1_1` … `zone2_8` — synthetic, zone-prefixed and
  sequence-numbered — with names like `Family Cohen` on our zone 1 and 2 streets.
  They look like route data pasted into the export. Measured on zones 1+2,
  Voice-scoped, including them moves the result from **93 additions / 61 removals to
  133 / 36**. No number from this file should reach a driver until their provenance
  is known.
- **House-number letter variants are the largest false-deletion generator on this
  file**, ahead of the suffix problem. We store the unit as a suffix (`105A CANARY
  DR`); the file keeps the base number and puts the unit in `extended_addr`. 81 such
  pairs across the five routes, concentrated where the route uses duplex numbering
  (Canary Dr, Eagle Ln, Rena Ln, Gila Pl).
- **Copy counts are double-encoded.** 25 `customers.id` values repeat across 53
  surplus rows *and* carry the count in `extended_addr` (`This address needs 4`,
  ×4 rows). Reading both gives 16 papers where 4 are wanted. Which encoding governs
  is a human decision.

### Whose list wins — partially answered 2026-08-26

Ari: *"The new list that I'm giving you is the actual real one that we want to go
with."* So the publication's file is authoritative where the two disagree.

**Two things are still open**, and both were flagged back to him:

- He described the cover sheet as *additions, corrections and comments* — no
  deletions. But an authoritative file means an address absent from it should stop
  receiving the paper. Whether removals are in scope is unconfirmed, and it is the
  half of the diff with the asymmetric risk.
- **The database is not "last week's Voice list".** There has never been a Voice
  roster in it; our data came from Amrom's hand-maintained route spreadsheets. So
  this run is the one-time reconciliation, not a weekly delta — which is why the
  numbers are in the hundreds rather than the handful of real weekly churn. Next
  week's file against this one is the first true week-over-week diff, and is also
  the control the reconciliation agent could not run this time.

### The weekly roster cycle (Ari, 2026-08-27)

The settled shape of the job, and it answers "whose list wins": **the publication's
new list wins.** Each week The Voice sends its full Lakewood roster; we reconcile it
against the database, apply the result, and the database becomes the list we work
from. Next week's file is compared against *that*, and so on.

Two consequences worth holding on to:

- **The first run is the risky one.** It is a one-time reconciliation between the
  publication's billing view and Amrom's hand-maintained route sheets, which have
  never been reconciled — 16 removals on the 27 Aug file. (An earlier "111
  additions" here is **invalidated**: re-derived 2026-08-30 the figure is 57, and
  111 cannot be reproduced by any run, truncated or whole — it predates the
  out-of-covered-stretch branch and other matcher changes, so it measured
  something today's code no longer computes. The 16 removals do reproduce.) Every
  run after it is a week of real churn, which `docs/handoff.md` records as a
  handful of addresses.
- **From week two the file-to-file control comes for free.** The reconciliation
  agent's strongest check — diff two consecutive issues, because real churn is tiny
  and a large diff means divergence or a matching fault — was impossible with one
  file. Once the database mirrors last week's roster, every weekly run *is* that
  diff. `removalsLookWrong` is the guard that acts on it; its threshold (5% of the
  publication's addresses, floor of 25) is set for the first run and should be
  tightened once a few normal weeks have been seen.

Removals are derived, never stated: a roster cannot say "cancel this one", only
stop listing it. `planRosterRemovals` does that derivation, and its three rules —
covered streets only, loose presence test, address level never unit level — are
what stop a matching weakness turning into cancelled subscribers.

### Zone membership is decided by street (Ari, 2026-08-27)

The publication's list covers all of Lakewood — about 30 zones. We hold five. The
`zones` table has no boundary or street list, only `id`, `number`, `name`: the sole
thing that defines a zone is the stops currently in it. So "is this address in one
of our zones?" is answered as **"is it on one of the 71 streets we already have a
subscriber on?"**

Ari chose this knowingly. **The blind spot, recorded so nobody rediscovers it as a
bug:** the first-ever subscriber on a street that lies inside one of our five zones
but that we have never delivered to is classified as out of area and dropped. We
cannot currently tell those streets from streets across town. Closing it needs a
street-list-per-zone from Amrom covering streets with no current subscriber.

### Removal suppression is deliberately looser than matching

`listedUnderAnySpelling` decides whether one of our addresses appears in an upload
under *any* spelling, and is used only to hold a removal back — never to create a
match. The asymmetry is the whole point, and the thresholds were set by what the
real file actually contains:

- Street compared on its base word with the type stripped, so `CANARY ST` stands in
  for our `CANARY DR`.
- One edit always; two edits only on a base of eight characters or more. `HAZLEWOOD`
  for `HAZELWOOD` and `SHENENDOAH` for `SHENANDOAH` are the same street. `CAREY ST`
  for `CAROL ST` is not — two edits on five letters, and flat "within two edits"
  hid a real removal behind it.
- The unit letter in either direction: we hold `105A`, the upload writes `105`.

Measured on the 27 Aug Voice roster, this took candidate removals from 65 raw to
**16**. Re-derived 2026-08-30 against the whole 2,427-address list, both numbers
reproduce exactly, so this measurement was NOT one of the ones the 1,000-row
truncation invalidated — it was taken from a standalone dump, not through the
app's PostgREST path. (Under truncation it would have read 34 raw to 4.)

Two clarifications the original wording needed:

- **"Raw" means candidates matched on exact street AND exact house number** —
  1,102 Voice addresses, of which 65 have no exactly-matching file row. Without
  that definition the claim is not reproducible; only this one reading gives 65.
- **49 rows are suppressed, and the check on them is address-level, not
  household-level.** All 49 do have a file row at the same house number — 20 via
  a street-spelling variant (`10 Shenendoah Dr`, `4 Hazelwood Court`,
  `580 VINE ST`, `139 CLEARMONT CT`), 29 via the unit letter alone (`105A CANARY
  DR` against the file's `105`, and nineteen Rena Ln basements). But **26 of the
  49 carry a different surname** — our `26A EAGLE LN GOLDNER` against the file's
  `26 Eagle Ln Daniel h Miara`, our `55A CANARY DR Pruzansky` against
  `55 CANARY DR Family Rubin`. Under Ari's address-only rule suppressing them is
  correct behaviour, but "every one was checked to be a real household" was never
  established for those 26. What was verified is that the address appears.

Confirmed still working: `207 CAROL ST` is not suppressed by `207 CAREY ST` —
five-character base, two edits, below the eight-character threshold.

### Terminology (Ari, 2026-08-31)

- **The master list** is the spreadsheet The Voice sends, uploaded weekly and
  compared against what we hold.
- **The zones** are what is in the system — the five routes and their addresses.

Use these two words. Earlier notes say "roster" and "the file" for the master
list; they mean the same thing.

### Answers the office has given are recorded, not re-asked (Ari, 2026-08-31)

*"It does make sense to build something to record decisions about specific
addresses so that we don't have to answer the same questions every week."*

`address_rulings` holds them. A ruling is about an ADDRESS or a STREET, never
about a subscriber: subscribers come and go, but "106 Vine Avenue is outside the
stretch we walk" does not. `not_ours` stops the address being proposed; `ours`
confirms it is on the route, which silences the out-of-stretch, wrong-side and
between-blocks questions for it.

Measured on the 27 Aug master list: 55 of the 179 questions are "this house
number is outside the stretch of that street our routes cover", and answering
them once takes the weekly total to **124**.

**A ruling is always one address; a street-wide answer is not expressible.** It
sounded useful and was a trap. The master list spells our Vine Ave as `VINE ST`,
so the guard meant to protect a street we deliver on — "does `byStreet` hold this
street?" — missed on the file's own spelling, and a street-level "not ours" sent
five real Vine Ave rows to blocked. The same guard silently discarded every
street-level "ours". Both defects came from defending a scope nothing created, so
`house_number` is now `not null` and the scope is gone.

**Both answers are offered, not just "no".** A single "Not ours" button made a
mis-click a permanent, invisible refusal — and it appeared on `314 CEDAR BRIDGE
AVE`, which this file records as a real addition. There is now an "It is ours"
answer beside it, a list of everything answered, and a remove link on each.

**Only on the out-of-stretch questions.** The wrong-side-of-the-street and
between-blocks questions are the open routing item in `docs/handoff.md`; they need
Amrom and `lakewood-courier-routing`, and an open question must not be closeable
by one click. 55 rows rather than 69.

**Added 2026-09-01: the no-name near-miss street question carries "Not ours"
too.** "`CAREY ST` is not one of our streets, and `122 CAROL ST` has no name to
compare — is this the same street written differently?" is also a fact about
geography, and with no name on our side the data can never settle it, so without
a button it re-asks forever. Ari answered that exact pair from a map (Carey St
runs between 11th and 12th off Clifton; Carol St is off Spruce by Marc Dr): two
different streets. Only "Not ours" is offered on this question type — "it is
ours" there means "attach to the address in the dropdown", a choice about this
week's row, not a recordable fact, and an `ours` ruling would not stop the
question recurring. The surname-match variant ("…and the name matches") gets no
button: all four measured cases were real one-letter slips, and the right answer
is picking the address. 9 such rows on the 27 Aug file; `122 CAREY ST · not
ours · The Voice` is recorded in production, taking the questions to 187.

Rulings are stored normalised, so one recorded against "Bruce St" also answers
"BRUCE STREET" next week. A publication-specific ruling beats one that applies to
every publication, and an address-level one beats a street-level one.

### The standing-questions portal (Ari, 2026-09-01)

Ari: *"I have to resolve a lot of these questions. Some of the questions are
going to be for Amrom, and some for the Voice office. Any questions about the
master list are probably for the Voice office because they're the ones that
maintain that list. Any questions about the routes are going to be questions
for the Lakewood Courier, which is Amrom... A lot of these questions should be
answered separately, not during the import process... the answers get recorded
so that the questions don't come up again... I need a platform or a portal or a
format for them to answer these questions."* Process he set: the advisor agent
planned it, an adversarial agent reviewed the plan, then it was built. The
review's four blocking findings (a lifecycle rule that defeated the durability
requirement, a matcher-integration placement defect, a live `address_rulings`
UPDATE-policy bug, and three RLS holes) were all taken before building.

**Platform: the in-app `/questions` page is the system of record; a printable
list at `/questions/amrom` is the artifact for Amrom.** Spreadsheet answer
INGEST is deliberately not built (export/print yes): a parsed answer sheet is a
new failure surface between a person's intent and a standing fact, dropdowns do
not survive paste, and answers returned days later are answers to stale
questions — the `linesAtPlanTime` staleness lesson would have to be rebuilt as
a second importer. The Voice office answers on the page with publication-scoped
accounts (Manage Users issues them — **inviting the actual answering staff is a
prerequisite step for the first packet**).

**An answer is a recorded fact, never an applied write.** Writes still happen
only through the import apply, the existing edit paths, and the courier-office
ruling buttons. The Voice office's answers inform; the courier office acts.

**Lifecycle** (`import_questions`, keyed `kind|street|house` per address —
several file rows at one address are ONE question):

- Plan-time upsert (roster uploads only). Re-uploading the same file leaves an
  answered question **answered** — the volatile facts (counts, ranges, doors,
  candidates) live in a fingerprint, and only a changed fingerprint reopens a
  question, with the old answer kept attached. (A code-side rewording of a
  prompt also moves the fingerprint and reopens; accepted, the answer stays
  visible.)
- Supersede only on a CLEAN apply, scoped to the applied publication, keyed on
  the full plan's question set (not the trimmed browser rows). A junk upload
  can create stray questions but can never retire real ones; strays are
  courier-office-deletable and die at the next real apply. A superseded
  question that re-arises — including after `undo_import_run` — reopens.
- Nothing here auto-applies, ever.

**Audiences** (Ari's split): master-list kinds → `voice_office` (out-of-stretch,
near-miss streets, street identity, unit letters, duplicates, counts, door
conflicts, new households, unreadable cells); route kinds → `amrom` (wrong-side
parity, block gaps, route position, spans-zones) — **deliberately button-less
on the import screen**, per the 2026-08-31 decision that an open routing
question must not be closeable by one click; pick-an-address kinds →
`courier_office`. "Pass to the Lakewood Courier" is an ANSWER choice that
retags a question to `amrom` and leaves it open — scoped staff cannot write the
audience column at all, so questions cannot be retagged out of sight.

**The evidence rule** (pinned by a unit test): a question's stored evidence
carries the master list's own rows verbatim (the publication's own data), and
of OUR lines only house/street/floor for lines carrying THAT publication — no
recipient names ever, no other publications' letters, no special_instructions,
and a line for another publication appears only as a count. RLS hides such
stops from a scoped user; this table must not become a way around it.

**"We will fix it in our own database" is always offered, and it follows up
on itself (Ari, 2026-09-01).** *"It may be better for them to correct it in the
database so that it exports better next time rather than just teaching the
system to ignore it."* Every question the publication's office can answer
carries the choice — and unlike every other answer, a `will_fix_at_source`
answer REOPENS whenever the same question arises again, whatever the
fingerprint says: arising again means the export still shows the problem and
the promise did not land. The reopened card says so. Fixing the source is the
preferred outcome — the question then never re-arises and the next clean apply
retires it.

**Scoped staff write through `answer_import_question()` only** — SECURITY
DEFINER, checks publication access, open status, and voice_office audience
itself; they hold no direct INSERT/UPDATE/DELETE on the table. Courier office
has full table access. ~13 rls.sh tests pin all of it.

**Deliberately deferred, from the review's cut order:** the
`address_rulings.resolved_street` / `resolved_house_number` rewrite that would
retire the VINE ST (×9) and 132-vs-132A (×7) questions permanently. The review
proved the planned placement was wrong (the rewrite must happen at
rowKeys/group level, where `ruleStreetVariants` rewrites, or settleAddress
counts against the wrong group) and that it can newly enable removals via
`covered()` — it needs its own measured before/after pass. Until then those
answers are recorded and shown inline at import, and the questions recur.

**Two questions for the first packet to the Voice office, put by Ari directly
(they are about the file, not an address):** whether the copy-count is
double-encoded in their export (the id-repeats vs `extended_addr` "5 COPIES"
question), and what the 71 synthetic tail rows (`Zone1_1`…`zone2_8`) are.

### One address, one count: surplus courier lines are removals (2026-09-01)

Breindy Herman (Voice office), relayed by Ari: *"A lot of the questions are
that the courier delivers a few to one address, but it's only on the master
list once. It should look at the master list and only go according to the
addresses that are on it — if it's on the master list once, the address should
only receive one."* Ari: *"If it's showing up once on the master list from the
Voice, why wouldn't you count it as a removal from the courier list?"*

This was the last direction the count rule did not yet run in. Built:

- After an address settles, any of our lines carrying the publication that the
  master list's rows did not claim is proposed for removal — one review row per
  line, exactly like a whole-address removal. Nothing applies without a person.
- **Held back while the address has any open question** (a door conflict, a
  street question): removing under an open question would preempt the person.
- **At an address with more than two lines the office picks which line stops**
  ("never written to blind" stands — apartment detail is invisible to the
  importer), via a candidates dropdown on the review screen.
- `roster_managed = false` lines keep their exemption from absence-based
  removal.
- **Its own tripwire** (`surplusLookWrong`, floor 60 / 10% of the publication's
  addresses): a file cut off mid-address inflates surpluses where a truncated
  file inflates whole-address removals, so the two guards watch different
  failure signatures. The whole-address guard actually tripped on the first
  measurement (16 + 50 = 66 > 55) before the split — the first count-sync is
  legitimately large because the zones were seeded from the courier's sheets,
  not the publication's counts.

Measured on the 27 Aug file: **54 surplus lines at 50 addresses** (37 ready,
17 pick-a-line at crowded addresses), whole-address removals unchanged at 21
lines / 16 addresses, questions unchanged at 121. And the counter-example that
proves the rule runs both ways: `18 BRIDGEWOOD AVE` — Breindy's own screenshot
— is NOT removed, because the master list names Freund there twice, so both
lines stand.

### Three route answers, and the boundaries write-up (Ari, 2026-09-03)

Shown the courier route-questions document: *"314 Cedarbridge is in a
different zone. 545 Howard is on the route. Some of the vine ones are on a
different route."* Recorded: **314 Cedar Bridge Ave** `not_ours` (per-address
— liftable if it turns out to be one of our five zones); **545 Howard Dr**
`ours` (its four retired stop rows at zone 2 seq 613–616 plus the two
corrupted direction rows at 617–618 fix its position; a human still has to
read `BP ZONE 2.xlsm` to recover the households); the five **Vine St**
identity questions stay open until Amrom marks WHICH are ours — note the
boundary evidence that all five numbers (580, 648, 696, 728, 736) land
exactly on doors we deliver, 580 in zone 2's Vine Ave 550–580 and the rest in
zone 3's 624–736 blocks, so "a different route" may mean route 3 vs route 2.

Same day, at Ari's request ("write up the boundaries and use that to help you
determine in the future if an address is within the route or not"):
**`docs/route-boundaries.md`** — the written boundary of each route, derived
from md5-proven dumps of all five routes, audited line-by-line by the routing
agent against the raw dumps. Confirmed barriers and inferred edges are kept
strictly separate there; an inferred edge becomes a ruling only when a person
confirms it.

### Henry St beyond 28–111 is across Route 9 (Ari, 2026-09-02)

*"The Henry St addresses you are listing are on the other side of Route 9, so
they are on a different route."* — shown the courier document with 1–16 and
200–235 Henry St as same-street placements. All 14 carry `not_ours` rulings
now; we deliver only 28–111.

This is the second recorded exception to "same street, same route" (Pine St's
odd side, zone 35, was the first), and it teaches the measurement's blind
spot: **straight-line distance cannot see a highway.** 1 Henry St measured
51 m from a house we deliver — and is across Route 9 from it. The rule's
containment worked as designed: a conversion is a placement NOTE for a person
who knows the ground, never a delivery, and a person caught it before anything
was applied. But a barrier as hard as Route 9 is a fact worth encoding, not
re-catching, and Ari asked for exactly that: *"record the Henry St
differentiation so that the system should know for future uploads."*

So rulings gained their one street-wide form (migration `20260902231500`):
`house_number` NULL = the whole street, allowed only with `not_ours`, and the
matcher refuses to apply it to any address we deliver — directly or through a
spelling variant — which is what keeps the recorded Vine Ave trap closed (a
street-wide "not ours" against the file's VINE ST spelling must never blank
the Vine Ave doors we serve; there is a test). A per-address ruling still
beats the street-wide one, so a single exception can be carved back out with
one "It is ours" answer. Henry St carries the street-wide row now: any future
number outside 28–111 is blocked with the Route 9 note, no question asked.

### The map answers same-street distance in both directions (Ari, 2026-09-01)

*"The Marc Drive questions you should be able to answer using the map as well.
You should be able to answer the Oak St questions as well using the map. Make
this a general rule and I shouldn't have to tell you every time."*

The general rule, as first stated, had three bands on the measured
same-street gap; **the middle band was retired the same day** when Ari was
shown Henry St's 200s (435–489 m) standing as annotated questions: *"Same
street same route, move the Henry St line."* Two bands remain:

- **Under 800 m**: ours — a placement note for the Lakewood Courier, with the
  distance shown. Within 150 m it reads "the driver passes it"; further it
  reads "same street, same route", so the office can still see which kind of
  claim the map is making.
- **≥ 800 m**: a different part of town — the row answers itself as "not on
  our routes" (Oak St's 1400s measured 893–1,363 m from our 26–110). Wrong
  here is a missed addition, noticed and fixable.
- **Unmeasured decides nothing**: an address the geocoder cannot place stays
  a question (Marc Dr, whose addresses Census does not know at all).

A number bracketed by two blocks we deliver (the 611 River Ave shape) never
self-answers as far — "different part of town" cannot be right between our own
blocks — so measured-far gaps stay questions.

Marc Dr had NO measurements because the geocoder did not know its reference
houses (504/604) and one dead reference killed the street — each question now
carries three reference candidates (nearest end, a mid-street backup, the far
end).

### The A rule runs both ways (Ari, 2026-09-01)

Shown `109 Rena Ln` asking "same door or a second unit?" while we hold `109A
RENA LN (basement)`: *"I already gave you the rule about the A. Why are you
asking again?"* The file's bare `109 · Basement` IS our `109A`. The rewrite now
runs in both directions — file-lettered against our bare number, and file-bare
against our lettered A — and a stated floor blocks it only when it
CONTRADICTS the A (a row saying "basement" agrees with what the A means; only
"upstairs" is a blocking order). Exact matches still always win.

### A house takes two; the rest of the list's rows are skipped (Ari, 2026-09-01)

*"If a house only has two apartments and we list three or more, only take two.
Unless it's an apartment building."*

This supersedes the 2026-08-30 "should be flagged" ruling that made these
questions (the `count_vs_capacity` kind, 14 on the portal, is retired). At an
address holding two or fewer lines, the list's rows settle in the canonical
order (stated doors first) until **two papers are settled by this plan**
(paired rows plus creates — review-proven: counting the house's physical lines
instead let a two-row list end at ONE paper while an unrelated line was being
cut); every row beyond that is shown on the review screen as skipped — *"two
papers go; this row is beyond the house (if this is an apartment building,
tell us and we will add its units)"* — and skip rows always ship to the
screen, since they are the only carrier of the apartment-building escape
hatch. Never asked about, never applied. An address already holding three or
more lines IS an apartment building and is exempt; its doorless creates still
go to a person under the crowded rule.

### A regular street is walked on both sides (Ari, 2026-09-01)

*"The map should usually be able to decide a crossing. If it's a regular
street, there's no reason why the driver wouldn't go to both sides of the
street. Specifically Pine Street is a very busy road, and there's developments
on both sides of the road, so it makes sense to break it up and have somebody
else do the different developments. But I think this is an exception rather
than the rule."*

This retires the crossing QUESTION entirely (`wrong_side_parity` is no longer
emitted). A wrong-parity address — in range, or out of range but map-measured
near — is a `route_position` placement note on Amrom's list like any other
addition, **flagged with which side it is on** ("note: the odd side — we
currently deliver only the other"), because the exceptions are split roads and
Amrom is the one who spots the next Pine from that flag. Exceptions are
RECORDED, not asked: Pine St's odd side carries `not_ours` rulings (zone 35,
section above) which outrank everything, and any future split road is handled
the same way — Amrom says the side belongs elsewhere, the office records the
rulings.

### The odd side of Pine St is zone 35 (Ari, 2026-09-01)

*"The odd numbers on Pine St are on zone 35 — not any of the zones we are
currently working with."* This settles the largest block of route questions:
the odd-side additions (143, 147, 151, 175, 185, 189, 189A, 201, 221, 225,
233) are recorded as `not_ours` address rulings (publication-wide — it is a
fact about geography), note naming zone 35. Zone 2's Pine St remains the even
150–270 side only.

A NEW odd Pine St number in a future file will still raise the crossing
question once — rulings are per-address by design — and the answer is the
same: zone 35. Worth remembering when zone 35 is ever onboarded: these
addresses are its, and the rulings should be lifted then.

### The master list's city column decides the town (Ari, 2026-09-02)

*"You have city and state. Some of the mistakes or some of the non-matches
were because there are the same street names but in different cities."* — with
the 31 Aug cleanup export, whose new `addresses.city` column places 16,123
rows in Lakewood and 3,550 in Jackson, Toms River, Howell, Manchester and
their township spellings.

The rule, shaped by the asymmetry (a wrong addition wastes a paper; a wrong
deletion silently loses a subscriber):

- **A row the file places in another town is not a candidate for any of our
  streets.** It is blocked as `in <city> — not on our routes`, and it feeds
  none of the file-level evidence: not the trailing-A rewrite, not the
  street-variant ruling, not the address groups that count papers and surplus,
  not the unreadable holds. A Jackson `68A` is not our `68`'s basement, and
  Jackson house numbers do not vouch for a street spelling.
- **Except when the address is one we deliver — reached exactly OR through a
  street-variant ruling.** Then the city and the street match disagree, and
  neither is trusted silently: the row becomes a `city_conflict` question
  (voice_office) with the matching lines as candidates. The 31 Aug file
  raises twelve: `5 JUNIPER LN` (Jackson, exact — Czermak, while Amsel's
  Lakewood row claims the line), 4/6/14 `HAZELWOOD CT` (Howell — the recorded
  2026-08-31 "same street as our HAZELWOOD LN" ruling, which the city data
  now contradicts; two authorities disagreeing is a question, never a silent
  pick), and 7 `LONDON DR` (Jackson — silenced by `not_ours` rulings
  transferred from Ari's own different-road answers on the portal). The
  variant path exists because the adversarial review proved the exact-only
  gate left a deletion path: a variant-spelled out-of-town row silently
  leaving its address group could turn a held surplus into a ready cut.
- **Coverage for removals reads every row regardless of city.** A city
  mistake in the export can therefore suppress a removal (forgiving,
  noticed eventually) but can never create one (the unforgivable direction).
  The open question also holds the address's own surplus cuts. Two accepted
  consequences, so nobody expects otherwise: a `not_ours` answer on a
  city-conflict row changes the question, never the delivery — the foreign
  row keeps vouching for the address, so the paper keeps going until that row
  leaves the file; and an `ours`-ruled out-of-town row protects its address's
  lines (its group is restored) but the row itself still shows blocked by the
  near-miss rule when its spelling has no Lakewood sibling — a display nit,
  deletion-safe, worth fixing when touched next.
- **Fail open.** No city column, or a blank cell, decides nothing — every
  earlier file behaves exactly as before. "Lakewood", any casing, "Lakewood
  Township" and "Lakewood Twp" all count as Lakewood.

Same file, same day: all 11 previously unreadable address cells were fixed at
the source, and the Vine St 100s now arrive as **Vine Ave** — so the one-name-
two-roads question for them dissolves into a measurable out-of-stretch check.

### The map measures whether the driver passes an address (Ari, 2026-09-01)

Ari, shown 1–16 Henry St queued as out-of-stretch questions while we deliver
28–111 on the same short block (with a map screenshot): *"it's worth it for you
to have access to a map so that you can see the actual route that the delivery
guy travels. You can see if the address in question is being passed by the
delivery guy."*

This is the narrow map use that IS sound, distinct from the two that are not:
the map still never decides walking order (the sequence is Amrom's), and never
decides wrong-side-parity (whether the driver crosses is a walking-pattern
fact). What it decides is geometry on the SAME street: how far a questioned
house number sits from the nearest house we already deliver.

Built as `src/lib/import/street-distance.ts`: at plan time the out-of-stretch
and between-blocks questions are geocoded (US Census, coordinates this time)
against the covered ends of their street, and:

- **Within 150 m** (a handful of Lakewood lots): the driver passes it. "Is it
  ours?" dissolves — the row becomes a `route_position` placement note on
  Amrom's list, with the measurement on it ("16 HENRY ST is about 78 m from
  28, the nearest we deliver — the driver passes it; place it in the route").
- **Further**: the question stands, annotated with the measured distance so
  whoever answers sees the geography at a glance.
- **Unmeasurable** (service down, geocoder spell-corrected, address unknown to
  the map): decides nothing; the question stands unannotated. Same fail-soft
  and spell-correction discipline as the retired street-existence check, plus
  a circuit breaker so a dead service is paid for once, not per lookup.

The dev sandbox cannot reach the geocoder, so the measured path is pinned by
unit tests and first runs live on the deployed app.

### Other publications' lines are invisible to a reconciliation, and the master list wins the door (Ari, 2026-09-01)

Two more rulings from Ari's pass over the live portal, both "why is this still
a question":

**16 / 8 Chelsea Ct** — *"we have one on file and that should be the one that's
kept; everything else should be taken away. The question list says that there
is also one for other publications — that should not be taken into
consideration when we're discussing The Voice list."* The crowded-address
guard counted every line at the address, so a Shopper/BP line made a two-line
Voice reconciliation look like a three-line blind write. Now the crowd is
counted **per publication**, and only a genuinely BLIND write (no door, no
surname directing it) at an address with more than two of THIS publication's
lines asks. The surplus pick-a-line choice likewise: only when the
publication's own lines exceed two AND the surplus lines differ from each
other — identical duplicate lines are interchangeable and cut ready.

**33 Cushman St** — *"an example of a conflict between the master list and the
courier's list. You should always be following the master list. Why is it
still on the question list?"* The "has this household moved?" question is
retired, in both its shapes. The master list wins the door: the row attaches
(or creates) at the door the list names, and the line it leaves behind becomes
a visible surplus-cut row — **the move is an add row plus a cut row on the
review screen**, applied by a person, never a question. Where the add is a
CREATE that still needs route placement, the cut is automatically held back by
the open-question rule until the office places it, so a paper never stops
before its replacement door exists. This supersedes the "Where counting and
the door disagree, nothing is written" clause of the 2026-08-31 door ruling —
the door remains an order; what changed is that the master list's order is now
followed rather than asked about.

### Which line takes the cut (Ari, 2026-09-01)

*"If you have to choose which one to delete from the courier's list, always
prioritize one that is upstairs or that has more information, unless there's a
reason to do otherwise."* Asked which way the sentence points — delete that
line, or keep it — Ari: *"I meant the opposite"* of deleting it. **The upstairs
or better-described line is KEPT; the bare line takes the cut.** (Recorded with
the exchange because the first implementation read it the other way for about
an hour, never merged.)

Implemented as `keepPriority`: when a surplus cut must choose between lines
that nothing stronger distinguishes, the upstairs line survives before other
labels, and a line carrying more detail (a floor label, a name) survives before
a bare one. The "reasons to do otherwise" outrank it exactly where they already
exist: a stated door pairs first (the door rule), and a surname match keeps the
named household's line whatever its detail. The pick-a-line dropdown at crowded
addresses lists candidates cut-first — barest on top.

### Follow the master list: five rulings from Ari's first pass over the portal (2026-09-01)

Ari worked the live questions list the day it shipped and issued five rulings,
all one principle — the master list is followed, not second-guessed:

1. **A repeated household is two papers.** Shown "one paper or two?" on
   `18 BRIDGEWOOD AVE`: *"you shouldn't be asking the question because we always
   follow the master list. Take off all questions that are similar to this."*
   The SAME_ID/SAME_NAME duplicate machinery is removed; repeated rows count
   like any rows. The copy-count encoding suspicion stays a question about the
   FILE in the first packet, not a per-address question. (This supersedes the
   "deliberately no standing one-paper ruling" caution — a wrong extra paper is
   the safe side of the asymmetry.)
2. **A street with no name evidence is its own street — never a question.**
   Shown `265 BRUCE ST` asking "is this the same street written differently?":
   *"I already told you that Bruce St is its own street, why are you asking
   again?"* The no-name near-miss question is retired; without a surname match
   the row reads "not on any of our routes". The surname-match question
   (Windemere/Windermere) stays. The residual risk — a typo of our street
   missed as an addition — is the noticed-and-fixable direction.
3. **A second household named by the list is real.** Shown "is it a real second
   household?" on `103 CANARY DR`: *"What's the question on this one? Again,
   you should be following the master list."* The `new_household` kind is no
   longer a portal question; the row stays on the import screen only, where the
   courier office places it in the route.
4. **A trailing A on a house number is the basement.** *"If you see an A after
   a house number, then you can assume you can match it to a basement because
   many times an A is listed when it means a basement."* Applied at group level
   in `planRoster` (the split-group placement the review mandated): only the
   letter A, only where we hold the bare number and no lettered address of our
   own (`105A CANARY DR` and `12A GILA PL` stay exact matches), and never over
   a floor the row states itself — a stated door remains an order. Where the
   basement does not already take the paper, the door rule still asks its move
   question as ever.
5. **An apartment written before the address is read past.** *"Many times we
   put the apartment number before the address to make it easier for the staff
   to find addresses."* `apt a / 93 Harvard Street` and
   `unit 7202 / 100 Whisper Village Way` now parse; the unit rides along as an
   instruction and is never invented into a floor.

Measured on the 27 Aug file, removals byte-identical (21 lines at 16
addresses); questions 179 → 121; ready 62 → 65; unreadable 13 → 11.

**Ruling 2 also retires the map check** built earlier the same day: it existed
to answer the no-name street question case by case, and the ruling answers it
categorically, so `street-check.ts` and the plan action's second pass are
removed (git `bf28608`…`0ca7dc7` has them if the default is ever softened).

### The map settles the no-name street question when it can (Ari, 2026-09-01)

**Superseded the same day** — see ruling 2 above: the question the map answered
case by case is now answered categorically, and the lookup is removed.

Ari: *"If I give you access to a map, wouldn't that help with these kinds of
questions?"* — following his 2026-08-31 directive: *"whenever you're not sure
whether it's a legitimate street or not, you can check it in Google maps."* He
settled BRUCE ST and CAREY ST by hand exactly this way.

Built as `src/lib/import/street-check.ts`: at plan time the importer asks the
**US Census geocoder** (free, no key) about the no-name near-miss rows only —
never the whole file, capped at 24 lookups — and re-plans with the answers. The
asymmetry is deliberate and must not be loosened:

- **Confirmed** (the geocoder matched this house on this street, spelled the
  same, in Lakewood) → the street is real, so per "a street in the file is that
  street" the row reads *"…is a real Lakewood street, confirmed on the map — not
  on any of our routes"*. A wrong block here is a missed addition — noticed and
  fixable — never a silent deletion.
- **Not found** decides nothing: new construction is missing from map data all
  the time, so the question stands.
- **Unavailable** decides nothing: the upload behaves exactly as without the
  check. Verified on the real screen with the geocoder unreachable — identical
  numbers, 10-second plan, all questions intact.
- The geocoder **spell-corrects**, so a match is accepted only when the returned
  street IS the queried street — Census returning our CAROL ST for the file's
  CAREY ST is evidence *for* the typo theory, not confirmation.
- **Name evidence outranks the map**: a surname match with one of our stops
  keeps the question even on a confirmed-real street. A recorded ruling outranks
  both.

**What no map answers** (and this check does not touch): which zone serves a
street, which side or blocks the courier walks, where in the walking order a new
address goes. Those are Amrom's, and the route sequence is deliberately not
geographic.

**Caveat, stated plainly:** the development sandbox cannot reach the geocoder
(egress policy), so the confirmed path is proven by unit tests and the real
screen only exercised fail-soft. The first production upload is the first live
run; if Census is ever unreachable from Vercel the behaviour is today's.

### River Ave is a commercial road (Ari, 2026-08-31)

*"River Avenue is a commercial road, so it makes sense that you don't have many
addresses there."*

So the master list carrying one River Ave row out of 19,621 is **expected**, not a
coverage failure — an earlier note in this file called it one and was wrong. Of
our 7 River Ave addresses, 6 are businesses (Leisure Chateau, Silvino's Auto,
Lipa's Auto Service, Ocean Dental, Styled Child, Wig Authorities, Princeton
Dineros) and one is residential (`809 River Ave · Preschel`).

This sat against the 2026-08-30 ruling that commercial drops are cancelled like
anyone else, because `covered()` required the master list to name at least one
address *we hold* on the street before absences on it counted — and on River Ave
it names only `611`, which is not ours. **Closed (Ari, 2026-09-01):** *"if it's
commercial and it's being removed, why shouldn't it be listed as being
removed?"* — the unlisted River Ave addresses are removals like any other.
`covered()` now asks only whether the file names the street at all (strict
spelling, same as before); the "names an address we hold" clause is gone, since
a commercial road's rows will rarely be ours and the clause held back exactly
the removals Ari wants. A street the file never names at all — exactly, or as a
bare base word that could only be that street (the suffix rule's uniqueness test
now applies here too, so a bare `PINE` covers nothing while we deliver both Pine
St and Pine Blvd) — is still protected: a wholly absent street is the signature
of a file that did not include that part of town. No street we deliver is
currently in that state. Measured on the 27 Aug file this adds 12 removal lines at the 7
River Ave addresses (21 lines at 16 addresses in all), and changes nothing else.
Note one of the 12 is residential — `809 River Ave · Preschel` — and it is a
correct removal under the rule: the address is not in the file.

### A street in the file is that street, unless something says otherwise (Ari, 2026-08-31)

Ari, on being shown questions offering `SPRUCE ST` for the file's `BRUCE ST` and
`CAROL ST` for `CAREY ST`: *"There is a Bruce St and Carol St in Lakewood. Why
should we assume that's not what it is?"*

The default was backwards. The near-miss branch offered a match on nothing but an
edit distance of two plus a house number we already hold — and the house-number
match is **guaranteed by construction**, because the branch only ever looks at
numbers we hold. So a real Lakewood street we do not deliver looked exactly like a
misspelling of one we do.

**Positive evidence now means the same surname at the same house number.**
Measured on the 27 Aug roster, exactly four rows have it, each a single-letter
slip:

| the file says | we deliver | name |
| --- | --- | --- |
| `31 Windemere St · Fink` | `31 WINDERMERE ST` | FINK |
| `5 Hazlewood Ln · Ashkenazi` | `5 HAZELWOOD LN` | ASHKENAZI |
| `139 CLEARMONT CT · Lichtman` | `139 CLAIRMONT CT` | Lichtman |
| `10 Shenendoah Dr · Ollech` | `10 SHENANDOAH DR` | Ollech |

Everything else had none: `BRUCE ST`, `BARON CT`, `CHERRY ST`, `CAREY ST`,
`MENDON DR`, `WALTER DR`, `DINA PL`, `JULE CT`. All are real Lakewood streets we
do not cover, and all now read as "not on any of our routes" rather than as a
question. That took the questions from 222 to 179 and moved 43 rows into the
bucket they belonged in.

**Carey St confirmed real (Ari, 2026-09-01, with a Google Maps screenshot):** it
runs between 11th St and 12th St near Clifton and Lexington Aves. The file
carries 70+ Carey St rows; we deliver nowhere on it. The one address it shares
with our Carol St coverage, 207, is two different households — the file has
`207 CAREY ST · Rottenberg`, we hold `207 CAROL ST · Schonbrun` — so the
`207 Carol St` removal is genuine churn and stands. One question remains by
design: `122 CAREY ST · Family Schwartz` against our unnamed `122 CAROL ST`,
where there is no name on our side to compare.

**One trap this closes.** `BRUCE ST` had a delayed failure: answer "yes, add it"
and the address joins the route, but next week the file still spells it `BRUCE
ST`, so `listedUnderAnySpelling` fails (`bruce`/`spruce` is two edits on a
five-letter base, below the eight-character threshold) and the run proposes
deleting exactly what was just added.

**Not to be confused with `ruleStreetVariants`**, which handles a *suffix*
variant — `HAZELWOOD CT` for our `HAZELWOOD LN`, `PONDEROSA` for `PONDEROSA DR` —
and does apply overlap and range tests. That path is evidence-based already. This
one is the base word differing, where the only real evidence is the household.

### The printed door is an instruction, not a hint (Ari, 2026-08-31)

Asked whether the floor label the booklet prints tells the driver which door or
whether he works it out at the house, Ari: *"if the listed address has a specific
door that it should go to, then the driver follows that. If there are no specific
instructions, then the driver will decide where to throw it."*

This resolves an apparent conflict between two earlier records. "Match by address
only, and count" says counting's answer to an ambiguous unit is "one line, driver
picks the door", which reads as though the label does not matter. It does — but
only when it is *there*. An **unlabelled** line carries no instruction, so the
driver decides and either line is correct. A **labelled** line is an order.

Three consequences, all now in `settleAddress`:

- **A roster row naming a door is paired with the line carrying that door**
  before anything is counted. Not as a guess about identity — because the label
  is followed. Getting this wrong left ten doors the file names with no paper on
  the 27 Aug roster while a sibling door got two.
- **An unlabelled line is never treated as a contradiction.** 913 CLAIRE DR is one
  line with no label, already served; the file naming "Upstairs" does not disagree
  with it. Reading that as a mismatch produced 122 spurious "has this household
  moved?" questions out of 301.
- **No label is ever invented, and a new line carries the door the file stated.**
  A silent file gets a silent line, per the existing "never invent a label" rule.

**Where counting and the door disagree, nothing is written.** *(Superseded
2026-09-01 — see "the master list wins the door" below: the move now happens as
an add row plus a cut row, still applied by a person.)* The list names the
basement at `5 GRASSMERE ST`; the paper goes upstairs. Counting says one and one,
nothing to do — and the named household gets nothing. Attaching says the basement
should have it — and that is two papers where one is asked for. Neither is safe,
because settling it means *stopping* a delivery. It is reported as an apparent
move between the units and left to a person. 16 rows on the 27 Aug file.

**An address holding more than two lines is never written to blind.** A house has
two apartments; more than that is either a real block — `419 CEDAR BRIDGE AVE`
carries 23 deliveries — or a duplicate in our own records. Apartment numbers live
in `special_instructions`, which `loadContext` does not select, so the lines are
indistinguishable and picking between them by id order is a coin toss. Such an
address still reports "no change" where it is already covered, because nothing is
written; attaching or creating goes to a person. 10 rows.

### Commercial drops are cancelled like anyone else (Ari, 2026-08-30)

Asked directly whether the businesses on the round should be protected from a
roster import, Ari: *"the commercial stops should get cancelled if they're not
listed"*. The publication's list wins here too — a business absent from The
Voice's roster stops getting The Voice, exactly as a household would.

**This reverses the premise `roster_managed` was added on.** The column and its
comment in `20260827030000_undoable_imports.sql` argue the opposite — that a
subscriber export will never name Silvino's Auto or Leisure Chateau, so reading
their absence as a cancellation is the silent-deletion failure the import path
exists to prevent. That reasoning is superseded. Do not "fix" the guard back on.

Nothing needs building: `roster_managed` is `true` on all 2,623 stops, so
`planRosterRemovals`' `if (stop.rosterManaged === false) continue` never fires
and the behaviour is already what Ari wants. Leave the column in place — it is a
per-stop override for a drop that genuinely must survive a roster, and there is
no such drop today.

The 14 commercial-looking stops, checked 2026-08-30: `109 CLAIRE DR` (YESHIVA),
`107` and `109 HADASSAH LN` (Yeshiva Gedola of Monmouth, no Voice), and eight on
River Ave — Leisure Chateau ×5 at 962, Styled Child and Wig Authorities at 916,
Princeton Dineros at 900, Ocean Dental at 838, Lipa's Auto at 227, Silvino's Auto
at 203. Removal is per-publication, so a Voice import leaves their BP, Shopper
and Lakewood Courier deliveries untouched.

**A whole-address removal used to stop only one line of several — fixed
2026-08-31.** `planRosterRemovals` deduped on `street|houseNumber` and set
`stopId` to the first stop it met, so `962 RIVER AVE` — five Leisure Chateau
lines — produced one removal and left four papers going out every week. Ari,
2026-08-30: *"if the address is not listed at all on the master list then all
instances of the address should be removed."* It now emits one row per line: 21
rows across the same 16 addresses on the 27 Aug file, the five extra being four
at 962 River Ave and one at 916. `removalsLookWrong` is still fed the distinct
**address** count, because 5% of the publication's addresses is what that
threshold was calibrated against; feeding it lines would have tightened it
silently.

### Three runs a week, each with a different mix (Ari, 2026-08-28)

**The drivers almost never deliver every magazine at once.** They do about three
runs during the week, each carrying a different combination — which is exactly why
export takes an arbitrary subset of publications rather than a single/all toggle.
This is the reason that requirement exists, recorded here because it was not
obvious from the call notes.

Consequence, and it retires a finding: **an all-publications booklet is not what
gets printed.** Earlier notes in `docs/handoff.md` describe it as "the booklet
printed today" and treat defects visible only on it as live. They are not.

The publication-letters column overflowing on ten addresses across zones 2–5 is
one of those. It needs **8 or more selected letters on a single stop**, and a real
run selects a handful of publications, not fifteen. Ari, 2026-08-28: *"You don't
have to be concerned about the ones that don't fit on the line."* Left in the code
as-is; do not spend effort widening the column.

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
