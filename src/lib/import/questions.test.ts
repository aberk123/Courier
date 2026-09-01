/**
 * The questions portal's builder. The load-bearing test is the sanitization
 * pin: evidence crosses the per-publication RLS boundary if it ever carries a
 * recipient name from our stops, another publication's letters, or the
 * details of a line that does not carry the question's own publication.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuestions } from "./questions.ts";
import { buildStopIndex, buildStreetZoneMap, planRow } from "./match.ts";
import type { ExistingStop, PlanRow } from "./match.ts";
import { rowsFromGrid } from "./parse.ts";

const stops: ExistingStop[] = [
  { id: "s1", zoneId: "z", zoneNumber: 1, recipientName: "LICHTENSTEIN", houseNumber: "1",
    street: "EAGLE LN", floorSide: "upstairs", publicationIds: ["pub-v"] },
  { id: "s2", zoneId: "z", zoneNumber: 1, recipientName: "HIDDEN SHOPPER", houseNumber: "1",
    street: "EAGLE LN", floorSide: "basement", publicationIds: ["pub-s"] },
];

const row = (over: Partial<PlanRow>): PlanRow => ({
  rowNumber: 1, action: "add", summary: "1 Eagle Ln · Family Pernikoff",
  street: "Eagle Ln", houseNumber: "1", publicationId: "pub-v", publicationName: "The Voice",
  status: "needs_choice", message: "another household at this address",
  candidates: [
    { stopId: "s1", label: "1 EAGLE LN · upstairs · LICHTENSTEIN (zone 1)", zoneNumber: 1 },
    { stopId: "s2", label: "1 EAGLE LN · basement · HIDDEN SHOPPER (zone 1)", zoneNumber: 1 },
  ],
  stopId: null, newStop: null, instructions: null, floorSide: "basement",
  questionKind: "crowded_address", questionKey: "crowded_address|eagle ln|1",
  ...over,
});

test("evidence never carries our recipient names or another publication's lines", () => {
  const [q] = buildQuestions([row({})], "pub-v", stops);
  const json = JSON.stringify(q);
  // The file's own name is the publication's own data and stays.
  assert.match(json, /Pernikoff/);
  // Our recipient names never appear -- not even for the stop that carries
  // this publication.
  assert.doesNotMatch(json, /LICHTENSTEIN/i);
  // A line that does not carry this publication appears only as a count: RLS
  // hides that stop from a scoped user, and this table must not route around it.
  // (The word "basement" may still appear as the FILE row's own floor label --
  // the publication's own data -- so the structural checks below are the pin
  // for the withheld stop's details.)
  assert.doesNotMatch(json, /HIDDEN|SHOPPER/i);
  assert.equal(q.evidence.candidates.length, 1);
  assert.deepEqual(q.evidence.candidates[0], { houseNumber: "1", street: "EAGLE LN", floorSide: "upstairs" });
  assert.equal(q.evidence.otherLinesWithheld, 1);
});

test("several file rows at one address become ONE question with all rows in evidence", () => {
  const rows = [
    row({ rowNumber: 1, summary: "1 Eagle Ln · Family Pernikoff" }),
    row({ rowNumber: 2, summary: "1 Eagle Ln · Family Stern" }),
  ];
  const questions = buildQuestions(rows, "pub-v", stops);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].evidence.fileRows.length, 2);
});

test("the fingerprint moves only when the facts move", () => {
  const [a] = buildQuestions([row({})], "pub-v", stops);
  const [b] = buildQuestions([row({})], "pub-v", stops);
  assert.equal(a.fingerprint, b.fingerprint);
  // A second file row at the address IS a changed fact.
  const [c] = buildQuestions([row({}), row({ rowNumber: 2, summary: "1 Eagle Ln · Family Stern" })], "pub-v", stops);
  assert.notEqual(a.fingerprint, c.fingerprint);
});

test("audiences follow Ari's split: master-list questions to the office, routes to Amrom", () => {
  const kinds: [PlanRow["questionKind"], string][] = [
    ["out_of_stretch", "voice_office"],
    ["door_conflict", "voice_office"],
    ["unit_letter", "voice_office"],
    ["unreadable_cell", "voice_office"],
    ["route_position", "amrom"],
    ["near_miss_named", "courier_office"],
  ];
  for (const [kind, audience] of kinds) {
    const [q] = buildQuestions(
      [row({ questionKind: kind, questionKey: `${kind}|eagle ln|1`, unreadable: kind === "unreadable_cell", status: kind === "unreadable_cell" ? "blocked" : "needs_choice" })],
      "pub-v",
      stops,
    );
    assert.equal(q.audience, audience, String(kind));
  }
});

test("rows that are not questions produce nothing", () => {
  const settled = [
    row({ status: "ready" }),
    row({ status: "no_change" }),
    row({ status: "blocked" }), // blocked without unreadable
    row({ questionKind: undefined, questionKey: undefined }),
  ];
  assert.equal(buildQuestions(settled, "pub-v", stops).length, 0);
});

test("a second household from the master list is not a portal question at all", () => {
  // Ari, 2026-09-01, shown "is it a real second household?": "What's the
  // question on this one? Again, you should be following the master list." The
  // list naming another household IS the answer; only the route placement
  // remains, which is the courier office's work on the import screen. So the
  // row stays needs_choice there but produces nothing on /questions -- which
  // also removes the only prompt that ever embedded a recipient name.
  const stops: ExistingStop[] = [{
    id: "hidden", zoneId: "z1", zoneNumber: 1, recipientName: "HIDDEN SHOPPER",
    houseNumber: "1", street: "EAGLE LN", floorSide: "upstairs", publicationIds: ["pub-s"],
  }];
  const pubs = [
    { id: "pub-v", code: "voice", name: "The Voice" },
    { id: "pub-s", code: "shopper", name: "The Shopper" },
  ];
  const fileRow = rowsFromGrid(
    [["customers.last_name", "addresses.addr", "addresses.extended_addr"],
     ["Family Pernikoff", "1 Eagle Ln", "Basement"]],
    { defaultAction: "add" },
  )[0];
  fileRow.publication = "voice";
  const planned = planRow(
    fileRow, stops, pubs, buildStreetZoneMap(stops), new Map(), buildStopIndex(stops),
    { fileRows: [{ floorSide: "basement", name: "Family Pernikoff", externalId: null }], index: 0 },
  );
  assert.equal(planned.status, "needs_choice");
  assert.equal(planned.questionKind, undefined);
  assert.equal(buildQuestions([planned], "pub-v", stops).length, 0);
});