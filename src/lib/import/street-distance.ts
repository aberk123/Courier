import { normalizeStreet, normalizeHouseNumber, stripStreetSuffix } from "./match.ts";

/**
 * "Is this address along a stretch the driver already passes?" — Ari,
 * 2026-09-01, shown 1–16 Henry St queued as questions while we deliver 28–111
 * on the same short block: "it's worth it for you to have access to a map so
 * that you can see the actual route... You can see if the address in question
 * is being passed by the delivery guy."
 *
 * The free US Census geocoder returns coordinates, so the importer measures
 * the straight-line distance from a questioned out-of-stretch address to the
 * nearest house we deliver on that same street:
 *
 *  - Within STRETCH_METERS (see match.ts): the driver passes it. The "is it ours?" question
 *    dissolves into a placement note for the Lakewood Courier, distance shown.
 *  - Further, or not measurable: the question stands, annotated with the
 *    distance when one was measured. "Unmeasurable" never decides anything.
 *
 * Deliberately NOT applied to wrong-side-parity questions: whether the driver
 *crosses the street is a walking-pattern fact, not a geometric one, and it
 * stays with Amrom.
 *
 * The geocoder spell-corrects, so a match counts only when the returned
 * address is the queried street itself (same discipline as the retired
 * street-existence check) — a corrected answer is no measurement at all.
 */

type CensusResponse = {
  result?: {
    addressMatches?: { matchedAddress?: string; coordinates?: { x?: number; y?: number } }[];
  };
};

/** The matched coordinates, only when the match is the queried street itself. */
export function interpretCensusPoint(
  street: string,
  houseNumber: string,
  json: CensusResponse,
): { lat: number; lon: number } | null {
  for (const match of json.result?.addressMatches ?? []) {
    const address = match.matchedAddress;
    const point = match.coordinates;
    if (!address || typeof point?.x !== "number" || typeof point?.y !== "number") continue;
    const parts = address.split(",").map((p) => p.trim());
    if (parts.length < 3 || parts[1].toUpperCase() !== "LAKEWOOD") continue;
    const words = parts[0].trim().split(/\s+/);
    if (words.length < 2) continue;
    if (normalizeHouseNumber(words[0]) !== normalizeHouseNumber(houseNumber)) continue;
    const matched = normalizeStreet(words.slice(1).join(" "));
    const queried = normalizeStreet(street);
    const base = stripStreetSuffix(queried);
    const sameStreet =
      matched === queried ||
      (stripStreetSuffix(matched) === base && (matched === base || queried === base));
    if (sameStreet) return { lat: point.y, lon: point.x };
  }
  return null;
}

/** Straight-line distance in meters (haversine). */
export function metersBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(s));
}

export type StretchGap = { meters: number; nearestHouse: string };

const LOOKUP_CAP = 80;
const LOOKUP_TIMEOUT_MS = 2000;
const CONCURRENCY = 6;
/** The service being down is paid once, not per lookup. */
const CONSECUTIVE_FAILURE_LIMIT = 4;

/**
 * Measures each target address against its reference houses (the covered ends
 * of its street's stretch) and returns the smallest gap per address, keyed
 * `street|house` (normalized). Anything unmeasurable is simply absent — the
 * caller's question stands. Never throws.
 */
export async function measureStretchGaps(
  targets: { street: string; houseNumber: string; refs: string[] }[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, StretchGap>> {
  const out = new Map<string, StretchGap>();
  if (!targets.length) return out;

  // Every distinct address to geocode: the questioned ones plus their refs.
  const wanted = new Map<string, { street: string; houseNumber: string }>();
  const want = (street: string, houseNumber: string) => {
    const key = `${normalizeStreet(street)}|${normalizeHouseNumber(houseNumber)}`;
    if (!wanted.has(key)) wanted.set(key, { street, houseNumber });
    return key;
  };
  // 50 targets covers the current file's 46 with room; refs dedupe per street
  // (14 Henry St questions share the same two ends), so the lookup cap holds.
  for (const target of targets.slice(0, 50)) {
    want(target.street, target.houseNumber);
    for (const ref of target.refs.slice(0, 2)) want(target.street, ref);
  }
  const queue = [...wanted.entries()].slice(0, LOOKUP_CAP);

  const points = new Map<string, { lat: number; lon: number }>();
  let consecutiveFailures = 0;
  const lookup = async (key: string, street: string, houseNumber: string) => {
    if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) return;
    try {
      const address = encodeURIComponent(`${houseNumber} ${street}, Lakewood, NJ`);
      const url =
        `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress` +
        `?address=${address}&benchmark=Public_AR_Current&format=json`;
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
      if (!response.ok) throw new Error(String(response.status));
      consecutiveFailures = 0;
      const point = interpretCensusPoint(street, houseNumber, (await response.json()) as CensusResponse);
      if (point) points.set(key, point);
    } catch {
      consecutiveFailures += 1;
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await lookup(next[0], next[1].street, next[1].houseNumber);
    }
  });
  await Promise.all(workers);

  for (const target of targets) {
    const key = `${normalizeStreet(target.street)}|${normalizeHouseNumber(target.houseNumber)}`;
    const here = points.get(key);
    if (!here) continue;
    let best: StretchGap | null = null;
    for (const ref of target.refs) {
      const refPoint = points.get(`${normalizeStreet(target.street)}|${normalizeHouseNumber(ref)}`);
      if (!refPoint) continue;
      const meters = Math.round(metersBetween(here, refPoint));
      if (!best || meters < best.meters) best = { meters, nearestHouse: ref };
    }
    if (best) out.set(key, best);
  }
  return out;
}
