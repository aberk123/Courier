/**
 * The map check settles the no-name near-miss street question -- see
 * street-check.ts for the asymmetry it must keep. These tests pin the two
 * directions that must never invert: a geocoder MATCH on a different base word
 * is the geocoder spell-correcting, not confirmation; and nothing but a
 * confirmed match ever adds a street to the set.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretCensusMatch, checkStreetsExist } from "./street-check.ts";
import { normalizeStreet } from "./match.ts";

test("a matched address confirms the street only when it IS the queried street", () => {
  // The real pair: the file's 122 CAREY ST against our unnamed 122 CAROL ST.
  assert.equal(interpretCensusMatch("Carey St", "122", "122 CAREY ST, LAKEWOOD, NJ, 08701"), true);
  // Suffix written out, or bare on one side, is still the same street.
  assert.equal(interpretCensusMatch("Carey Street", "122", "122 CAREY ST, LAKEWOOD, NJ, 08701"), true);
  assert.equal(interpretCensusMatch("Carey", "122", "122 CAREY ST, LAKEWOOD, NJ, 08701"), true);
});

test("the geocoder correcting the spelling is NOT confirmation", () => {
  // Census spell-corrects: querying the file's CAREY ST can return CAROL ST --
  // evidence FOR the typo theory, so it must not read as "CAREY ST exists".
  assert.equal(interpretCensusMatch("Carey St", "122", "122 CAROL ST, LAKEWOOD, NJ, 08701"), false);
  // A different suffix on the same base is a different street (PINE BLVD / PINE ST).
  assert.equal(interpretCensusMatch("Pine Blvd", "3", "3 PINE ST, LAKEWOOD, NJ, 08701"), false);
});

test("a match outside Lakewood, or at another house number, confirms nothing", () => {
  assert.equal(interpretCensusMatch("Carey St", "122", "122 CAREY ST, TOMS RIVER, NJ, 08753"), false);
  assert.equal(interpretCensusMatch("Carey St", "122", "124 CAREY ST, LAKEWOOD, NJ, 08701"), false);
});

test("checkStreetsExist fails soft: unreachable, non-200 and not-found decide nothing", async () => {
  const rows = [{ street: "Carey St", houseNumber: "122" }];
  const down: typeof fetch = async () => { throw new Error("network unreachable"); };
  assert.equal((await checkStreetsExist(rows, down)).size, 0);
  const err: typeof fetch = async () => new Response("busy", { status: 503 });
  assert.equal((await checkStreetsExist(rows, err)).size, 0);
  const empty: typeof fetch = async () =>
    new Response(JSON.stringify({ result: { addressMatches: [] } }), { status: 200 });
  assert.equal((await checkStreetsExist(rows, empty)).size, 0);
});

test("checkStreetsExist returns the confirmed street, normalised, once", async () => {
  const rows = [
    { street: "Carey St", houseNumber: "122" },
    { street: "CAREY STREET", houseNumber: "122" }, // same address, deduped
    { street: "Mendon Dr", houseNumber: "5" },      // geocoder corrects it away
  ];
  const ok: typeof fetch = async (url) => {
    const address = decodeURIComponent(String(url));
    const body = address.includes("Carey")
      ? { result: { addressMatches: [{ matchedAddress: "122 CAREY ST, LAKEWOOD, NJ, 08701" }] } }
      : { result: { addressMatches: [{ matchedAddress: "5 MENDHAM DR, LAKEWOOD, NJ, 08701" }] } };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const confirmed = await checkStreetsExist(rows, ok);
  assert.deepEqual([...confirmed], [normalizeStreet("Carey St")]);
});
