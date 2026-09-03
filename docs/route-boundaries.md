# Route boundaries — written from the routes themselves

Built 2026-09-03 at Ari's request: *"use the directions given to the driver
together with a list of addresses that he is delivering to, to draw the
boundaries of each route... write up the boundaries and use that to help you
determine in the future if an address is within the route or not."*

**Source and provenance.** All five production routes were dumped verbatim
(`route_entries` + `stops`, ordered by sequence) and each dump's md5 was
computed **inside the production database** and matched against the local
file: zone 1 `49cbf4fb…` (457 entries), zone 2 `6051e7c2…` (735), zone 3
`730d7cf9…` (591), zone 4 `d41d74de…` (417), zone 5 `ad20f530…` (630). Ranges
and blocks below are computed over ACTIVE stops; a gap of more than 12 between
consecutive house numbers starts a new block.

**How to read this.** A street's blocks are the doors the route actually
serves — the boundary of the route on that street. Everything here is derived
from the data except the rows marked **confirmed**, which a person ruled.
An inferred edge becomes a standing rule (a street-wide or per-address
ruling) only when Ari or Amrom confirms it — the asymmetry rule: a wrong
"not ours" silently loses a subscriber, so the data alone never records one.

**The two spine roads.** Route 9 IS River Avenue through Lakewood. Zones 2, 3
and 5 all touch it: zone 2 *starts* at 485 River Ave, zone 3 drives it once
(Oak St → High St — the only crossing recorded in any direction text), and
zone 5 uses it as its spine (every leg returns to it). Zone 5's own River Ave
drops carry both parities, so they likely sit on both sides of the highway
itself — a human who knows the road should confirm before either side is
called a boundary. Cedar Bridge Avenue plays the same role for zone 1.

---

## Zone 1 — the Cedarbridge Ave corridor

One territory in three legs, all hanging off Cedar Bridge Ave:

1. **The Shenandoah development** (entered from Cedarbridge): Dune Ct,
   Shenandoah Dr, Rockbridge Rd, Stonewall Ct, Walker Dr — small house
   numbers, whole streets.
2. **Washington Square**: the two apartment buildings at 417 and 419 Cedar
   Bridge Ave only. The other Cedar Bridge Ave numbers on the sheet (260,
   351, 353, 359, 415, 416) are all inactive, and **314 Cedar Bridge Ave is
   confirmed a different zone** (Ari, 2026-09-03; per-address ruling).
3. **The complex behind Quick Chek** (across Cedarbridge, off New Hampshire):
   Bridgewood Ave, London Ave (evens 2–26), Hunter Dr, Kenyon Dr, Newwood
   Hills Ave, Flannery Ave. One inactive stop on Chase Ave (101).

| Street | Active range | Parity | Blocks |
| --- | --- | --- | --- |
| DUNE CT | 1–7 | mixed | 1–7 |
| SHENANDOAH DR | 1–41 | mixed | 1–41 |
| ROCKBRIDGE RD | 1–13 | mixed | 1–13 |
| STONEWALL CT | 2–14 | even | 2–14 |
| WALKER DR | 1–17 | mixed | 1–17 |
| CEDAR BRIDGE AVE | 417–419 | odd | 417–419 (Washington Square only) |
| BRIDGEWOOD AVE | 1–36 | mixed | 1–36 |
| LONDON AVE | 2–26 | even | 2–26 |
| HUNTER DR | 1–14 | mixed | 1–14 |
| KENYON DR | 1–11 | mixed | 1–11 |
| NEWWOOD HILLS AVE | 1–32 | mixed | 1–32 |
| FLANNERY AVE | 2–39 | mixed | 2–39 |

Edges: on Cedar Bridge Ave itself the zone owns nothing but 417/419.
London Ave is even-only — the odd side's owner is unrecorded. Note the
file's LONDON DR (Jackson) is a **different road entirely** (confirmed,
7 rulings from Ari's portal answers).

## Zone 2 — Route 9 to Pine River, and the Spruce St grid

Starts AT Route 9 (485 River Ave, inactive) and works away from it:

1. **Henry St 28–111** (blocks 28–44 and 80–111) then Cedar St 2–18.
   **Confirmed: everything on Henry St beyond 28–111 is across Route 9 — a
   different route** (Ari, 2026-09-02; street-wide ruling). The route's own
   first line ("START 485 RIVER AVE, TURN RIGHT ON HENRY ST") shows the
   stretch begins at Route 9.
2. **Pine St, even side only, 150–270** (blocks 150–152, 198–204, 248–270).
   **Confirmed: the odd side is zone 35, not ours** (Ari, 2026-09-01;
   11 rulings). Pine St is the spine the route crosses repeatedly.
3. **The Pine River development** (off Pine St; "all basements are behind the
   house"): Ponderosa Dr 1–92, Juniper Ln 1–10, Sequoia St 1–23.
4. **Forest Park**: Forest Park Cir 1–167 — odds 1–167 except 9–15 (never
   on the sheet) and 137 (retired); evens only 4, 6, 8, 10, 12 (whether evens
   14–166 exist or the circle is one-sided is a standing question for Amrom);
   Hazelwood Ln 1–17, Branchwood Dr 1–17.
   The file's HAZELWOOD CT (Howell) rows are open city-conflict questions.
   The evidence cuts both ways: our Hazelwood Ln sits inside Forest Park,
   and the file's HAZELWOOD CT numbers (4, 6, 11, 14, 19) never collide with
   its HAZELWOOD LN numbers while jointly filling our 1–17 — the recorded
   signature of one street spelled two ways, which is why the 2026-08-31
   ruling said "same" before the city column said Howell. The Voice office's
   call.
5. **Newberry Ct 1–43**, then the Marc Dr grid: **Marc Dr 504–604** (the
   file's 8–406 Marc Dr sit below this stretch and self-answered as a
   different part of town on the 2026-09-02 deployed map run),
   Ned Dr 112–156, Daniel Dr 118–166.
6. **The Spruce St grid** (via Green St, which carries no stops): Vine Ave
   550–580, Spruce St 100–182, Howard Dr 552–593 **plus 545 (confirmed ours,
   Ari 2026-09-03 — its four retired stop rows sit at seq 613–616, with the
   two corrupted direction rows at 617–618, so that block is its position)**, Neal Ct 123–132, Alan Ct 120–128, Wall St evens 102–112,
   Chelsea Ct evens 2–20 (the file's 7 Chelsea Ct is Howell's road), Sharon
   Ct 1–24.

| Street | Active range | Parity | Blocks |
| --- | --- | --- | --- |
| HENRY ST | 28–111 | mixed | 28–44, 80–111 · **beyond = across Rt 9, ruled** |
| CEDAR ST | 2–18 | mixed | 2–18 |
| PINE ST | 150–270 | even | 150–152, 198–204, 248–270 · **odd side = zone 35, ruled** |
| PONDEROSA DR | 1–92 | mixed | 1–92 |
| JUNIPER LN | 1–10 | mixed | 1–10 |
| SEQUOIA ST | 1–23 | mixed | 1–23 |
| FOREST PARK CIR | 1–167 | mixed | odds 1–167 (no 9–15, no 137); evens only 4–12 |
| HAZELWOOD LN | 1–17 | mixed | 1–17 |
| BRANCHWOOD DR | 1–17 | mixed | 1–17 |
| NEWBERRY CT | 1–43 | mixed | 1–43 |
| MARC DR | 504–604 | mixed | 504–604 |
| NED DR | 112–156 | mixed | 112–156 |
| DANIEL DR | 118–166 | mixed | 118–166 |
| VINE AVE | 550–580 | mixed | 550–580 |
| SPRUCE ST | 100–182 | mixed | 100–182 |
| HOWARD DR | 552–593 (+545) | mixed | 552–577, 593; 545 confirmed ours |
| NEAL CT | 123–132 | mixed | 123–132 |
| ALAN CT | 120–128 | mixed | 120–128 |
| WALL ST | 102–112 | even | 102–112 |
| CHELSEA CT | 2–20 | even | 2–20 |
| SHARON CT | 1–24 | mixed | 1–24 |

## Zone 3 — Spruce/Vine/Cypress, across Route 9 to High St, and Somerset Walk

Three legs:

1. **The Spruce–Vine–Cypress corner**: Spruce St low numbers (blocks 9–15,
   31–45), Vine Ave evens 624–736 (blocks 624–632, 648, 664–680, 696,
   720–736 — the route sheet itself says "TURN RIGHT ON VINE ST" and notes
   "HOUSE NUMBERS INCREASE BY 8"), Cypress Ave 650–799, Mulford St 96–101,
   Read St 241–280, Carol St 104–238, Cathy Ln 187–220, Oak St evens (blocks
   26–28 and 100–110 — **the file's Oak St 1400s measured ~1.4 km away, a
   different part of town**), Sheraton Dr 1–39, Hilton Dr 2–21.
2. **Across Route 9** (seq 276: "TURN RIGHT ON OAK ST, TURN RIGHT ONTO RIVER
   AVE, TURN RIGHT HIGH ST" — the only crossing recorded in any direction
   text):
   High St 2–51, Grassmere St 1–25, Windermere St 1–33, then back to upper
   Spruce St (blocks 260–265, 300, 501, 540–550, 612) and Violet Ct 6–14.
3. **Somerset Walk** (via Washington Ave and a stopless stretch of Pine St):
   Raven Ln 1–12, Canary Dr 36–109, Eagle Ln 1–38 — parking-lot walking
   loops.

| Street | Active range | Parity | Blocks |
| --- | --- | --- | --- |
| SPRUCE ST | 9–612 | mixed | 9–15, 31–45, 260–265, 300, 501, 540–550, 612 |
| VINE AVE | 624–736 | even | 624–632, 648, 664–680, 696, 720–736 |
| CYPRESS AVE | 650–799 | mixed | 650–761, 775–799 |
| MULFORD ST | 96–101 | mixed | 96–101 |
| READ ST | 241–280 | mixed | 241–280 |
| CAROL ST | 104–238 | mixed | 104–238 |
| CATHY LN | 187–220 | mixed | 187–220 |
| OAK ST | 26–110 | even | 26–28, 100–110 |
| SHERATON DR | 1–39 | mixed | 1–39 |
| HILTON DR | 2–21 | mixed | 2–21 |
| HIGH ST | 2–51 | mixed | 2–51 (across Rt 9) |
| GRASSMERE ST | 1–25 | mixed | 1–25 (across Rt 9) |
| WINDERMERE ST | 1–33 | mixed | 1–33 (across Rt 9) |
| VIOLET CT | 6–14 | even | 6–14 |
| RAVEN LN | 1–12 | mixed | 1–12 (Somerset Walk) |
| CANARY DR | 36–109 | mixed | 36–109 (Somerset Walk) |
| EAGLE LN | 1–38 | mixed | 1–38 (Somerset Walk) |

Edges: zone 3 drives Pine St with no stops (Somerset Walk approach) — its
Pine St deliveries are zero; zone 2 owns Pine's even 150–270 and zone 35 the
odd side. Washington Ave is driven, never delivered.

## Zone 4 — the Finchley / Hearthstone grid

A single connected grid, plus one detached house:

Finchley Blvd 14–125 (blocks 14–39, 53–109, 125), Waldorf Ter 1000–1074,
Hearthstone Dr 807–1045 (four blocks; where 1021 goes is an OPEN question
for Amrom — 1020 and 1025 are adjacent actives in the walk, which suggests
the slot, but only he places it),
Claire Dr in TWO pieces (108–143 near Finchley, 913–985 at the far end),
Rachel Ct **200–275 only** (the file's 3 Rachel Ct is Howell's road — its
city column settles it), Morris Ave 802–1027,
North Dr odds 211–229, Clairmont Ct 108–148, Princewood Ave 933–1050,
Jenna Ct 109–149, Lancewood Ct 108–141, Netherwood Dr 1020–1026, Shayas Rd
1–31. The detached stop: **985 Claire Dr**, reached via Cross St and
Massachusetts Ave, "about 1,200 ft on the right".

| Street | Active range | Parity | Blocks |
| --- | --- | --- | --- |
| FINCHLEY BLVD | 14–125 | mixed | 14–39, 53–109, 125 |
| WALDORF TER | 1000–1074 | mixed | 1000–1016, 1032–1074 |
| HEARTHSTONE DR | 807–1045 | mixed | 807–823, 838–942, 955–990, 1003–1045 |
| CLAIRE DR | 108–985 | mixed | 108–143, 913–985 |
| RACHEL CT | 200–275 | mixed | 200–275 |
| MORRIS AVE | 802–1027 | mixed | 802–973, 995–1027 |
| NORTH DR | 211–229 | odd | 211–229 |
| CLAIRMONT CT | 108–148 | mixed | 108–148 |
| PRINCEWOOD AVE | 933–1050 | mixed | 933–1008, 1050 |
| JENNA CT | 109–149 | mixed | 109–149 |
| LANCEWOOD CT | 108–141 | mixed | 108–141 |
| NETHERWOOD DR | 1020–1026 | mixed | 1020–1026 |
| SHAYAS RD | 1–31 | mixed | 1–31 |

## Zone 5 — the Route 9 spine, south

Every leg hangs off River Ave (Route 9); the route returns to it four times:

1. **The Rena development**: Rena Ln 1–111 (delivered in bags, odds then
   evens), Gila Pl evens 2–16.
2. **River Ave itself**: commercial drops at 203, 227, 809, 838, 900, 916,
   962 — scattered single stops, not a walked stretch. **River Ave is a
   commercial road** (Ari, 2026-09-01): its unlisted addresses are removals
   like any other.
3. **Hadassah Ln 100–210** — three middle sections listed by distance from
   Route 9 (the route sheet's own words).
4. Pine Blvd 30–56, Shilo Rd odds 1–23, Hekel Rd 1–31, Cushman St 20–75 —
   each entered from River Ave.
5. **Leisure Chateau** (right off River Ave): Chateau Dr 100–189, Ricky Ln
   109–132.

| Street | Active range | Parity | Blocks |
| --- | --- | --- | --- |
| RENA LN | 1–111 | mixed | 1–111 |
| GILA PL | 2–16 | even | 2–16 |
| RIVER AVE | 203–962 | mixed | 203, 227, 809, 838, 900, 916, 962 (single drops) |
| HADASSAH LN | 100–210 | mixed | 100–210 |
| PINE BLVD | 30–56 | mixed | 30–56 |
| SHILO RD | 1–23 | odd | 1–23 |
| HEKEL RD | 1–31 | mixed | 1–31 |
| CUSHMAN ST | 20–75 | mixed | 20–75 |
| CHATEAU DR | 100–189 | mixed | 100–189 (Leisure Chateau) |
| RICKY LN | 109–132 | mixed | 109–132 (Leisure Chateau) |

## The inter-zone boundaries (streets in more than one zone)

- **SPRUCE ST** — zone 3 owns the low numbers (9–45) and the upper blocks
  (260–612); **zone 2 owns 100–182**, one contiguous block between them.
  Zone 3's lone 100 Spruce is inactive. So the boundary bands are: ≤45 zone
  3, 100–182 zone 2, 260+ zone 3. (What 46–99 and 183–259 would be is
  unrecorded — ask if one ever arrives.)
- **VINE AVE** — zone 2 owns 550–580; zone 3 owns the evens 624–736. Clean
  split between 580 and 624; below 550 is neither: the file's Vine Ave 100s
  are Lakewood rows the 2026-09-02 deployed map pass measured far and
  self-answered — questions before that run, neither questions nor placements
  after it.
- **RIVER AVE (Route 9)** — zone 5 owns the commercial drops 203–962; zone
  2 merely starts at 485 (inactive); zone 3 drives it once. A new River Ave
  address is presumptively zone 5's, and commercial.
- **PINE ST** — zone 2 owns the even side 150–270; the odd side is zone 35
  (confirmed, not ours); zone 3 drives it with no stops.

## Confirmed barriers and exclusions (the rules a person has ruled)

- **Route 9 (River Ave)** divides Henry St: ours is 28–111; beyond is a
  different route (street-wide ruling). Note zone 3 legitimately crosses
  Route 9 once — the highway is a boundary for Henry St specifically, not a
  wall no route crosses; treat "measured close but across Route 9" as a
  question, not an automatic answer.
- **Pine St odd side = zone 35** (11 rulings).
- **The town line**: the master list's city column decides — Jackson, Toms
  River, Howell, Manchester rows are not candidates for our streets; the
  exceptions (an out-of-town label on a door we deliver) become
  city_conflict questions.
- **314 Cedar Bridge Ave** — a different zone (per-address ruling).
- **London Dr (Jackson)** — a different road from our London Ave (7 rulings).

## Spelling glossary from the route sheets themselves

The courier's own directions spell loosely — useful when matching a file:
MARK DR = MARC DR · CATHEY LN = CATHY LN · RINA PL = RENA LN ·
PONDAROSA / PANDEROSA = PONDEROSA DR · NEWOOD HILLS = NEWWOOD HILLS AVE ·
HEARTSTONE = HEARTHSTONE DR · and zone 3's own sheet calls VINE AVE
"VINE ST".

Also: `CEDARBRIDGE` (one word) = CEDAR BRIDGE AVE · `RAVEN LANE` = RAVEN LN.

Roads driven but never delivered (inside the territory, no doors): Green St
(zone 2), Washington Ave (zone 3), Cross St and Massachusetts Ave (zone 4),
New Hampshire / Clifton / Arlington / Ashley (zone 1 landmarks).

Retired stops OUTSIDE a street's active range are boundary evidence too — the
route once served them, so a future arrival there is not "beyond the
territory": 60 EAGLE LN (zone 3, active 1–38), 129 ALAN CT (zone 2, active
120–128), 1 FLANNERY AVE (zone 1, active 2–39), and zone 1's inactive Cedar
Bridge numbers above.

Zone 2's Juniper Ln (1–10, inside Pine River) carries one open city
conflict — the file's 5 Juniper Ln (Jackson) against our served 5 — plus
13 Juniper Ln blocked as Jackson although it once measured 9 m — against the
LAKEWOOD 13, because the geocoder is told the city. Both are the Voice
office's to settle.

## How this document is used

1. **A new address on a street above**: inside a block → it belongs there
   (the importer's stretch logic already does this); in a gap or beyond an
   end → the block boundaries here say which question to ask and of whom.
2. **A confirmed edge** becomes a standing rule (street-wide or per-address
   ruling) so it never re-asks — Henry St and Pine St are the pattern.
3. **Nothing here auto-applies**: derived edges are evidence for a person,
   never a silent decision. The map's blind spot stands: straight-line
   distance cannot see Route 9, so same-street conversions near a spine road
   deserve a second look against this document.
