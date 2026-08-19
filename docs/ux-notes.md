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

## Open items

- No wireframes exist yet — this document is principles, not mockups.
  The first real screens (address search/edit, the combination-export
  picker, the cover sheet redesign) should be checked against this
  document once drafted, not treated as pre-approved by it.
