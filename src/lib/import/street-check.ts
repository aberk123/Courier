import { normalizeStreet, normalizeHouseNumber, stripStreetSuffix } from "./match.ts";

/**
 * "Is this a real Lakewood street we simply don't deliver to, or a misspelling
 * of one of ours?" — the question behind every no-name near-miss row, and the
 * one question a map genuinely answers. Ari settled BRUCE ST and CAREY ST by
 * hand exactly this way, and directed (2026-08-31): "whenever you're not sure
 * whether it's a legitimate street or not, you can check it in Google maps."
 *
 * The lookup uses the US Census Bureau geocoder: free, no API key, no terms
 * that bite. Only the handful of near-miss addresses per upload are queried,
 * never the whole file.
 *
 * The asymmetry is deliberate and must stay:
 *
 *  - A CONFIRMED address (the geocoder matched this house on this street in
 *    Lakewood, spelled the same) means the street is real, so per the recorded
 *    rule "a street in the file is that street" the row reads "not on any of
 *    our routes". If that is ever wrong, a subscriber's addition is missed and
 *    they complain — noticed and fixable.
 *  - NOT FOUND decides nothing. New construction is missing from map data all
 *    the time, so an absent street must never quietly settle a question.
 *  - UNAVAILABLE (network down, non-200, timeout) decides nothing, and the
 *    upload works exactly as it does without the check.
 *
 * The Census geocoder spell-corrects, which cuts both ways: querying the file's
 * CAREY ST could return our CAROL ST. interpretCensusMatch therefore accepts a
 * match only when the returned street is the QUERIED street (same base word,
 * suffix equal or one side bare) in LAKEWOOD — a "corrected" answer is not
 * confirmation that the queried street exists.
 */

type CensusResponse = {
  result?: { addressMatches?: { matchedAddress?: string }[] };
};

/** True only when a matched address confirms the queried street itself. */
export function interpretCensusMatch(
  street: string,
  houseNumber: string,
  matchedAddress: string,
): boolean {
  const parts = matchedAddress.split(",").map((p) => p.trim());
  if (parts.length < 3) return false;
  const [line, city] = parts;
  if (city.toUpperCase() !== "LAKEWOOD") return false;

  const words = line.trim().split(/\s+/);
  if (words.length < 2) return false;
  const matchedHouse = normalizeHouseNumber(words[0]);
  const matchedStreet = normalizeStreet(words.slice(1).join(" "));
  if (matchedHouse !== normalizeHouseNumber(houseNumber)) return false;

  const queried = normalizeStreet(street);
  if (matchedStreet === queried) return true;
  // Same base word with a bare side ("CAREY" for CAREY ST) is the same street;
  // a different base word is the geocoder correcting the spelling — the exact
  // thing this check must not treat as confirmation.
  const base = stripStreetSuffix(queried);
  return (
    stripStreetSuffix(matchedStreet) === base && (matchedStreet === base || queried === base)
  );
}

const LOOKUP_CAP = 24;
// Census normally answers well under a second. The timeout is deliberately
// tight because it is paid in full precisely when the service is DOWN -- every
// lookup then runs to the deadline, and the plan action absorbs the whole wait.
const LOOKUP_TIMEOUT_MS = 2000;
const CONCURRENCY = 6;

/**
 * Returns the normalized streets among `rows` that the map CONFIRMS exist in
 * Lakewood at the given house number. Anything else — not found, ambiguous,
 * service unreachable — is simply absent from the set, and the caller's
 * question stands. Never throws.
 */
export async function checkStreetsExist(
  rows: { street: string; houseNumber: string }[],
  fetchImpl: typeof fetch = fetch,
): Promise<Set<string>> {
  const confirmed = new Set<string>();
  const unique = new Map<string, { street: string; houseNumber: string }>();
  for (const row of rows) {
    const key = `${normalizeStreet(row.street)}|${normalizeHouseNumber(row.houseNumber)}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  const queue = [...unique.values()].slice(0, LOOKUP_CAP);

  const lookup = async ({ street, houseNumber }: { street: string; houseNumber: string }) => {
    try {
      const address = encodeURIComponent(`${houseNumber} ${street}, Lakewood, NJ`);
      const url =
        `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress` +
        `?address=${address}&benchmark=Public_AR_Current&format=json`;
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (!response.ok) return;
      const json = (await response.json()) as CensusResponse;
      for (const match of json.result?.addressMatches ?? []) {
        if (match.matchedAddress && interpretCensusMatch(street, houseNumber, match.matchedAddress)) {
          confirmed.add(normalizeStreet(street));
          return;
        }
      }
    } catch {
      // Unreachable or slow — the question stays a question.
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await lookup(next);
    }
  });
  await Promise.all(workers);
  return confirmed;
}
