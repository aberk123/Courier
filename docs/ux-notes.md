# UX & UI notes — captured 2026-08-19

## Who actually uses this (derived from docs/domain-notes.md)

1. **The Voice's subscription department staff** — non-technical,
   phone-heavy job. Take a call, look up an address, add/remove/edit
   it, hang up. This happens constantly, often mid-call — every extra
   click here is a real, recurring cost, not a one-time annoyance.
2. **Lakewood Courier's office (Amrom's team)** — imports weekly
   changes (or lets staff above edit directly), runs exports (route
   booklets + cover sheets) for print. Needs fast multi-select for
   zone + publication-combination exports, on a tight weekly rhythm:
   import → review changes → export → print.
3. **Couriers** (later phase, not MVP) — read-only route, check-off,
   and notes from a phone. Likely used one-handed, outdoors, between
   stops. Very low tolerance for clutter or multi-step interactions —
   do not design for this persona the way you'd design for office
   staff at a desk.
4. **Per-publication scoped staff** — a user tied to one publication
   should never be confused about why an address is missing (it's
   filtered by publication scope, not an error) or accidentally act on
   another publication's data.

## Usability requirements that follow directly from the confirmed data model

- Address search+edit must be fast: type-ahead search, single delete
  confirmation, no multi-page forms for what's really a phone-call
  edit.
- Fuzzy-duplicate suggestions (required in `docs/domain-notes.md`) must
  present as an obvious pick-one-or-confirm-new choice, not a wall of
  similar-looking rows to parse under time pressure.
- The cover sheet's four sections (Additions, Deletions, Changes,
  Complaints) must be visually distinct at a skim — Amrom explicitly
  said the sample he sent isn't the design to copy and asked for
  something better, not a content change.
- The publication-combination export picker (any subset of 14) needs a
  real multi-select with clear "what's currently selected" feedback —
  a hidden or ambiguous selection state directly produces a wrong
  export (see the ALL/ANY open item in `docs/domain-notes.md`).
- Publication-scoped access must be visible in context (a persistent
  indicator of which publication's data is in view), so a scoped user
  isn't left guessing why something they expect isn't there.

## Heuristics to apply, tailored to this project's non-technical staff

- Recognition over recall: never require remembering a zone number or
  a publication code — always show searchable names.
- Error prevention over error messages: confirm before a delete;
  prevent an obviously wrong combination-export choice rather than
  letting it silently produce a wrong route.
- Visibility of system status: after an import or a manual edit, show
  what changed immediately in-app — the same additions/deletions/
  changes data the cover sheet prints weekly shouldn't be invisible
  in-app until next week's export.

## Navigation (Ari, 2026-08-20)

Ari asked for "a navigation bar on top to be able to choose a previous page or
the home page." The header had a home link but no way to move *up*: from a cover
sheet the only route back to its own route was one "Route" button, and the only
way home was the wordmark, which does not read as a link to non-technical staff.

Built as a breadcrumb trail under the header — `Home / Zone 2 / Cover sheet &
print` — every ancestor a link, the current page plain text rather than a dead
link. Recognition over recall: the trail says where you are as well as offering
where to go, so nobody has to remember which route they opened.

Two details worth keeping:

- **Zone labels come from the database, not the URL.** A route Ari has named
  reads as its name in the trail; only an unnamed one falls back to "Zone N".
  All five are currently unnamed, so the distinction is invisible today and will
  matter the moment he names one.
- **No trail on the home screen.** It would say only "Home", which is noise.

The existing "Route" and "Cover sheet & print" buttons were deliberately left in
place. They duplicate the trail, but they are large touch targets and staff may
already use them; removing a working affordance is the riskier change.

## Courier booklet legibility (Ari, 2026-08-20)

Three rounds, each driven by Ari looking at a real printed page rather than a
mockup — worth remembering that none of these were caught by reading the code:

1. Publications were full names in small grey text. Now the drivers' own single
   letters, 13.5pt bold black. See `docs/domain-notes.md` for the letters.
1b. **Recipient names came off entirely** (Ari, 2026-08-21: "in general, we don't
   need last names on courier list"). Amrom had already said the name "doesn't
   really matter to the driver". The floor/side is what distinguishes two
   households at one house number, and that stays — so nothing the courier uses
   was lost, and the address column got the freed width. Names remain on the
   in-app screens, where staff need them on the phone. Also removed from the
   cover sheet's Additions/Deletions rows, which already carried floor/side.
2. Rows were too tight to follow down the page. Spacing opened up, accepting
   more pages; the measured cost is in `docs/domain-notes.md`.
3. With airy rows, the eye had too far to travel from the address on the left to
   the letters on the right. Alternate rows now carry a `#ededed` band.

The zebra brought one thing with it: direction rows were `#eee`, which stopped
reading as different once the stripes arrived. They are now `#d8d8d8`, so the
hierarchy is white → `#ededed` stops → `#d8d8d8` driving instructions. A driving
instruction has to stay the loudest thing on the page.

The stripes cost no extra pages: the row gap moved from `marginBottom` to
`paddingVertical` so the band fills the row, which keeps row height identical.
The band started at `#f4f4f4`, which turned out to be near-invisible at print
size — Ari asked for the stripes again after seeing a page that already had
them. `#ededed` reads clearly and is still well clear of the direction rows.

## Dead stretches in a publication-scoped booklet (Ari, 2026-08-21)

A booklet filtered to one publication inherits the whole route's driving
directions, so long runs of instructions end up with no deliveries under them.
For Mishpacha alone: **21 of zone 1's 32 directions, 46 of zone 2's 65, 24 of
zone 3's 51**, with unbroken runs of 17, 14 and 8. With every publication
selected the same routes have only 8, 9 and 3 — so this is an artifact of
filtering, not of the route data. Ari's courier read a page of it and said it did
not make sense.

**The code used to delete them, and that was dangerous.** `getBooklet` dropped
any direction with no stop under it, reasoning it was navigation to somewhere the
courier was not going. It is not: those runs carry the turns *between* the places
he is going. Zone 2's dead run of 14 contains `TURN LEFT ON MARC DR`,
`TURN RIGHT ONTO SPRUCE` and `TURN RIGHT ON HOWARD DR` — delete it and there is
no way to get from Ned Dr to Howard Dr. Zone 1's contains the entire drive out of
the Cedar Bridge complex. Ari: *"If you remove a street without any deliveries,
the courier may be missing an important turn in order to get to the next
street."*

**So nothing is removed — a dead run is collapsed instead.** `collapseSkippedStretches`
merges a run of three or more into one quiet italic block prefixed "Nothing for
this booklet along here", keeping every word, and always leaves the **last**
direction of the run at full weight because that is the one leading to the next
delivery. Runs of one or two are left alone entirely.

Zone 2 goes from 99 rows to 66 with all 65 directions still on the page. The
property is unit-tested against all three real routes: every direction survives,
no stop is lost, order is preserved.

Note the separator is `>` and not an arrow — Helvetica in react-pdf has no arrow
glyph and renders it as an apostrophe.

## Import screen

- **The file input must look like a button.** Ari: *"there's a button to choose
  file. It's just text. It doesn't look like a button."* Styled via Tailwind's
  `file:` modifiers so it stays a real `<input type="file">` — keyboard and
  screen-reader behaviour unchanged — while rendering as an outlined button.
  Deliberately outlined, not filled, so "Review file" stays the primary action.

## Open items

- No wireframes exist yet — this document is principles, not mockups.
  The first real screens (address search/edit, the combination-export
  picker, the cover sheet redesign) should be checked against this
  document once drafted, not treated as pre-approved by it.
