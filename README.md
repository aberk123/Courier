# Lakewood Courier Route & Address Dashboard

Internal tool for The Voice of Lakewood's subscription department to manage
weekly delivery-address changes and export print-ready courier route
booklets, replacing the current all-Excel workflow with Lakewood Courier
(Amrom Jacobovics, 732-546-9333).

Tracks delivery lists for **every publication on the route sheet**
(BP, Voice, Shopper, Yated, Mishpacha, Ami, Circle, Hamodia, Bina,
Dee Voch, Hundred, Wellsprings, Lakewood Courier, Kindline,
Shtenderel), not only The Voice — confirmed scope as of 2026-08-19.

## Origin

Scoped in a call with Amrom on 2026-08-13 ("Conversation with Amrom",
Fireflies transcript `01KZY290FK5SMNX0AX9NVZZV12`). See
`docs/domain-notes.md` for the full requirements captured from that call
and from the sample route files Amrom sent 2026-08-19 ("zones 1-5").

## MVP scope

Cover the 5 zones in the "zones 1-5" sample (`BP ZONE 1.xlsm` –
`BP ZONE 5.xlsm`), then expand to the rest of Lakewood, NJ and
surrounding areas.

## Agents (`.claude/agents/`)

- **lakewood-courier-advisor** — architecture, data-model, and scope
  guidance. Consult before making structural decisions.
- **lakewood-courier-reviewer** — independent check of a design or
  implementation against `docs/domain-notes.md`, catching gaps,
  silently-resolved open items, and scope creep, and considering
  simpler alternatives. Use after something is proposed or built, not
  as a planning tool.
- **lakewood-courier-ux** — usability and visual design for the actual
  users (subscription staff, Lakewood Courier's office, later
  couriers), per `docs/ux-notes.md`. Owns the cover sheet redesign and
  any screen/form/workflow design or review.

## Status

Pre-build. No application code yet — this repo currently holds the
domain and UX research (`docs/`) and the three agents above, used to
keep future build sessions consistent with what was actually discussed,
the real data format, and the actual users.
