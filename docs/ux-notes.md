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

## Open items

- No wireframes exist yet — this document is principles, not mockups.
  The first real screens (address search/edit, the combination-export
  picker, the cover sheet redesign) should be checked against this
  document once drafted, not treated as pre-approved by it.
