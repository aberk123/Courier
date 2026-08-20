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

## Raised by browser testing 2026-08-20 — needs Ari's decision

Found by exercising the app against the test branch, not by reading the code.
Recorded here because each one is a *requirements* question, not a defect with
an obvious fix.

- **Removing a whole address is invisible to every other publication.**
  "Remove this address" sets `stops.active = false`, which pulls the stop out of
  every publication's booklet at once. It logs no `removed` events, so nothing
  appears in any Deletions section, and `stop_publications` still says the
  address is subscribed. A Voice staffer can therefore stop Shopper's delivery
  to a shared address, silently — reproduced in the browser as
  `voice@example.test` on 28 SQUANKUM RD, which receives both.
  The confirmed Deletion row format is per-publication (`… · Delete Voice`), so
  the likely intent is that whole-address removal should log a `removed` event
  per publication the stop receives. Two sub-questions for Ari:
  (a) should a publication-scoped staffer be able to remove an address at all,
  or only remove *their own* publication from it? and (b) when the courier
  office removes one, should every affected publication see a Deletion row?
- **A removed address keeps its pending Additions.** Because deactivation logs
  nothing, an address added and then removed inside one cover-sheet cycle still
  prints under Additions — telling the courier to start delivering somewhere
  that no longer exists on the route. Falls out of the same fix.
