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
- Cover page per route per week: additions, deletions, and complaints —
  Amrom asked for complaints as their own labeled section, separate from
  additions/deletions (mentioned late in the call, 30:19).
- Export must preserve the driving-direction text and its position in
  the sequence, and the special-instructions column.

**Complaints** (confirmed by Ari 2026-08-19)
- Originated by a subscriber calling in about how their delivery was
  handled (e.g. misplaced, missed, damaged) — not by the courier. This
  is the subscription department's intake, same as an address
  add/remove call.
- A complaint is tied to a specific stop/address and gets relayed to
  the courier via the cover sheet of the *next* week's booklet, in its
  own section alongside that week's additions and deletions — same
  weekly cadence as the rest of the cover page, not a separate channel
  or real-time alert.
- Still unconfirmed: whether a complaint has any state after being
  printed once (acknowledged/resolved), or whether "appears on next
  week's cover sheet" is its entire lifecycle. The forthcoming cover
  sheet sample should clarify this.

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
  Whether The Voice is the sole operator with the others as read/scoped
  participants, or each publication is a fully independent tenant, is
  still open — but the schema needs a publication-scoped access layer
  either way, not a single flat permission model.

## Booklet structure (confirmed by Ari 2026-08-19)

A booklet = the route itself (addresses + driving directions, in the
exact structure shown in the zone samples) **plus** a cover sheet.
Cover sheet sample not yet received — Ari said it's coming shortly.
When it arrives, use it to confirm/refine the complaints and
additions/deletions layout described above, since Amrom separately said
on the call he wants a new cover-page look, not a copy of the old one.

## Open items to confirm with Amrom before/while building

- The cover sheet itself — layout and exact fields, once Ari sends the
  sample. Everything in "Complaints" above is Ari's account of the
  workflow, not yet cross-checked against Amrom's actual cover sheet.
- Whether a complaint carries any state after it's printed once
  (acknowledged/resolved), or whether appearing on the next cover sheet
  is its entire lifecycle (see "Complaints" above).
