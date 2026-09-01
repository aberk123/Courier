/**
 * Regression tests for the import matcher.
 *
 * Every case here is a shape that a real publication roster actually contained
 * and that the code got wrong before -- see "The Voice's real roster" in
 * docs/domain-notes.md. The fixture is synthetic on purpose: the real file is
 * ~19,600 subscribers' names and addresses and does not belong in the repo.
 *
 * Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeFloorSides,
  normalizeFloorSide,
  ruleStreetVariants,
  listedUnderAnySpelling,
  planRosterRemovals,
  additionsLookWrong,
  removalsLookWrong,
  planRow,
  buildStreetZoneMap,
  normalizeStreet,
  normalizeHouseNumber,
  buildStopIndex,
  buildRulingIndex,
  settleAddress,
  surplusServedLines,
  type ExistingStop,
} from "./match.ts";
import { rowsFromGrid, splitAddress } from "./parse.ts";
import { planRoster } from "./plan.ts";

const streets = (spec: Record<string, string[]>) =>
  new Map(
    Object.entries(spec).map(([street, nums]) => [
      normalizeStreet(street),
      new Set(nums.map(normalizeHouseNumber)),
    ]),
  );

test("floor/side: misspellings that occur in a real roster", () => {
  // Each of these returned null before: `basment` contains none of the
  // substrings the old pattern looked for.
  for (const v of ["Basment", "bmsnt", "bmnst", "Lower level", "bsmt", "Basement"]) {
    assert.equal(normalizeFloorSide(v), "basement", v);
  }
  for (const v of ["Upstairs", "usptairs", "Uptairs", "Upstaire", "up"]) {
    assert.equal(normalizeFloorSide(v), "upstairs", v);
  }
});

test("floor/side: never invented out of placement text", () => {
  // The old pattern matched `up` inside "couple", `top` in "top of mailbox",
  // `down` in "down the driveway" and `second` in "second driveway", each of
  // which put a household on the wrong floor.
  for (const v of [
    "plz put on steps WITH the railing, older couple",
    "plz put on top of mailbox",
    "down the driveway",
    "entrance is on the left side of the house by the second driveway",
    "Second Entrance to the house",
    "Update",
    "House",
    "Main floor",
  ]) {
    assert.equal(normalizeFloorSide(v), null, v);
  }
});

test("floor/side: a cell naming both floors resolves to neither", () => {
  // "upstairs (no one lives in basement)" used to return basement, because the
  // basement branch ran first and the word appears in a note denying it.
  assert.equal(normalizeFloorSide("upstairs (no one lives in basement)"), null);
  assert.equal(normalizeFloorSide("Upstairs and downstairs"), null);
});

test("floor/side: the two extension columns are unioned", () => {
  // The roster puts most "Upstairs" in one column and most "Basement" in the
  // other; 1,534 basements existed only in the second. Reading one column
  // merged every basement household into the upstairs one at the same door.
  assert.equal(mergeFloorSides(null, "Basement"), "basement");
  assert.equal(mergeFloorSides("Upstairs", null), "upstairs");
  assert.equal(mergeFloorSides("Basement", "Basement"), "basement");
  // Disagreement is not resolved by preferring a column.
  assert.equal(mergeFloorSides("Upstairs", "bsmnt"), null);
});

test("a whole address in one cell is split, and a reversed one is not guessed at", () => {
  assert.deepEqual(splitAddress("999 Morris Ave"), { houseNumber: "999", street: "Morris Ave" });
  assert.deepEqual(splitAddress("28A Henry St"), { houseNumber: "28A", street: "Henry St" });
  assert.equal(splitAddress("Meadowood Road 429"), null);
  assert.equal(splitAddress("1OMNI CT"), null);
});

test("a publication's own export is parsed: no action column, address in one cell", () => {
  const rows = rowsFromGrid(
    [
      [
        "customers.id",
        "customers.first_name",
        "customers.last_name",
        "addresses.addr",
        "addresses.extended_addr",
        "addresses.extended_addr2",
      ],
      ["abc123", "Family", "Aronowitz", "12 Juniper Ln", "", "Basement"],
      ["abc124", "Devorah", "Bergman", "3 Dune Ct", "Upstairs", ""],
    ],
    { defaultAction: "add" },
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].houseNumber, "12");
  assert.equal(rows[0].street, "Juniper Ln");
  assert.equal(rows[0].action, "add");
  assert.equal(rows[0].name, "Family Aronowitz");
  // The basement label lives in the SECOND extension column.
  assert.equal(mergeFloorSides(rows[0].floorSide, rows[0].floorSideAlt), "basement");
  assert.equal(mergeFloorSides(rows[1].floorSide, rows[1].floorSideAlt), "upstairs");
  assert.equal(rows[0].problem, undefined);
});

test("without a chosen publication, a roster row is blocked rather than guessed", () => {
  const rows = rowsFromGrid([["customers.last_name", "addresses.addr"], ["Aronowitz", "12 Juniper Ln"]]);
  assert.match(rows[0].problem ?? "", /unrecognised action/);
});

test("street ruling: a bare base word is our street", () => {
  // "PONDEROSA" with no street type cannot be a *different* street.
  const ruling = ruleStreetVariants(
    streets({ "PONDEROSA": ["6", "8"], "PONDEROSA DR": ["1"] }),
    streets({ "PONDEROSA DR": ["1", "6", "8"] }),
  );
  assert.equal(ruling.get(normalizeStreet("PONDEROSA"))?.ruling, "same");
});

test("street ruling: one street written two ways", () => {
  // HAZELWOOD CT and the file's own HAZELWOOD LN never share a house number,
  // and together they fill the range we deliver to. That is one street.
  const ruling = ruleStreetVariants(
    streets({ "HAZELWOOD CT": ["4", "6", "11", "14"], "HAZELWOOD LN": ["1", "3", "8", "9"] }),
    streets({ "HAZELWOOD LN": ["1", "3", "4", "6", "8", "9", "11", "14", "17"] }),
  );
  assert.equal(ruling.get(normalizeStreet("HAZELWOOD CT"))?.ruling, "same");
});

test("street ruling: a different road that merely rhymes with ours", () => {
  // CHELSEA RD runs past 60 with odd numbers; our CHELSEA CT is 2-20 even, and
  // the file lists CHELSEA CT separately with our numbers. Two roads.
  // Matching on the name would have added deliveries that do not exist -- and,
  // once removals are enabled, cancelled ones that do.
  const ruling = ruleStreetVariants(
    streets({
      "CHELSEA RD": ["3", "12", "15", "16", "37", "49", "55", "61", "65"],
      "CHELSEA CT": ["2", "8", "14", "16", "18"],
    }),
    streets({ "CHELSEA CT": ["2", "4", "6", "8", "10", "12", "14", "16", "18", "20"] }),
  );
  assert.equal(ruling.get(normalizeStreet("CHELSEA RD"))?.ruling, "different");
});

test("street ruling: sharing no house number with us is a different street", () => {
  // READ PL is in the 1300s-1400s; our READ ST is 241-280.
  const ruling = ruleStreetVariants(
    streets({ "READ PL": ["1341", "1400", "1427"], "READ ST": ["241", "249"] }),
    streets({ "READ ST": ["241", "249", "256", "280"] }),
  );
  assert.equal(ruling.get(normalizeStreet("READ PL"))?.ruling, "different");
});

test("street ruling: one name used for two roads goes to a person", () => {
  // The roster uses VINE ST both for a stretch in the 100s it does not share
  // with us and for 580-736, which IS our VINE AVE. Ruling the whole spelling
  // "different" would drop the real ones; ruling it "same" would invent the
  // others. Neither is safe, so it is unresolved.
  const ruling = ruleStreetVariants(
    streets({
      "VINE ST": ["106", "114", "186", "580", "648", "696", "728", "736", "792", "1111"],
      "VINE AVE": ["102", "104", "110"],
    }),
    streets({ "VINE AVE": ["550", "580", "648", "664", "696", "728", "736"] }),
  );
  assert.equal(ruling.get(normalizeStreet("VINE ST"))?.ruling, "unresolved");
});

test("street ruling: both spellings used for the same numbers is unresolved", () => {
  const ruling = ruleStreetVariants(
    streets({ "LONDON DR": ["2", "6", "11", "18", "22"], "LONDON AVE": ["6", "18", "22", "24"] }),
    streets({ "LONDON AVE": ["2", "4", "6", "8", "18", "20", "22", "24", "26"] }),
  );
  assert.equal(ruling.get(normalizeStreet("LONDON DR"))?.ruling, "unresolved");
});

test("street ruling: an exact match is never ruled on", () => {
  const ruling = ruleStreetVariants(
    streets({ "DUNE CT": ["1", "3"] }),
    streets({ "DUNE CT": ["1", "3", "5"] }),
  );
  assert.equal(ruling.size, 0);
});

test("a removal is suppressed when the upload spells our street differently", () => {
  // Our 10 SHENANDOAH DR appears in the real roster as "10 Shenendoah Dr" -- a
  // typo in the base word, which the street ruling groups by and therefore
  // cannot see. Reading that address as absent would have cancelled it.
  const file = streets({ "SHENENDOAH DR": ["10", "12"], "DUNE CT": ["1"] });
  assert.equal(listedUnderAnySpelling("SHENANDOAH DR", "10", file), true);
  // The unit letter, in both directions.
  assert.equal(listedUnderAnySpelling("CANARY DR", "105A", streets({ "CANARY DR": ["105"] })), true);
  assert.equal(listedUnderAnySpelling("RENA LN", "109", streets({ "RENA LN": ["109A"] })), true);
  // Genuinely absent stays absent -- suppression must not swallow everything.
  assert.equal(listedUnderAnySpelling("CAROL ST", "207", file), false);
  // A different street with the same house number does not suppress.
  assert.equal(listedUnderAnySpelling("EAGLE LN", "34", streets({ "EAGLE RIDGE CIR": ["34"] })), false);
});

test("removal suppression is generous about spelling but not about short names", () => {
  // Real transpositions and dropped letters on long names: the same street.
  assert.equal(listedUnderAnySpelling("HAZELWOOD LN", "5", streets({ "HAZLEWOOD LN": ["5"] })), true);
  assert.equal(listedUnderAnySpelling("WINDERMERE ST", "31", streets({ "WINDEMERE ST": ["31"] })), true);
  // A different street type still stands in, since this only suppresses.
  assert.equal(listedUnderAnySpelling("CANARY DR", "66", streets({ "CANARY ST": ["66"] })), true);
  // But two edits on a five-letter name is a different street: CAROL vs CAREY.
  assert.equal(listedUnderAnySpelling("CAROL ST", "207", streets({ "CAREY ST": ["207"] })), false);
});

test("roster removals: only where the roster covers the street, and never per unit", () => {
  const stop = (id: string, house: string, street: string, pubs: string[]) => ({
    id, zoneId: "z", zoneNumber: 1, recipientName: null,
    houseNumber: house, street, floorSide: null, publicationIds: pubs,
  });
  const voice = { id: "V", name: "The Voice" };
  const stops = [
    stop("a", "5", "DUNE CT", ["V"]),          // on a covered street, absent -> remove
    stop("b", "7", "DUNE CT", ["V"]),          // listed -> keep
    stop("c", "1", "OAK ST", ["V"]),           // roster never mentions Oak St -> not ours to judge
    stop("d", "9", "DUNE CT", ["B"]),          // not a Voice address at all
    stop("e", "3", "DUNE CT", ["V"]),          // two units at one address, roster lists it once...
    stop("f", "3", "DUNE CT", ["V"]),          // ...so neither is removed
  ];
  const file = streets({ "DUNE CT": ["3", "7"] });
  const out = planRosterRemovals(stops, voice, file, 2);
  assert.deepEqual(out.map((r) => r.stopId), ["a"]);
  assert.equal(out[0].action, "remove");
  assert.equal(out[0].publicationId, "V");
  assert.equal(out[0].status, "ready");
});

test("a run that would cancel a large slice of the list is held back", () => {
  // Real churn is a handful. 16 of 1,102 passes; a matching regression does not.
  assert.equal(removalsLookWrong(16, 1102).tripped, false);
  assert.equal(removalsLookWrong(540, 1102).tripped, true);
  // Small publications get a floor, so a list of 30 is not tripped by 3.
  assert.equal(removalsLookWrong(3, 30).tripped, false);
  assert.equal(removalsLookWrong(29, 30).tripped, true);
});

test("an exact street match with an out-of-area house number is a decision, not a creation", () => {
  const stop = (house: string, street: string) => ({
    id: `s-${house}-${street}`, zoneId: "z", zoneNumber: 3, recipientName: null,
    houseNumber: house, street, floorSide: null, publicationIds: [] as string[],
  });
  // Our Oak St is 26-110. A town-wide roster also carries Oak St in the 1400s.
  // Dense enough that 64 is genuine infill: with only 26/28/110 it would sit in
  // an 82-wide hole, which is two blocks rather than one stretch.
  const stops = [stop("26", "OAK ST"), stop("28", "OAK ST"), stop("60", "OAK ST"),
    stop("66", "OAK ST"), stop("110", "OAK ST")];
  const zones = buildStreetZoneMap(stops);
  const pubs = [{ id: "V", code: "thevoice", name: "The Voice" }];
  const row = (house: string) => ({
    rowNumber: 2, action: "add" as const, name: "Family Ort", houseNumber: house,
    street: "Oak St", publication: "thevoice", floorSide: null, floorSideAlt: null, instructions: null,
  });

  const far = planRow(row("1471"), stops, pubs, zones);
  assert.equal(far.status, "needs_choice");
  assert.match(far.message, /outside the 26–110 stretch/);
  // The address is still carried through, so a reviewer can accept it.
  assert.equal(far.newStop?.houseNumber, "1471");

  // A gap inside the stretch we walk is an ordinary new address -- but still not
  // applied, because create_stop_in_route appends past the route's DONE marker
  // and nothing here knows where 64 belongs in the sequence.
  const inside = planRow(row("64"), stops, pubs, zones);
  assert.equal(inside.status, "needs_choice");
  assert.match(inside.message, /new address on zone 3/);
  assert.match(inside.message, /add it between 60 and 66 in the route/);
  assert.equal(inside.newStop?.houseNumber, "64");
});

test("a stop the roster does not manage is never removed by absence", () => {
  const stop = (id: string, house: string, street: string, rosterManaged: boolean) => ({
    id, zoneId: "z", zoneNumber: 5, recipientName: null, houseNumber: house, street,
    floorSide: null, publicationIds: ["V"], rosterManaged,
  });
  // A subscriber export never lists the commercial drops on the round, so
  // absence means nothing for them.
  const stops = [
    stop("shop", "203", "RIVER AVE", false),
    stop("home", "611", "RIVER AVE", true),
    // Listed in the file, so this one is kept while its unlisted neighbour goes.
    stop("kept", "809", "RIVER AVE", true),
  ];
  const out = planRosterRemovals(
    stops,
    { id: "V", name: "The Voice" },
    streets({ "RIVER AVE": ["809"] }),
    2,
  );
  assert.deepEqual(out.map((r) => r.stopId), ["home"]);
});

test("an out-of-area row offers nothing to place, so it cannot be misfiled", () => {
  // The review screen shows a route picker for any row carrying a newStop, and
  // choosing a route marks that row ready. An out-of-area row must therefore
  // carry no newStop, or the office can place an address on a route that does
  // not go near it.
  const stops = [{
    id: "s1", zoneId: "z", zoneNumber: 1, recipientName: null,
    houseNumber: "1", street: "DUNE CT", floorSide: null, publicationIds: [] as string[],
  }];
  const plan = planRow(
    { rowNumber: 2, action: "add", name: "Bailke Blumberg", houseNumber: "27",
      street: "Hawk Way", publication: "thevoice", floorSide: null, floorSideAlt: null, instructions: null },
    stops,
    [{ id: "V", code: "thevoice", name: "The Voice" }],
    buildStreetZoneMap(stops),
  );
  assert.equal(plan.status, "blocked");
  assert.equal(plan.newStop, null);
  assert.match(plan.message, /not on any of our routes/);
});

test("an address that already has the publication reports no change, not a failure", () => {
  // This was returning "blocked", so more than a thousand perfectly matched rows
  // on the real roster were counted under "cannot be applied".
  const stops = [{
    id: "s1", zoneId: "z", zoneNumber: 4, recipientName: null,
    houseNumber: "999", street: "MORRIS AVE", floorSide: null, publicationIds: ["V"],
  }];
  const plan = planRow(
    { rowNumber: 2, action: "add", name: "Family Ochana", houseNumber: "999",
      street: "Morris Ave", publication: "thevoice", floorSide: null, floorSideAlt: null, instructions: null },
    stops,
    [{ id: "V", code: "thevoice", name: "The Voice" }],
    buildStreetZoneMap(stops),
  );
  assert.equal(plan.status, "no_change");
  assert.match(plan.message, /already gets The Voice/);
  assert.equal(plan.stopId, "s1");
});

test("a street we do not deliver is not ours, however close the name looks", () => {
  // Ari, 2026-08-31: "There is a Bruce St and Carol St in Lakewood. Why should we
  // assume that's not what it is?" A similar name plus a matching house number is
  // not evidence -- the house-number match is guaranteed, because this branch only
  // looks at numbers we already hold. WALTER DR against our WALKER DR is one
  // letter and both are real roads. Without a surname agreeing it is simply not
  // one of our streets.
  const stops: ExistingStop[] = [
    { id: "s1", zoneId: "z1", zoneNumber: 1, recipientName: "Weiss", houseNumber: "4",
      street: "WALKER DR", floorSide: null, publicationIds: [] },
  ];
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const row = rowsFromGrid(
    [["customers.last_name", "addresses.addr"], ["Gittel David", "4 Walter Dr"]],
    { defaultAction: "add" },
  )[0];
  row.publication = "voice";
  const plan = planRow(row, stops, pubs, buildStreetZoneMap(stops));

  assert.equal(plan.status, "blocked");
  assert.match(plan.message, /WALTER DR is not on any of our routes/);
  // Gittel David is not Weiss, so there is nothing tying 4 Walter Dr to our
  // 4 Walker Dr beyond a house number this branch was always going to find.
});

// --- Counting per address (Ari, 2026-08-21) --------------------------------
//
// The rule: compare how many households the roster lists at an address against
// how many lines we deliver there. Equal -> nothing to do. More -> add that
// many. More than the house can hold -> flag. Never decide which unit is which.
//
// Before this, a two-family house produced "2 addresses match -- pick one" and
// stopped. On the real 27 Aug Voice roster that was 486 of 582 questions.

const twoFamily = (): ExistingStop[] => [
  { id: "b-upstairs", zoneId: "z1", zoneNumber: 1, recipientName: "KISS", houseNumber: "118",
    street: "CHATEAU DR", floorSide: "upstairs", publicationIds: ["pub-v"] },
  { id: "a-basement", zoneId: "z1", zoneNumber: 1, recipientName: "BEER", houseNumber: "118",
    street: "CHATEAU DR", floorSide: "basement", publicationIds: ["pub-v"] },
];
const PUBS = [{ id: "pub-v", code: "voice", name: "The Voice" }];
const rosterRow = (name: string, addr: string) => {
  const row = rowsFromGrid(
    [["customers.last_name", "addresses.addr"], [name, addr]],
    { defaultAction: "add" },
  )[0];
  row.publication = "voice";
  return row;
};
/** One roster row at `addr`, settled against `stops` alongside `others`. */
const plan = (
  stops: ExistingStop[],
  addr: string,
  count: { fileAtAddress: number; occurrence: number },
  rows?: { floorSide: string | null; name: string | null }[],
) => {
  const fileRows =
    rows ??
    Array.from({ length: count.fileAtAddress }, (_, i) => ({
      floorSide: null,
      // Distinct surnames, or the duplicate-household guard fires -- which it
      // should, and does: see the dedicated test below.
      name: `Family ${["Aronowitz", "Bergman", "Deutsch", "Eisen"][i] ?? `Name${i}`}`,
    }));
  return planRow(rosterRow(fileRows[count.occurrence - 1].name ?? "Family Someone", addr), stops, PUBS,
    buildStreetZoneMap(stops), new Map(), buildStopIndex(stops),
    { fileRows, index: count.occurrence - 1 });
};

test("counting: as many households listed as we deliver is no change, and no question", () => {
  const stops = twoFamily();
  for (const occurrence of [1, 2]) {
    const p = plan(stops, "118 Chateau Dr", { fileAtAddress: 2, occurrence });
    assert.equal(p.status, "no_change", `occurrence ${occurrence}`);
    assert.doesNotMatch(p.message, /pick one/);
  }
});

test("counting: one listed where we deliver two is still no change — never a guess at which", () => {
  // 118 Chateau Dr holds upstairs KISS and basement BEER. The file naming only
  // "Family Kiss" does not mean BEER cancelled, and it certainly does not tell
  // us which line to touch.
  const p = plan(twoFamily(), "118 Chateau Dr", { fileAtAddress: 1, occurrence: 1 });
  assert.equal(p.status, "no_change");
});

test("counting: an extra household attaches to a line we already hold, rather than inventing a door", () => {
  const stops = twoFamily();
  stops[1].publicationIds = []; // basement does not get The Voice yet
  const first = plan(stops, "118 Chateau Dr", { fileAtAddress: 2, occurrence: 1 });
  assert.equal(first.status, "no_change");
  const second = plan(stops, "118 Chateau Dr", { fileAtAddress: 2, occurrence: 2 });
  assert.equal(second.status, "ready");
  assert.equal(second.stopId, "a-basement", "attaches to the existing line lacking the publication");
  assert.equal(second.newStop, null, "and does NOT create a second address record");
});

test("counting: a second household at a house we hold one line for is proposed, not applied", () => {
  // create_stop_in_route appends at max(sequence) + 1, and every production route
  // ends with DONE at that maximum -- so applying this would print the delivery
  // below the marker the driver stops at. It names the line to sit beside and
  // waits for a person.
  const stops = [twoFamily()[0]];
  const p = plan(stops, "118 Chateau Dr", { fileAtAddress: 2, occurrence: 2 });
  assert.equal(p.status, "needs_choice");
  assert.match(p.message, /add it next to/);
  assert.match(p.message, /past DONE/);
  // The zone still comes from the line already there, not from the street --
  // a street can span two routes.
  assert.equal(p.newStop?.zoneId, "z1");
});

test("counting: more households than a house can hold is flagged, not applied (Ari, 2026-08-30)", () => {
  // 10 Flannery Ave: the file lists three households at a two-apartment house.
  // "there shouldn't be more than two to one single family house. that should
  // be flagged."
  const p = plan(twoFamily(), "118 Chateau Dr", { fileAtAddress: 3, occurrence: 3 });
  assert.equal(p.status, "needs_choice");
  assert.match(p.message, /3 households at this address but the house has 2/);
});

test("counting: a real apartment block holding more than two lines is not strange", () => {
  const stops: ExistingStop[] = Array.from({ length: 5 }, (_, i) => ({
    id: `apt${i}`, zoneId: "z5", zoneNumber: 5, recipientName: "LEISURE CHATEAU",
    houseNumber: "962", street: "RIVER AVE", floorSide: null, publicationIds: ["pub-v"],
  }));
  const p = plan(stops, "962 River Ave", { fileAtAddress: 4, occurrence: 4 });
  assert.equal(p.status, "no_change");
});

test("counting never fires when the ADDRESS itself is in doubt", () => {
  // WALTER DR against our WALKER DR is one edit. Counting a household onto an
  // address we are not sure of is the wrong kind of confidence, so the near-miss
  // still goes to a person -- and the message keeps the reason.
  const stops: ExistingStop[] = [
    { id: "s1", zoneId: "z1", zoneNumber: 1, recipientName: "Weiss", houseNumber: "4",
      street: "WALKER DR", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "s2", zoneId: "z1", zoneNumber: 1, recipientName: "Stern", houseNumber: "4",
      street: "WALKER DR", floorSide: "basement", publicationIds: ["pub-v"] },
  ];
  const p = plan(stops, "4 Walter Dr", { fileAtAddress: 1, occurrence: 1 });
  // No surname agrees, so WALTER DR is simply not one of our streets -- counting
  // must not fire, and there is nothing for the office to decide.
  assert.equal(p.status, "blocked");
  assert.match(p.message, /WALTER DR is not on any of our routes/);
});

test("an address the master list does not carry loses EVERY line, not one (Ari, 2026-08-30)", () => {
  // 962 River Ave holds five Leisure Chateau lines. Deduping on the address left
  // four papers going out every week.
  const stops: ExistingStop[] = Array.from({ length: 5 }, (_, i) => ({
    id: `apt${i}`, zoneId: "z5", zoneNumber: 5, recipientName: "LEISURE CHATEAU",
    houseNumber: "962", street: "RIVER AVE", floorSide: null, publicationIds: ["pub-v"],
  }));
  stops.push({ id: "other", zoneId: "z5", zoneNumber: 5, recipientName: "Preschel",
    houseNumber: "809", street: "RIVER AVE", floorSide: null, publicationIds: ["pub-v"] });
  stops.push({ id: "listed", zoneId: "z5", zoneNumber: 5, recipientName: "Green",
    houseNumber: "611", street: "RIVER AVE", floorSide: null, publicationIds: ["pub-v"] });
  // The roster names River Ave, so absence on it means something. Since Ari's
  // 2026-09-01 River Ave ruling, naming the street at all is what covers it --
  // the named address no longer has to be one we hold.
  const fileStreets = streets({ "RIVER AVE": ["611"] });
  const removals = planRosterRemovals(stops, { id: "pub-v", name: "The Voice" }, fileStreets, 100);
  assert.equal(removals.length, 6, "five lines at 962 plus one at 809; 611 is listed and kept");
  assert.deepEqual(
    removals.map((r) => r.stopId).sort(),
    ["apt0", "apt1", "apt2", "apt3", "apt4", "other"],
  );
});

test("an address cell we cannot read is marked unreadable, not filed under 'not on our routes'", () => {
  const row = rowsFromGrid(
    [["customers.last_name", "addresses.addr"], ["Family Klein", "Meadowood Road 429"]],
    { defaultAction: "add" },
  )[0];
  row.publication = "voice";
  const p = planRow(row, [], PUBS, new Map());
  assert.equal(p.status, "blocked");
  assert.equal(p.unreadable, true);
});

// --- The door the file names is the door that gets the paper ---------------
//
// Ari, 2026-08-31: "if the listed address has a specific door that it should go
// to, then the driver follows that. If there are no specific instructions, then
// the driver will decide where to throw it." So a stated door is an instruction,
// not a hint, and pairing on it is not optional.

const grassmere = (): ExistingStop[] => [
  // uuid order deliberately puts the WRONG line first: the first version sorted
  // spare lines by id and served upstairs while the file named the basement.
  { id: "366ac1cf", zoneId: "z3", zoneNumber: 3, recipientName: "COHEN", houseNumber: "5",
    street: "GRASSMERE ST", floorSide: "upstairs", publicationIds: [] },
  { id: "40cd0f76", zoneId: "z3", zoneNumber: 3, recipientName: "LAN", houseNumber: "5",
    street: "GRASSMERE ST", floorSide: "basement", publicationIds: [] },
];

test("a stated door pairs with that door, not with whichever line sorts first", () => {
  const fileRows = [{ floorSide: "Basement", name: "Shani and Aaron tzvi Lan" }];
  const p = planRow(rosterRow("Shani and Aaron tzvi Lan", "5 Grassmere St"), grassmere(), PUBS,
    buildStreetZoneMap(grassmere()), new Map(), buildStopIndex(grassmere()), { fileRows, index: 0 });
  assert.equal(p.status, "ready");
  assert.equal(p.stopId, "40cd0f76", "the basement line the file names, not the upstairs one");
});

test("the chosen line is always among the candidates offered", () => {
  // Seven ready rows on the real roster carried a stopId that was not in their
  // own candidates, so the office could not see or correct the door.
  const fileRows = [{ floorSide: "Basement", name: "Lan" }];
  const p = planRow(rosterRow("Lan", "5 Grassmere St"), grassmere(), PUBS,
    buildStreetZoneMap(grassmere()), new Map(), buildStopIndex(grassmere()), { fileRows, index: 0 });
  assert.ok(p.candidates.some((c) => c.stopId === p.stopId), "stopId must be offered");
  assert.equal(p.candidates.length, 2, "both doors offered so the office can switch");
});

test("a new line carries the door the file states, and never one we already serve", () => {
  // 39 RENA LN: we hold upstairs Neumann with the paper; the file lists Neumann
  // (upstairs) and Strickman (basement). The first version created a SECOND
  // upstairs line and left the basement household with nothing.
  const stops: ExistingStop[] = [
    { id: "s-up", zoneId: "z2", zoneNumber: 2, recipientName: "Neumann", houseNumber: "39",
      street: "RENA LN", floorSide: "upstairs", publicationIds: ["pub-v"] },
  ];
  const fileRows = [
    { floorSide: "Basement", name: "Family Strickman" },
    { floorSide: "Upstairs", name: "Family Neumann" },
  ];
  const settled = fileRows.map((_, index) =>
    planRow(rosterRow(fileRows[index].name, "39 Rena Ln"), stops, PUBS,
      buildStreetZoneMap(stops), new Map(), buildStopIndex(stops), { fileRows, index }),
  );
  assert.equal(settled[1].status, "no_change", "the upstairs household is already served");
  // Proposed rather than applied -- see the DONE-marker problem above -- but the
  // door it carries is still the one the file asked for.
  assert.equal(settled[0].status, "needs_choice");
  assert.equal(settled[0].newStop?.floorSide, "Basement", "the door the file asked for");
});

test("settling an address does not depend on the order rows appear in the file", () => {
  // Shuffling rows within an address changed the created line 94 times over five
  // trials, because occurrence indexed file order rather than matching doors.
  const stops: ExistingStop[] = [
    { id: "s-up", zoneId: "z2", zoneNumber: 2, recipientName: "Neumann", houseNumber: "39",
      street: "RENA LN", floorSide: "upstairs", publicationIds: ["pub-v"] },
  ];
  const forward = [
    { floorSide: "Basement", name: "Family Strickman" },
    { floorSide: "Upstairs", name: "Family Neumann" },
  ];
  const shape = (rows: typeof forward) =>
    settleAddress(stops, rows, "pub-v").map((o) =>
      o.kind === "create" ? `create:${o.floorSide}` : o.kind,
    );
  assert.deepEqual(shape(forward), ["create:Basement", "no_change"]);
  assert.deepEqual(shape([...forward].reverse()), ["no_change", "create:Basement"]);
});

test("no door is ever invented — a silent file gets a silent line", () => {
  const stops: ExistingStop[] = [
    { id: "s1", zoneId: "z1", zoneNumber: 1, recipientName: "Klein", houseNumber: "7",
      street: "JUNIPER LN", floorSide: null, publicationIds: ["pub-v"] },
  ];
  const fileRows = [{ floorSide: null, name: "Klein" }, { floorSide: null, name: "Roth" }];
  const settled = settleAddress(stops, fileRows, "pub-v");
  const created = settled.find((o) => o.kind === "create");
  assert.equal(created?.kind === "create" ? created.floorSide : "MISSING", null);
});

test("a blind write at a crowded address asks — counting only this publication's lines", () => {
  // 419 CEDAR BRIDGE AVE carries 23 deliveries and apartment numbers live in
  // the instructions column, which the matcher does not load — so an UNDIRECTED
  // write there goes to a person. But the crowd is counted per publication:
  // Ari, 2026-09-01, shown 16 CHELSEA CT asking because a Shopper/BP line made
  // the address look crowded: "there is also one for other publications — that
  // should not be taken into consideration when we're discussing The Voice
  // list."
  const mk = (i: number, pubs: string[]): ExistingStop => ({
    id: `apt${i}`, zoneId: "z1", zoneNumber: 1, recipientName: null, houseNumber: "419",
    street: "CEDAR BRIDGE AVE", floorSide: null, publicationIds: pubs,
  });
  // Four Voice lines: crowded for The Voice, so undirected extra rows ask.
  const voiceCrowd = [0, 1, 2, 3].map((i) => mk(i, ["pub-v"])).concat([mk(4, [])]);
  const fileRows = Array.from({ length: 5 }, (_, i) => ({ floorSide: null, name: `Family ${"ABCDE"[i]}ronowitz` }));
  const settled = settleAddress(voiceCrowd, fileRows, "pub-v");
  assert.equal(settled.filter((o) => o.kind === "no_change").length, 4);
  assert.equal(settled.filter((o) => o.kind === "ask").length, 1, "the undirected fifth goes to a person");

  // Two Voice lines beside three other-publication lines: NOT crowded for The
  // Voice — the other publications are not taken into consideration.
  const otherCrowd = [0, 1].map((i) => mk(i, ["pub-v"])).concat([2, 3, 4].map((i) => mk(i, ["pub-s"])));
  const two = settleAddress(otherCrowd, fileRows.slice(0, 3), "pub-v");
  assert.equal(two.filter((o) => o.kind === "ask").length, 0);
});
test("the list naming one household twice IS two papers — the master list is followed", () => {
  // Ari, 2026-09-01, shown "one paper or two?" on 18 BRIDGEWOOD AVE: "you
  // shouldn't be asking the question because we always follow the master list.
  // Take off all questions that are similar to this." A repeated identity is a
  // count like any other row; a wrong extra paper is the safe side of the
  // asymmetry, and the copy-count encoding question travels with the first
  // packet as a question about the FILE, not about addresses.
  const stops: ExistingStop[] = [
    { id: "s1", zoneId: "z1", zoneNumber: 1, recipientName: "Ellenbogen", houseNumber: "8",
      street: "SHENANDOAH DR", floorSide: "upstairs", publicationIds: ["pub-v"] },
  ];
  const settled = settleAddress(stops, [
    { floorSide: null, name: "Ellenbogen" },
    { floorSide: null, name: "Family Ellenbogen" },
  ], "pub-v");
  // One row pairs with the served line; the second is a plain addition.
  assert.deepEqual(settled.map((o) => o.kind).sort(), ["create", "no_change"]);
});
test("two households sharing a surname but naming different doors are two households", () => {
  const stops: ExistingStop[] = [
    { id: "s1", zoneId: "z1", zoneNumber: 1, recipientName: "Greenwald", houseNumber: "7",
      street: "KENYON DR", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "s2", zoneId: "z1", zoneNumber: 1, recipientName: "Greenwald", houseNumber: "7",
      street: "KENYON DR", floorSide: "basement", publicationIds: [] },
  ];
  const settled = settleAddress(stops, [
    { floorSide: "Upstairs", name: "Chana Greenwald" },
    { floorSide: "Basement", name: "Family Greenwald" },
  ], "pub-v");
  assert.equal(settled[0].kind, "no_change");
  assert.equal(settled[1].kind, "attach");
});

test("the master list wins the door: the move is an attach, not a question", () => {
  // 5 GRASSMERE ST: the file names the basement; the paper goes upstairs. This
  // used to ask "has this household moved?" — Ari, 2026-09-01, shown 33 CUSHMAN
  // ST still asking: "a conflict between the master list and the courier's list
  // — you should always be following the master list. Why is it still on the
  // question list?" So the row attaches at the named door, and the upstairs
  // line goes unclaimed — surplusServedLines turns it into a visible cut row.
  const stops: ExistingStop[] = [
    { id: "up", zoneId: "z3", zoneNumber: 3, recipientName: "COHEN", houseNumber: "5",
      street: "GRASSMERE ST", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "bs", zoneId: "z3", zoneNumber: 3, recipientName: "LAN", houseNumber: "5",
      street: "GRASSMERE ST", floorSide: "basement", publicationIds: [] },
  ];
  const settled = settleAddress(stops, [{ floorSide: "Basement", name: "Lan" }], "pub-v");
  assert.equal(settled[0].kind, "attach");
  assert.equal(settled[0].kind === "attach" ? settled[0].stopId : "", "bs");
  assert.deepEqual(surplusServedLines(stops, settled, "pub-v").map((l) => l.id), ["up"]);
});
test("the same door mismatch IS a plain addition when the list asks for more papers", () => {
  const stops: ExistingStop[] = [
    { id: "up", zoneId: "z3", zoneNumber: 3, recipientName: "COHEN", houseNumber: "5",
      street: "GRASSMERE ST", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "bs", zoneId: "z3", zoneNumber: 3, recipientName: "LAN", houseNumber: "5",
      street: "GRASSMERE ST", floorSide: "basement", publicationIds: [] },
  ];
  const settled = settleAddress(stops, [
    { floorSide: "Upstairs", name: "Cohen" },
    { floorSide: "Basement", name: "Lan" },
  ], "pub-v");
  assert.equal(settled[0].kind, "no_change");
  assert.equal(settled[1].kind, "attach");
});

test("an unlabelled line is no instruction, not a different door", () => {
  // 913 CLAIRE DR: one line, no floor label, already gets the paper. The file
  // names "Upstairs". That is not a contradiction -- there is no instruction on
  // the line, so per Ari the driver decides, and the paper already goes there.
  // Reading it as a mismatch produced 122 spurious "has this household moved?"
  // questions on the real roster.
  const stops: ExistingStop[] = [
    { id: "s1", zoneId: "z4", zoneNumber: 4, recipientName: "Pachtinger", houseNumber: "913",
      street: "CLAIRE DR", floorSide: null, publicationIds: ["pub-v"] },
  ];
  const settled = settleAddress(stops, [{ floorSide: "Upstairs", name: "Family Pachtinger" }], "pub-v");
  assert.deepEqual(settled, [{ kind: "no_change", stopId: "s1" }]);
});

test("where the count is already met, the paper is credited to the line that has it", () => {
  // 974 PRINCEWOOD AVE: two unlabelled lines, one served. The file lists one
  // household. Pairing with the UNSERVED line would read as a move and ask a
  // question with no answer; the count is met and nothing needs doing.
  const stops: ExistingStop[] = [
    { id: "a-none", zoneId: "z5", zoneNumber: 5, recipientName: null, houseNumber: "974",
      street: "PRINCEWOOD AVE", floorSide: null, publicationIds: [] },
    { id: "b-has", zoneId: "z5", zoneNumber: 5, recipientName: "BURSZTYN", houseNumber: "974",
      street: "PRINCEWOOD AVE", floorSide: null, publicationIds: ["pub-v"] },
  ];
  const settled = settleAddress(stops, [{ floorSide: null, name: "Yehoshua & Kayla BURSZTYN" }], "pub-v");
  assert.deepEqual(settled, [{ kind: "no_change", stopId: "b-has" }]);
});

test("both halves of a move surface as review rows through the real planner", () => {
  // The whole move, end to end: the file names the basement once; we serve the
  // upstairs. The plan shows an add row at the basement AND a cut row for the
  // upstairs line — the master list followed, nothing silent, nothing asked.
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const stops: ExistingStop[] = [
    { id: "up", zoneId: "z3", zoneNumber: 3, recipientName: "SCHACHTER", houseNumber: "33",
      street: "CUSHMAN ST", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "bs", zoneId: "z3", zoneNumber: 3, recipientName: "SABEL", houseNumber: "33",
      street: "CUSHMAN ST", floorSide: "basement", publicationIds: ["pub-b"] },
  ];
  const file = rowsFromGrid(
    [["customers.last_name", "addresses.addr", "addresses.extended_addr"],
     ["Suri & Lazer Sabel", "33 Cushman St", "Basement"]],
    { defaultAction: "add" });
  const out = planRoster(file, stops, pubs, "pub-v");
  const add = out.rows!.find((r) => r.action === "add")!;
  assert.equal(add.status, "ready");
  assert.equal(add.stopId, "bs");
  const cut = out.rows!.filter((r) => r.surplusLine);
  assert.equal(cut.length, 1);
  assert.equal(cut[0].stopId, "up");
});
test("counting repeated identities is order-independent", () => {
  // The old duplicate machinery's history was order-dependence; the follow-the-
  // master-list rule must not reintroduce it. Both orders settle identically.
  const stops: ExistingStop[] = [
    { id: "s1", zoneId: "z1", zoneNumber: 1, recipientName: "Ellenbogen", houseNumber: "8",
      street: "SHENANDOAH DR", floorSide: "upstairs", publicationIds: ["pub-v"] },
  ];
  const rows = [
    { floorSide: null, name: "Ellenbogen" },
    { floorSide: "Upstairs", name: "Family Ellenbogen" },
  ];
  const kinds = (r: typeof rows) => settleAddress(stops, r, "pub-v").map((o) => o.kind).sort();
  assert.deepEqual(kinds(rows), kinds([...rows].reverse()));
});
// --- Coverage is a strict test; suppression stays loose --------------------

test("a street the roster never names is NOT covered, even by a street one letter away", () => {
  // RIDER ST (we deliver 20 and 30) against RIVER AVE: stripStreetSuffix gives
  // "rider" and "river", one edit apart. The loose test is right for suppressing
  // a removal and wrong for enabling one. Measured: this alone made all 7 of our
  // River Ave addresses removable with no River Ave row in the file.
  const stops: ExistingStop[] = ["203", "227", "962"].map((h) => ({
    id: `r${h}`, zoneId: "z5", zoneNumber: 5, recipientName: `House ${h}`, houseNumber: h,
    street: "RIVER AVE", floorSide: null, publicationIds: ["pub-v"],
  }));
  const pub = { id: "pub-v", name: "The Voice" };
  assert.equal(planRosterRemovals(stops, pub, streets({ "RIDER ST": ["20", "30"] }), 1).length, 0);
  // And PINE/VINE, which collides on our own streets: stripStreetSuffix makes
  // PINE BLVD and PINE ST identical, and PINE/VINE one edit apart.
  const pine: ExistingStop[] = ["150", "152", "270"].map((h) => ({
    id: `p${h}`, zoneId: "z2", zoneNumber: 2, recipientName: null, houseNumber: h,
    street: "PINE ST", floorSide: null, publicationIds: ["pub-v"],
  }));
  assert.equal(planRosterRemovals(pine, pub, streets({ "VINE ST": ["580", "736"] }), 1).length, 0);
  assert.equal(planRosterRemovals(pine, pub, streets({ "PINE BLVD": ["1", "3"] }), 1).length, 0);
  // A bare base word IS the same street, so it still counts as covered.
  assert.equal(planRosterRemovals(pine, pub, streets({ "PINE": ["150"] }), 1).length, 2);
});

test("a bare base word covers a street only when we deliver exactly one street with that base", () => {
  // The real file drops suffixes (PONDEROSA, 6 SHENANDOAH), and the delivery
  // area holds same-base pairs like PINE ST / PINE BLVD and OAK ST / OAK LN. A
  // bare PINE row could be Pine Blvd's with the suffix dropped, and covering a
  // street is what ENABLES removals on it -- so with two PINE streets on the
  // round, bare PINE covers neither. This is the recorded suffix rule ("a
  // missing suffix may match only when exactly one of our streets has that base
  // name") pointed at the removal direction.
  const pub = { id: "pub-v", name: "The Voice" };
  const mk = (id: string, house: string, street: string): ExistingStop => ({
    id, zoneId: "z2", zoneNumber: 2, recipientName: null, houseNumber: house,
    street, floorSide: null, publicationIds: ["pub-v"],
  });
  const both = [mk("ps1", "150", "PINE ST"), mk("ps2", "152", "PINE ST"), mk("pb1", "3", "PINE BLVD")];
  assert.equal(planRosterRemovals(both, pub, streets({ "PINE": ["1"] }), 1).length, 0);
  // With only one PINE street on the round, the bare word can only mean it.
  const one = [mk("ps1", "150", "PINE ST"), mk("ps2", "152", "PINE ST")];
  assert.equal(planRosterRemovals(one, pub, streets({ "PINE": ["150"] }), 1).length, 1);
});

test("a new door on the other side of an all-even street is a question, not a creation", () => {
  // 12 of the 18 brand-new doors on the 27 Aug roster were odd-side Pine St
  // 151-233, against 21 stops all even 150-270. A single lo..hi range passed
  // every one, because 151-233 sits inside 150-270. docs/handoff.md lists this
  // as OPEN and says lakewood-courier-routing should place them first.
  const stops: ExistingStop[] = ["150", "152", "198", "200", "204", "268", "270"].map((h) => ({
    id: `p${h}`, zoneId: "z2", zoneNumber: 2, recipientName: null, houseNumber: h,
    street: "PINE ST", floorSide: null, publicationIds: [],
  }));
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const row = (house: string) => {
    const r = rowsFromGrid([["customers.last_name", "addresses.addr"], ["Family Bandman", `${house} Pine St`]],
      { defaultAction: "add" })[0];
    r.publication = "voice";
    return r;
  };
  const odd = planRow(row("233"), stops, pubs, buildStreetZoneMap(stops));
  assert.equal(odd.status, "needs_choice");
  assert.match(odd.message, /every PINE ST number we deliver is even/);

  // An even number in the gap between the two blocks has no neighbour either.
  const gap = planRow(row("176"), stops, pubs, buildStreetZoneMap(stops));
  assert.equal(gap.status, "needs_choice");
  assert.match(gap.message, /gap between 152 and 198/);

  // Ordinary infill between two neighbours we already deliver is still an
  // ordinary new address.
  const infill = planRow(row("202"), stops, pubs, buildStreetZoneMap(stops));
  assert.equal(infill.status, "needs_choice");
  assert.match(infill.message, /add it between 200 and 204 in the route/);
  assert.match(infill.message, /past DONE/);
  // The address is still carried through, so the office can accept it.
  assert.equal(infill.newStop?.houseNumber, "202");
});

test("three households at a door we deliver to none of is a question", () => {
  // 233 PINE ST has three roster rows. settleAddress is gated on holding at
  // least one line there, so each created independently -- the "never write to
  // more than two lines blind" rule was skipped at the address we know least
  // about.
  const stops: ExistingStop[] = ["150", "152"].map((h) => ({
    id: `p${h}`, zoneId: "z2", zoneNumber: 2, recipientName: null, houseNumber: h,
    street: "PINE ST", floorSide: null, publicationIds: [],
  }));
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const r = rowsFromGrid([["customers.last_name", "addresses.addr"], ["Bandman", "151 Pine St"]],
    { defaultAction: "add" })[0];
  r.publication = "voice";
  const fileRows = [
    { floorSide: null, name: "Sarala Bandman" },
    { floorSide: null, name: "Shloimy Silverstone" },
    { floorSide: null, name: "Dovid Spitzer" },
  ];
  const p = planRow(r, stops, pubs, buildStreetZoneMap(stops), new Map(), buildStopIndex(stops),
    { fileRows, index: 0 });
  assert.equal(p.status, "needs_choice");
  assert.match(p.message, /3 households at this address and we deliver to none/);
});

test("a doubled upload trips the addition guard, which the removal side always had", () => {
  // The 27 Aug roster produces 41 ready rows against 1,102 Voice addresses, so
  // the floor sits above a normal first run. Deliberately looser than the removal
  // guard: a wrong addition wastes a paper, a wrong deletion loses a subscriber.
  assert.equal(additionsLookWrong(41, 1102).tripped, false);
  assert.equal(additionsLookWrong(41, 1102).limit, 165);
  // A file pasted together with itself.
  assert.equal(additionsLookWrong(600, 1102).tripped, true);
  // And a small publication is not held to a proportional limit that rounds to
  // nothing -- the floor is 40.
  assert.equal(additionsLookWrong(30, 20).tripped, false);
  assert.equal(additionsLookWrong(41, 20).tripped, true);
});

test("a create carries the line count it was planned against", () => {
  // applyImport compares this against the list it re-reads, so an address added
  // by hand between Review and Apply is not created twice. A create has no id to
  // validate -- the address simply exists now and did not before.
  const stops: ExistingStop[] = [
    { id: "s-up", zoneId: "z2", zoneNumber: 2, recipientName: "Neumann", houseNumber: "39",
      street: "RENA LN", floorSide: "upstairs", publicationIds: ["pub-v"] },
  ];
  const fileRows = [
    { floorSide: "Basement", name: "Family Strickman" },
    { floorSide: "Upstairs", name: "Family Neumann" },
  ];
  const p = planRow(rosterRow("Family Strickman", "39 Rena Ln"), stops, PUBS,
    buildStreetZoneMap(stops), new Map(), buildStopIndex(stops), { fileRows, index: 0 });
  assert.equal(p.newStop?.linesAtPlanTime, 1);
});

test("two subscriptions sharing a surname at one address are two households, not a duplicate", () => {
  // 2 Shenandoah Drive lists "Minna Goldstone" and "Ari Goldstone"; 67 Finchley
  // Blvd lists two Teitelbaums with sequential ids. Measured on the 27 Aug
  // roster: of 32 pairs sharing a surname at one of our addresses, ALL 32 carry
  // different customer ids. The surname guess asked 20 questions that had an
  // answer sitting in a column the parser was discarding.
  const stops: ExistingStop[] = [
    { id: "s1", zoneId: "z1", zoneNumber: 1, recipientName: "Goldstone", houseNumber: "2",
      street: "SHENANDOAH DR", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "s2", zoneId: "z1", zoneNumber: 1, recipientName: "Goldstone", houseNumber: "2",
      street: "SHENANDOAH DR", floorSide: "basement", publicationIds: [] },
  ];
  const settled = settleAddress(stops, [
    { floorSide: null, name: "Minna Goldstone", externalId: "169xltUF" },
    { floorSide: null, name: "Ari Goldstone", externalId: "16BVFMUN" },
  ], "pub-v");
  assert.deepEqual(settled.map((o) => o.kind).sort(), ["attach", "no_change"]);
});

test("the SAME subscription listed twice is two copies — the master list is followed", () => {
  // 25 ids repeat across 53 rows in the real file, and where it also states a
  // count in text the two agree: the repeats ARE the copies. Ari's 2026-09-01
  // rule makes this a count, not a question.
  const stops: ExistingStop[] = [
    { id: "s1", zoneId: "z1", zoneNumber: 1, recipientName: "Klein", houseNumber: "3",
      street: "MAPLEHURST AVE", floorSide: null, publicationIds: ["pub-v"] },
  ];
  const settled = settleAddress(stops, [
    { floorSide: null, name: "Family Klein", externalId: "16CY4gUP" },
    { floorSide: null, name: "Family Klein", externalId: "16CY4gUP" },
  ], "pub-v");
  assert.deepEqual(settled.map((o) => o.kind).sort(), ["create", "no_change"]);
});
test("a second row sharing a surname is a plain addition, not a question", () => {
  const stops: ExistingStop[] = [
    { id: "s1", zoneId: "z1", zoneNumber: 1, recipientName: "Ellenbogen", houseNumber: "8",
      street: "SHENANDOAH DR", floorSide: "upstairs", publicationIds: ["pub-v"] },
  ];
  const settled = settleAddress(stops, [
    { floorSide: null, name: "Ellenbogen" },
    { floorSide: "Upstairs", name: "Family Ellenbogen" },
  ], "pub-v");
  assert.equal(settled.filter((o) => o.kind === "ask").length, 0);
});
test("the parser keeps the publication's own subscriber id", () => {
  const rows = rowsFromGrid(
    [["customers.id", "customers.last_name", "addresses.addr"],
     ["16BhJEV75Wr9g8KNt", "Klein", "12 Juniper Ln"]],
    { defaultAction: "add" },
  );
  assert.equal(rows[0].externalId, "16BhJEV75Wr9g8KNt");
});

test("a row counter named ID cannot stand in for the subscriber id", () => {
  // Resolved by specificity, not by column position: a file carrying both `ID`
  // (a counter) and `customers.id` used to take whichever came first, so a
  // counter could decide whether a household gets one paper or two.
  const rows = rowsFromGrid(
    [["ID", "customers.id", "customers.last_name", "addresses.addr"],
     ["41", "16CY4gUP", "Klein", "12 Juniper Ln"]],
    { defaultAction: "add" },
  );
  assert.equal(rows[0].externalId, "16CY4gUP");
  // And a bare "id" alone is not treated as a subscriber id at all.
  const counterOnly = rowsFromGrid(
    [["ID", "customers.last_name", "addresses.addr"], ["41", "Klein", "12 Juniper Ln"]],
    { defaultAction: "add" },
  );
  assert.equal(counterOnly[0].externalId, null);
});

test("repeated identities count as papers under the follow-the-master-list rule", () => {
  // Two rows for Family Klein at a two-line address: one pairs, the other
  // attaches to the second line. Under Ari's 2026-09-01 rule the count is
  // followed whatever the ids say — the tail-row provenance question travels
  // with the first packet as a question about the FILE.
  const stops: ExistingStop[] = [
    { id: "s1", zoneId: "z1", zoneNumber: 1, recipientName: "Klein", houseNumber: "12",
      street: "JUNIPER LN", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "s2", zoneId: "z1", zoneNumber: 1, recipientName: "Klein", houseNumber: "12",
      street: "JUNIPER LN", floorSide: "basement", publicationIds: [] },
  ];
  const settled = settleAddress(stops, [
    { floorSide: null, name: "Family Klein", externalId: "16CY4gUP" },
    { floorSide: null, name: "Family Klein", externalId: "zone1_7" },
  ], "pub-v");
  assert.deepEqual(settled.map((o) => o.kind).sort(), ["attach", "no_change"]);
});
test("a question that offers a new address carries the address's real line count", () => {
  // The ask branch built its newStop with linesAtPlanTime hardcoded to 0, so if
  // the office answered by picking "Add as a new address", applyImport compared
  // the live count against 0, decided the premise had moved, and skipped the row
  // -- silently. 41 of the 187 rows offering that choice were in this state.
  const stops: ExistingStop[] = [
    { id: "up", zoneId: "z4", zoneNumber: 4, recipientName: "Olsberg", houseNumber: "142",
      street: "CHATEAU DR", floorSide: "upstairs", publicationIds: ["pub-v"] },
  ];
  const p = planRow(rosterRow("Rochel Neiman", "142 Chateau Dr"), stops, PUBS,
    buildStreetZoneMap(stops), new Map(), buildStopIndex(stops),
    { fileRows: [{ floorSide: "Basement", name: "Rochel Neiman" }], index: 0 });
  assert.equal(p.status, "needs_choice");
  assert.equal(p.newStop?.linesAtPlanTime, 1, "not 0 — the address holds one line");
});

test("the duplicate reason does not depend on which pair is visited last", () => {
  // Three rows, all surname Klein, two sharing an id. The weaker surname
  // evidence used to overwrite the stronger same-id reason whenever it was
  // visited last, so the wording depended on row order.
  const stops: ExistingStop[] = [
    { id: "s1", zoneId: "z1", zoneNumber: 1, recipientName: "Klein", houseNumber: "3",
      street: "MAPLEHURST AVE", floorSide: null, publicationIds: ["pub-v"] },
  ];
  const rows = [
    { floorSide: null, name: "Family Klein", externalId: "X1" },
    { floorSide: null, name: "Family Klein", externalId: "X1" },
    { floorSide: null, name: "Family Klein" },
  ];
  const reasons = (r: typeof rows) =>
    settleAddress(stops, r, "pub-v")
      .filter((o) => o.kind === "ask")
      .map((o) => (o.kind === "ask" ? o.reason : ""))
      .sort();
  assert.deepEqual(reasons(rows), reasons([rows[2], rows[0], rows[1]]));
});

test("one roster row on a street covers it, even at an address we do not hold", () => {
  // The 27 Aug file has exactly one River Ave row in 19,621 -- 611 River Ave, an
  // address we do not hold. An earlier rule read that as the publication failing
  // to send us the street and held all 7 of our River Ave addresses back from
  // removal. Ari corrected it (2026-08-31/2026-09-01): River Ave is a commercial
  // road, so one subscriber row is expected, and its unlisted addresses are
  // removals like any other. Only a street the file never names at all is
  // protected -- see the RIDER ST test above.
  const stops: ExistingStop[] = ["203", "227", "962"].map((h) => ({
    id: `r${h}`, zoneId: "z5", zoneNumber: 5, recipientName: `House ${h}`, houseNumber: h,
    street: "RIVER AVE", floorSide: null, publicationIds: ["pub-v"],
  }));
  const pub = { id: "pub-v", name: "The Voice" };
  // One row at an address we do not hold still covers the street.
  assert.equal(planRosterRemovals(stops, pub, streets({ "RIVER AVE": ["611"] }), 1).length, 3);
  // Naming one we hold keeps that one and removes the rest, as before.
  assert.equal(planRosterRemovals(stops, pub, streets({ "RIVER AVE": ["227"] }), 1).length, 2);
});

test("a brand-new address in range is proposed with its neighbours, never applied", () => {
  // 1021 HEARTHSTONE DR was auto-created: range, parity and gap checks all pass
  // rightly, and create_stop_in_route appends past DONE. "Nothing is
  // auto-created" was true only of the second-household path.
  const stops: ExistingStop[] = ["1020", "1025"].map((h) => ({
    id: `h${h}`, zoneId: "z4", zoneNumber: 4, recipientName: null, houseNumber: h,
    street: "HEARTHSTONE DR", floorSide: null, publicationIds: [],
  }));
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const r = rowsFromGrid([["customers.last_name", "addresses.addr"], ["Family Ort", "1021 Hearthstone Dr"]],
    { defaultAction: "add" })[0];
  r.publication = "voice";
  const p = planRow(r, stops, pubs, buildStreetZoneMap(stops));
  assert.equal(p.status, "needs_choice");
  assert.match(p.message, /add it between 1020 and 1025 in the route/);
  assert.equal(p.newStop?.houseNumber, "1021");
});

test("a household already served at the door its own name is on is not asked to move", () => {
  // 12 Sheraton Dr · Elisheva Katz against basement/KATZ. The file states no
  // door, the count is met, and the paper already goes to that household. Pass 2
  // could not reach a LABELLED served line, so it fell through to "has this
  // household moved?" -- which invites stopping a delivery that must not stop.
  const stops: ExistingStop[] = [
    { id: "bs", zoneId: "z2", zoneNumber: 2, recipientName: "KATZ", houseNumber: "12",
      street: "SHERATON DR", floorSide: "basement", publicationIds: ["pub-v"] },
    { id: "up", zoneId: "z2", zoneNumber: 2, recipientName: null, houseNumber: "12",
      street: "SHERATON DR", floorSide: null, publicationIds: [] },
  ];
  const settled = settleAddress(stops, [{ floorSide: null, name: "Elisheva Katz" }], "pub-v");
  assert.deepEqual(settled, [{ kind: "no_change", stopId: "bs" }]);
});

test("where nothing else distinguishes them, the line carrying the row's surname wins", () => {
  // 4 STONEWALL CT: the file names BADOUCH with no door; we hold
  // basement/GEWIRTZ and upstairs/BADOUCH, neither served. Taking the first free
  // line put BADOUCH's paper in GEWIRTZ's basement, and the label is what the
  // driver follows. A tie-break only -- it never decides whether an address
  // matches, and never changes how many papers the address gets.
  const stops: ExistingStop[] = [
    { id: "bs", zoneId: "z1", zoneNumber: 1, recipientName: "GEWIRTZ", houseNumber: "4",
      street: "STONEWALL CT", floorSide: "basement", publicationIds: [] },
    { id: "up", zoneId: "z1", zoneNumber: 1, recipientName: "BADOUCH", houseNumber: "4",
      street: "STONEWALL CT", floorSide: "upstairs", publicationIds: [] },
  ];
  const settled = settleAddress(stops, [{ floorSide: null, name: "Refoel & Karmit BADOUCH" }], "pub-v");
  assert.deepEqual(settled, [{ kind: "attach", stopId: "up" }]);
});

// --- Answers the office has already given ---------------------------------
//
// Ari, 2026-08-31: "it does make sense to build something to record decisions
// about specific addresses so that we don't have to answer the same questions
// every week." 55 of the questions on the 27 Aug master list were "this house
// number is outside the stretch we cover" -- a fact about geography, re-answered
// weekly because there was nowhere to put it.

const rulingRow = (house: string, street: string) => {
  const r = rowsFromGrid([["customers.last_name", "addresses.addr"], ["Family Ort", `${house} ${street}`]],
    { defaultAction: "add" })[0];
  r.publication = "voice";
  return r;
};
const oakStops = (): ExistingStop[] => ["26", "28", "60", "66", "110"].map((h) => ({
  id: `o${h}`, zoneId: "z3", zoneNumber: 3, recipientName: null, houseNumber: h,
  street: "OAK ST", floorSide: null, publicationIds: [],
}));

test("a street the office has ruled not ours stops being a question", () => {
  const stops = oakStops();
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const rulings = buildRulingIndex([
    { street: "Bruce St", houseNumber: "12", publicationId: null, ruling: "not_ours",
      note: "real street, not on our round" },
  ]);
  const p = planRow(rulingRow("12", "Bruce St"), stops, pubs, buildStreetZoneMap(stops),
    new Map(), buildStopIndex(stops), undefined, rulings);
  assert.equal(p.status, "blocked");
  assert.match(p.message, /you told us so/);
  assert.match(p.message, /real street, not on our round/);
});

test("a ruling is stored normalised, so next week's spelling still matches", () => {
  const stops = oakStops();
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const rulings = buildRulingIndex([
    { street: "BRUCE STREET", houseNumber: "12", publicationId: null, ruling: "not_ours", note: null },
  ]);
  const p = planRow(rulingRow("12", "Bruce St"), stops, pubs, buildStreetZoneMap(stops),
    new Map(), buildStopIndex(stops), undefined, rulings);
  assert.equal(p.status, "blocked");
});

test("an address ruled OURS stops being asked about as out of area", () => {
  // 1471 OAK ST against our 26-110 asks every week. Once the office says it is on
  // the route, it is an ordinary new address.
  const stops = oakStops();
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const before = planRow(rulingRow("1471", "Oak St"), stops, pubs, buildStreetZoneMap(stops));
  assert.match(before.message, /outside the 26–110 stretch/);

  const rulings = buildRulingIndex([
    { street: "OAK ST", houseNumber: "1471", publicationId: null, ruling: "ours", note: null },
  ]);
  const after = planRow(rulingRow("1471", "Oak St"), stops, pubs, buildStreetZoneMap(stops),
    new Map(), buildStopIndex(stops), undefined, rulings);
  assert.doesNotMatch(after.message, /outside the 26–110 stretch/);
});

test("a ruling for one address does not silence the rest of the street", () => {
  const stops = oakStops();
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const rulings = buildRulingIndex([
    { street: "OAK ST", houseNumber: "1471", publicationId: null, ruling: "not_ours", note: null },
  ]);
  const ruled = planRow(rulingRow("1471", "Oak St"), stops, pubs, buildStreetZoneMap(stops),
    new Map(), buildStopIndex(stops), undefined, rulings);
  assert.equal(ruled.status, "blocked");
  const other = planRow(rulingRow("1490", "Oak St"), stops, pubs, buildStreetZoneMap(stops),
    new Map(), buildStopIndex(stops), undefined, rulings);
  assert.equal(other.status, "needs_choice");
});

test("a publication-specific ruling wins over one that applies to all", () => {
  const stops = oakStops();
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const rulings = buildRulingIndex([
    { street: "OAK ST", houseNumber: "1471", publicationId: null, ruling: "not_ours", note: "nobody" },
    { street: "OAK ST", houseNumber: "1471", publicationId: "pub-v", ruling: "ours", note: "Voice does" },
  ]);
  const p = planRow(rulingRow("1471", "Oak St"), stops, pubs, buildStreetZoneMap(stops),
    new Map(), buildStopIndex(stops), undefined, rulings);
  assert.notEqual(p.status, "blocked");
});

test("a ruling is always one address — a street-wide answer is not expressible", () => {
  // The street-wide scope was written for a case nothing creates, and defending
  // against it caused two defects: a street-level `ours` was silently discarded,
  // and a street-level `not_ours` reached the addresses we serve whenever the
  // master list spelled the street its own way (our Vine Ave is written VINE ST,
  // so the "do we hold this street" test missed and five real Vine Ave rows went
  // to blocked). Removing the scope removes both.
  const stops = oakStops();
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const forOne = buildRulingIndex([
    { street: "OAK ST", houseNumber: "1471", publicationId: null, ruling: "not_ours", note: null },
  ]);
  const ruled = planRow(rulingRow("1471", "Oak St"), stops, pubs, buildStreetZoneMap(stops),
    new Map(), buildStopIndex(stops), undefined, forOne);
  assert.equal(ruled.status, "blocked");

  // Every other door on that street is untouched -- the 26 Oak St we deliver to,
  // and any other number the master list carries.
  for (const house of ["26", "1490"]) {
    const other = planRow(rulingRow(house, "Oak St"), stops, pubs, buildStreetZoneMap(stops),
      new Map(), buildStopIndex(stops), undefined, forOne);
    assert.notEqual(other.status, "blocked", `${house} Oak St must survive`);
  }
});

test("a near-miss with no name evidence is its own street — no question", () => {
  // Ari, 2026-09-01, shown 265 BRUCE ST asking "is this the same street written
  // differently?": "I already told you that Bruce St is its own street, why are
  // you asking again?" Without a surname match there is no question: the street
  // is itself, and the row reads not-on-our-routes.
  const stops: ExistingStop[] = [{
    id: "c122", zoneId: "z3", zoneNumber: 3, recipientName: null, houseNumber: "122",
    street: "CAROL ST", floorSide: null, publicationIds: [],
  }];
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const row = rowsFromGrid([["customers.last_name", "addresses.addr"], ["Family Schwartz", "122 Carey St"]],
    { defaultAction: "add" })[0];
  row.publication = "voice";
  const planned = planRow(row, stops, pubs, buildStreetZoneMap(stops));
  assert.equal(planned.status, "blocked");
  assert.match(planned.message, /CAREY ST is not on any of our routes/);
});

test("an apartment written before the address is split off, and kept", () => {
  // Ari, 2026-09-01: the Voice office puts the apartment number before the
  // address on purpose. The real file's shapes: "apt a / 93 Harvard Street",
  // "unit 7202 / 100 Whisper Village Way".
  assert.deepEqual(splitAddress("apt a / 93 Harvard Street"),
    { houseNumber: "93", street: "Harvard Street", unit: "a" });
  assert.deepEqual(splitAddress("unit 7202 / 100 Whisper Village Way"),
    { houseNumber: "100", street: "Whisper Village Way", unit: "7202" });
  assert.deepEqual(splitAddress("Apt 3B 419 Cedar Bridge Ave"),
    { houseNumber: "419", street: "Cedar Bridge Ave", unit: "3B" });
  // Plain addresses are untouched, and a bare "apt" with no address still fails.
  assert.deepEqual(splitAddress("999 Morris Ave"), { houseNumber: "999", street: "Morris Ave" });
  assert.equal(splitAddress("apt 4"), null);
  // The unit rides into instructions, never into a floor label.
  const rows = rowsFromGrid(
    [["customers.last_name", "addresses.addr"], ["Friedman", "apt a / 93 Harvard Street"]],
    { defaultAction: "add" },
  );
  assert.equal(rows[0].houseNumber, "93");
  assert.equal(rows[0].instructions, "Apt a");
  assert.equal(rows[0].floorSide, null);
});

test("a trailing A on a house number is the basement at the bare number", () => {
  // Ari, 2026-09-01: "If you see an A after a house number, then you can assume
  // you can match it to a basement because many times an A is listed when it
  // means a basement." Only when we hold the bare number and NOT the lettered
  // one (105A CANARY DR is a real distinct address), and only when the row
  // states no floor of its own.
  const stops: ExistingStop[] = [
    { id: "up", zoneId: "z3", zoneNumber: 3, recipientName: "Neger", houseNumber: "68",
      street: "CANARY DR", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "bs", zoneId: "z3", zoneNumber: 3, recipientName: null, houseNumber: "68",
      street: "CANARY DR", floorSide: "basement", publicationIds: ["pub-v"] },
    { id: "real105a", zoneId: "z3", zoneNumber: 3, recipientName: null, houseNumber: "105A",
      street: "CANARY DR", floorSide: null, publicationIds: ["pub-v"] },
  ];
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const grid = (addr: string) =>
    rowsFromGrid([["customers.last_name", "addresses.addr"], ["Rachel Neger", addr]], { defaultAction: "add" });

  // 68A -> 68, basement: pairs with the basement line, no question. (Where the
  // basement did NOT already take the paper, the door rule still applies as
  // ever -- a stated door at a served address is the move question.)
  const out = planRoster(grid("68A canary drive"), stops, pubs, "pub-v");
  assert.equal(out.error, null);
  const row = out.rows!.find((r) => r.action === "add")!;
  assert.equal(row.status, "no_change");
  assert.equal(row.stopId, "bs");

  // An address we hold in its lettered form is matched exactly, not rewritten.
  const exact = planRoster(grid("105A canary drive"), stops, pubs, "pub-v");
  const exactRow = exact.rows!.find((r) => r.action === "add")!;
  assert.equal(exactRow.status, "no_change");
  assert.equal(exactRow.stopId, "real105a");

  // A stated floor is an order and is never overwritten by the A rule.
  const stated = rowsFromGrid(
    [["customers.last_name", "addresses.addr", "addresses.extended_addr"],
     ["Rachel Neger", "68A canary drive", "Upstairs"]],
    { defaultAction: "add" },
  );
  const kept = planRoster(stated, stops, pubs, "pub-v");
  const keptRow = kept.rows!.find((r) => r.action === "add")!;
  assert.equal(keptRow.houseNumber, "68A");
});

// --- Surplus lines: on the master list once means one paper ------------------

test("a line the master list leaves without a row becomes a removal", () => {
  // Ari, 2026-09-01, relaying the Voice office: "the courier delivers a few to
  // one address, but it's only on the master list once... the address should
  // only receive one." Two served lines, one file row: the row pairs with its
  // door, and the other line is proposed for removal — a visible review row,
  // never a silent write.
  const stops: ExistingStop[] = [
    { id: "up", zoneId: "z1", zoneNumber: 1, recipientName: "FREUND", houseNumber: "18",
      street: "BRIDGEWOOD AVE", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "bs", zoneId: "z1", zoneNumber: 1, recipientName: "FREUND", houseNumber: "18",
      street: "BRIDGEWOOD AVE", floorSide: "basement", publicationIds: ["pub-v"] },
  ];
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const file = rowsFromGrid(
    [["customers.last_name", "addresses.addr", "addresses.extended_addr"],
     ["Yehuda Freund", "18 Bridgewood Ave", "Basement"]],
    { defaultAction: "add" },
  );
  const out = planRoster(file, stops, pubs, "pub-v");
  assert.equal(out.error, null);
  const removals = out.rows!.filter((r) => r.action === "remove");
  assert.equal(removals.length, 1);
  assert.equal(removals[0].stopId, "up");
  assert.equal(removals[0].status, "ready");
  assert.match(removals[0].message, /on the new The Voice list once/);
});

test("equal counts leave nothing surplus", () => {
  const stops: ExistingStop[] = [
    { id: "up", zoneId: "z1", zoneNumber: 1, recipientName: "FREUND", houseNumber: "18",
      street: "BRIDGEWOOD AVE", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "bs", zoneId: "z1", zoneNumber: 1, recipientName: "FREUND", houseNumber: "18",
      street: "BRIDGEWOOD AVE", floorSide: "basement", publicationIds: ["pub-v"] },
  ];
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const even = planRoster(rowsFromGrid(
    [["customers.last_name", "addresses.addr"],
     ["Yehuda Freund", "18 Bridgewood Ave"], ["Yehuda Freund", "18 Bridgewood Ave"]],
    { defaultAction: "add" }), stops, pubs, "pub-v");
  assert.equal(even.rows!.filter((r) => r.action === "remove").length, 0);
});
test("at an address with more than two lines the office picks which line stops", () => {
  // "An address holding more than two lines is never written to blind" still
  // stands: the surplus is proposed as a choice with the candidate lines, not
  // as a ready removal, because apartment detail is invisible here.
  const stops: ExistingStop[] = ["a", "b", "c", "d"].map((letter) => ({
    id: `apt${letter}`, zoneId: "z1", zoneNumber: 1, recipientName: `TENANT ${letter.toUpperCase()}`,
    houseNumber: "419", street: "CEDAR BRIDGE AVE", floorSide: null, publicationIds: ["pub-v"],
  }));
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const out = planRoster(rowsFromGrid(
    [["customers.last_name", "addresses.addr"],
     ["Tenant A", "419 Cedar Bridge Ave"], ["Tenant B", "419 Cedar Bridge Ave"]],
    { defaultAction: "add" }), stops, pubs, "pub-v");
  const removals = out.rows!.filter((r) => r.action === "remove");
  assert.equal(removals.length, 2, "four lines, two file rows: two to stop");
  for (const removal of removals) {
    assert.equal(removal.status, "needs_choice");
    assert.equal(removal.stopId, null);
    assert.equal(removal.candidates.length, 2);
  }
});

test("a rosterManaged=false line is never surplus", () => {
  const stops: ExistingStop[] = [
    { id: "home", zoneId: "z1", zoneNumber: 1, recipientName: "FREUND", houseNumber: "18",
      street: "BRIDGEWOOD AVE", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "shop", zoneId: "z1", zoneNumber: 1, recipientName: "OFFICE DROP", houseNumber: "18",
      street: "BRIDGEWOOD AVE", floorSide: "basement", publicationIds: ["pub-v"], rosterManaged: false },
  ];
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const out = planRoster(rowsFromGrid(
    [["customers.last_name", "addresses.addr", "addresses.extended_addr"],
     ["Yehuda Freund", "18 Bridgewood Ave", "Upstairs"]],
    { defaultAction: "add" }), stops, pubs, "pub-v");
  assert.equal(out.rows!.filter((r) => r.action === "remove").length, 0);
});

test("the named household keeps its paper — the cut never depends on array order", () => {
  // Review-proven defect: with two served lines, served[0] claimed regardless of
  // the file row's surname, so "file names Gold" could stop Gold's paper and
  // keep Katz's — and reversing the stop array flipped the victim.
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const mk = (id: string, name: string, floor: string): ExistingStop => ({
    id, zoneId: "z1", zoneNumber: 1, recipientName: name, houseNumber: "10",
    street: "MAPLE AVE", floorSide: floor, publicationIds: ["pub-v"],
  });
  const file = (name: string) =>
    rowsFromGrid([["customers.last_name", "addresses.addr"], [name, "10 Maple Ave"]],
      { defaultAction: "add" });
  for (const stops of [
    [mk("katz-line", "Katz", "upstairs"), mk("gold-line", "Gold", "basement")],
    [mk("gold-line", "Gold", "basement"), mk("katz-line", "Katz", "upstairs")],
  ]) {
    const out = planRoster(file("Gold"), stops, pubs, "pub-v");
    const cut = out.rows!.filter((r) => r.action === "remove");
    assert.equal(cut.length, 1);
    assert.equal(cut[0].stopId, "katz-line", "Gold is on the list, so Katz's line stops");
  }
});

test("an exempt line never redirects the cut onto the real household", () => {
  // rosterManaged=false protects a line from removal — it must not absorb the
  // file row's claim and leave the named household's line as the surplus.
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const stops: ExistingStop[] = [
    { id: "shop", zoneId: "z1", zoneNumber: 1, recipientName: "OFFICE DROP", houseNumber: "809",
      street: "RIVER AVE", floorSide: null, publicationIds: ["pub-v"], rosterManaged: false },
    { id: "home", zoneId: "z1", zoneNumber: 1, recipientName: "Preschel", houseNumber: "809",
      street: "RIVER AVE", floorSide: null, publicationIds: ["pub-v"] },
  ];
  const out = planRoster(
    rowsFromGrid([["customers.last_name", "addresses.addr"], ["Family Levy", "809 River Ave"]],
      { defaultAction: "add" }),
    stops, pubs, "pub-v");
  assert.equal(out.rows!.filter((r) => r.action === "remove").length, 0,
    "the one row claims the removable line; the exempt line needs no claim and is never surplus");
});

test("a question pointing AT an address holds its surplus back, whatever key it sits under", () => {
  // Review-proven: the file's 132B row asks the unit_letter question ABOUT our
  // 132, but the question's own key is |132b — the surplus at |132 was cut
  // ready while its possible claimant sat one row up as an open question.
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const stops: ExistingStop[] = [
    { id: "l1", zoneId: "z1", zoneNumber: 1, recipientName: "Roth", houseNumber: "132",
      street: "CAROL ST", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "l2", zoneId: "z1", zoneNumber: 1, recipientName: "Katz", houseNumber: "132",
      street: "CAROL ST", floorSide: "basement", publicationIds: ["pub-v"] },
    // A second lettered address on the street, so the trailing-A rewrite does
    // not apply and the 132B row goes down the unit_letter path.
    { id: "lB", zoneId: "z1", zoneNumber: 1, recipientName: null, houseNumber: "130B",
      street: "CAROL ST", floorSide: null, publicationIds: ["pub-v"] },
  ];
  const out = planRoster(
    rowsFromGrid([["customers.last_name", "addresses.addr"],
      ["Roth", "132 Carol St"], ["Katz", "132B Carol St"]], { defaultAction: "add" }),
    stops, pubs, "pub-v");
  assert.ok(out.rows!.some((r) => r.status === "needs_choice" && /same door or a second unit/.test(r.message)));
  // The fixture's 130B stop is absent from the file, so its whole-address
  // removal is expected — the pin is that no SURPLUS cut fires at 132.
  assert.equal(out.rows!.filter((r) => r.surplusLine).length, 0,
    "no cut at 132 while the 132B question is open");
});

test("an unreadable row naming the street downgrades that street's cut to a choice", () => {
  // Review-proven: "Maple Avenue 12 · Katz" — the missing claimant — sat
  // blocked as unreadable while Katz's line was cut ready.
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const stops: ExistingStop[] = [
    { id: "l1", zoneId: "z1", zoneNumber: 1, recipientName: "Roth", houseNumber: "12",
      street: "MAPLE AVE", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "l2", zoneId: "z1", zoneNumber: 1, recipientName: "Katz", houseNumber: "12",
      street: "MAPLE AVE", floorSide: "basement", publicationIds: ["pub-v"] },
  ];
  const out = planRoster(
    rowsFromGrid([["customers.last_name", "addresses.addr"],
      ["Roth", "12 Maple Ave"], ["Katz", "Maple Avenue 12"]], { defaultAction: "add" }),
    stops, pubs, "pub-v");
  const cuts = out.rows!.filter((r) => r.action === "remove");
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0].status, "needs_choice");
  assert.match(cuts[0].message, /unreadable row in the file mentions this street/);
  assert.equal(cuts[0].stopId, null);
});

test("when the master list forces a cut, the upstairs or better-described line is KEPT", () => {
  // Ari, 2026-09-01, clarified "I meant the opposite" of deleting them: the
  // upstairs or better-described line survives; the bare line takes the cut.
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const stops: ExistingStop[] = [
    { id: "rich", zoneId: "z1", zoneNumber: 1, recipientName: "FREUND", houseNumber: "18",
      street: "BRIDGEWOOD AVE", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "bare", zoneId: "z1", zoneNumber: 1, recipientName: null, houseNumber: "18",
      street: "BRIDGEWOOD AVE", floorSide: null, publicationIds: ["pub-v"] },
  ];
  const file = rowsFromGrid(
    [["customers.last_name", "addresses.addr"], ["Family Levy", "18 Bridgewood Ave"]],
    { defaultAction: "add" });
  for (const order of [stops, [...stops].reverse()]) {
    const out = planRoster(file, order, pubs, "pub-v");
    const cut = out.rows!.filter((r) => r.surplusLine);
    assert.equal(cut.length, 1);
    assert.equal(cut[0].stopId, "bare", "the bare line goes; upstairs with a name survives");
  }

  // "Unless there's a reason to do otherwise": a surname match is such a
  // reason — the file naming the bare line's household keeps THAT line, and
  // the richer line takes the cut instead.
  const namedStops: ExistingStop[] = [
    { id: "rich", zoneId: "z1", zoneNumber: 1, recipientName: "FREUND", houseNumber: "18",
      street: "BRIDGEWOOD AVE", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "levy", zoneId: "z1", zoneNumber: 1, recipientName: "LEVY", houseNumber: "18",
      street: "BRIDGEWOOD AVE", floorSide: null, publicationIds: ["pub-v"] },
  ];
  const named = rowsFromGrid(
    [["customers.last_name", "addresses.addr"], ["Levy", "18 Bridgewood Ave"]],
    { defaultAction: "add" });
  const kept = planRoster(named, namedStops, pubs, "pub-v");
  const namedCut = kept.rows!.filter((r) => r.surplusLine);
  assert.equal(namedCut.length, 1);
  assert.equal(namedCut[0].stopId, "rich", "Levy is on the list, so Levy's plainer line stays");
});

test("the pick-a-line dropdown lists the cut-first candidates on top", () => {
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const stops: ExistingStop[] = [
    { id: "bare", zoneId: "z1", zoneNumber: 1, recipientName: null, houseNumber: "23",
      street: "SHERATON", floorSide: null, publicationIds: ["pub-v"] },
    { id: "up", zoneId: "z1", zoneNumber: 1, recipientName: "STEINER", houseNumber: "23",
      street: "SHERATON", floorSide: "upstairs", publicationIds: ["pub-v"] },
    { id: "bs", zoneId: "z1", zoneNumber: 1, recipientName: "KLEIN", houseNumber: "23",
      street: "SHERATON", floorSide: "basement", publicationIds: ["pub-v"] },
  ];
  const out = planRoster(
    rowsFromGrid([["customers.last_name", "addresses.addr"], ["Family Roth", "23 Sheraton"]],
      { defaultAction: "add" }),
    stops, pubs, "pub-v");
  const choice = out.rows!.find((r) => r.surplusLine && r.status === "needs_choice");
  assert.ok(choice, "three lines, one file row: the office picks");
  assert.equal(choice!.candidates[0].stopId, "bare", "the bare line is offered first for the cut");
});

test("a stated door with two same-door lines keeps the named household, both orders", () => {
  // Review-proven gap: pass 1 picked among door matches by array order, so a
  // row naming Katz could cut Katz's basement and keep Gold's.
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const mk = (id: string, name: string): ExistingStop => ({
    id, zoneId: "z1", zoneNumber: 1, recipientName: name, houseNumber: "6",
    street: "LONDON AVE", floorSide: "basement", publicationIds: ["pub-v"],
  });
  const file = rowsFromGrid(
    [["customers.last_name", "addresses.addr", "addresses.extended_addr"],
     ["Family Katz", "6 London Ave", "Basement"]],
    { defaultAction: "add" });
  for (const stops of [[mk("gold", "Gold"), mk("katz", "Katz")], [mk("katz", "Katz"), mk("gold", "Gold")]]) {
    const out = planRoster(file, stops, pubs, "pub-v");
    const cut = out.rows!.filter((r) => r.surplusLine);
    assert.equal(cut.length, 1);
    assert.equal(cut[0].stopId, "gold", "Katz is on the list; Gold's line is the surplus");
  }
});

test("two unlabelled served lines: the named household survives via pass 1b too", () => {
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const mk = (id: string, name: string): ExistingStop => ({
    id, zoneId: "z1", zoneNumber: 1, recipientName: name, houseNumber: "9",
    street: "LONDON AVE", floorSide: null, publicationIds: ["pub-v"],
  });
  const file = rowsFromGrid(
    [["customers.last_name", "addresses.addr", "addresses.extended_addr"],
     ["Family Katz", "9 London Ave", "Basement"]],
    { defaultAction: "add" });
  for (const stops of [[mk("gold", "Gold"), mk("katz", "Katz")], [mk("katz", "Katz"), mk("gold", "Gold")]]) {
    const cut = planRoster(file, stops, pubs, "pub-v").rows!.filter((r) => r.surplusLine);
    assert.equal(cut.length, 1);
    assert.equal(cut[0].stopId, "gold");
  }
});

test("a stated door falling back to an UNSERVED unlabelled line asks at a crowded address", () => {
  // Review finding: the unlabelled fallback is a presumption, not a door
  // match — at a building with 3+ of this publication's lines it is a blind
  // write and goes to a person rather than silently attaching.
  const pubs = [{ id: "pub-v", code: "voice", name: "The Voice" }];
  const stops: ExistingStop[] = [
    ...[0, 1, 2].map((i) => ({
      id: `v${i}`, zoneId: "z1", zoneNumber: 1, recipientName: `TENANT ${i}`, houseNumber: "419",
      street: "CEDAR BRIDGE AVE", floorSide: "upstairs", publicationIds: ["pub-v"],
    })),
    { id: "x", zoneId: "z1", zoneNumber: 1, recipientName: null, houseNumber: "419",
      street: "CEDAR BRIDGE AVE", floorSide: null, publicationIds: [] },
  ];
  const file = rowsFromGrid(
    [["customers.last_name", "addresses.addr", "addresses.extended_addr"],
     ["Family New", "419 Cedar Bridge Ave", "Basement"]],
    { defaultAction: "add" });
  const out = planRoster(file, stops, pubs, "pub-v");
  const row = out.rows!.find((r) => r.action === "add")!;
  assert.equal(row.status, "needs_choice");
  assert.match(row.message, /lines with this publication — pick which one/);
  assert.equal(out.rows!.filter((r) => r.surplusLine).length, 0, "the ask holds the cuts");
});
