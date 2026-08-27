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
  removalsLookWrong,
  planRow,
  buildStreetZoneMap,
  normalizeStreet,
  normalizeHouseNumber,
} from "./match.ts";
import { rowsFromGrid, splitAddress } from "./parse.ts";

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
  const stops = [stop("26", "OAK ST"), stop("28", "OAK ST"), stop("110", "OAK ST")];
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

  // A gap inside the stretch we walk is still an ordinary new address.
  const inside = planRow(row("64"), stops, pubs, zones);
  assert.equal(inside.status, "ready");
  assert.match(inside.message, /new address/);
});
