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
  silently-resolved open items, and scope creep; also actively tries to
  break the per-publication access boundary and weekly-diff/import edge
  cases, and considers simpler alternatives. Use after something is
  proposed or built, not as a planning tool.
- **lakewood-courier-ux** — usability and visual design for the actual
  users (subscription staff, Lakewood Courier's office, later
  couriers), per `docs/ux-notes.md`. Owns the cover sheet redesign and
  any screen/form/workflow design or review.

## Stack

Next.js (App Router, TypeScript) + Tailwind CSS, responsive/mobile-optimized
(no separate native app — the courier mobile app is an explicitly later,
separate phase). Supabase (Postgres + Auth) for the backend, in the
MyMatSH Supabase org, project `lakewood-courier`. Schema lives in
`supabase/migrations/` and has been applied to that project.

See `SETUP.md` for environment variables and bootstrapping the first
admin account.

## Status

First working slice built (2026-08-19):

- Schema: publications, zones, stops, ordered route entries
  (direction + stop rows interleaved), stop-publication current state +
  event log, instruction-change log, complaints log, and role x
  publication access control (RLS) — all per the confirmed requirements
  in `docs/domain-notes.md`.
- App: email/password sign-in, a zones list, and a per-zone workspace
  (search, add an address, toggle which publications it receives,
  edit special instructions, log a complaint, deactivate an address).
- Verified: production build, TypeScript, and ESLint all pass; the
  auth-redirect behavior was confirmed working (unauthenticated
  requests redirect to `/login`). A full authenticated browser
  walkthrough could not be completed from this particular sandboxed
  dev environment — its network policy blocks direct outbound
  connections to the Supabase project host from application code (only
  the Supabase MCP tool path is allowed through). This is a sandbox
  restriction, not expected to affect local development or a real
  deployment (e.g. Vercel).

Not yet built: exports (PDF routes + the four-section cover sheet),
the weekly bulk-upload import, fuzzy duplicate matching, the
combination-publication export picker, and an admin UI for granting
`user_publication_access` (use the Supabase SQL editor for that until
then — see `SETUP.md`).
