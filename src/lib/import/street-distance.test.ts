/**
 * The map-distance pass: "is this address along a stretch the driver already
 * passes?" The traps pinned here: a spell-corrected geocoder match is no
 * measurement, and unmeasurable never decides anything.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretCensusPoint, metersBetween, measureStretchGaps } from "./street-distance.ts";

const census = (matchedAddress: string, x: number, y: number) => ({
  result: { addressMatches: [{ matchedAddress, coordinates: { x, y } }] },
});

test("coordinates count only when the match is the queried street itself", () => {
  assert.deepEqual(
    interpretCensusPoint("Henry St", "16", census("16 HENRY ST, LAKEWOOD, NJ, 08701", -74.2, 40.09)),
    { lat: 40.09, lon: -74.2 },
  );
  // The geocoder correcting HENRY to HENDRY is not a measurement of Henry St.
  assert.equal(
    interpretCensusPoint("Henry St", "16", census("16 HENDRY ST, LAKEWOOD, NJ, 08701", -74.2, 40.09)),
    null,
  );
  assert.equal(
    interpretCensusPoint("Henry St", "16", census("16 HENRY ST, TOMS RIVER, NJ, 08753", -74.2, 40.09)),
    null,
  );
});

test("meters are meters", () => {
  // One degree of latitude is ~111 km; 0.001 degrees is ~111 m.
  const d = metersBetween({ lat: 40.09, lon: -74.2 }, { lat: 40.091, lon: -74.2 });
  assert.ok(d > 105 && d < 118, String(d));
});

test("measureStretchGaps fails soft and returns the smallest gap per address", async () => {
  const points: Record<string, [number, number]> = {
    "16": [-74.2, 40.0900], // ~78 m from 28
    "28": [-74.2, 40.0907],
    "111": [-74.2, 40.0960],
  };
  const ok: typeof fetch = async (url) => {
    const address = decodeURIComponent(String(url));
    const house = address.match(/address=(\S+?) /)?.[1] ?? "";
    const p = points[house];
    if (!p) return new Response(JSON.stringify({ result: { addressMatches: [] } }), { status: 200 });
    return new Response(
      JSON.stringify(census(`${house} HENRY ST, LAKEWOOD, NJ, 08701`, p[0], p[1])),
      { status: 200 },
    );
  };
  const gaps = await measureStretchGaps(
    [{ street: "Henry St", houseNumber: "16", refs: ["28", "111"] }],
    ok,
  );
  const gap = gaps.get("henry st|16");
  assert.ok(gap);
  assert.equal(gap!.nearestHouse, "28");
  assert.ok(gap!.meters > 60 && gap!.meters < 95, String(gap!.meters));

  // Service down: empty map, no throw — and the circuit breaker stops asking.
  let calls = 0;
  const down: typeof fetch = async () => { calls += 1; throw new Error("unreachable"); };
  const none = await measureStretchGaps(
    Array.from({ length: 10 }, (_, i) => ({ street: "Henry St", houseNumber: String(i), refs: ["28"] })),
    down,
  );
  assert.equal(none.size, 0);
  // Each of the parallel workers may fire once before the breaker trips.
  assert.ok(calls <= 8, `circuit breaker should stop early, made ${calls} calls`);
});
