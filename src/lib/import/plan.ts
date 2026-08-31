/**
 * Planning one upload, with nothing impure in it.
 *
 * This used to live inside `planImport`, the Server Action, mixed in with
 * reading the file and the database. That made it untestable except through a
 * reimplementation -- and every harness that reimplemented it drifted. The one
 * that measured this file's numbers disagreed with the deployed screen by six
 * rows, which is exactly the gap a defect hides in.
 *
 * So the decision lives here and takes plain values. The Server Action reads the
 * spreadsheet and the address list; this decides what the upload means. A harness
 * runs the same function the screen does, and any difference is real.
 */
import type { ParsedRow } from "./parse";
import {
  additionsLookWrong,
  buildStopIndex,
  buildStreetZoneMap,
  mergeFloorSides,
  normalizeHouseNumber,
  normalizeStreet,
  planRosterRemovals,
  planRow,
  removalsLookWrong,
  ruleStreetVariants,
  type ExistingStop,
  type PlanRow,
  type RosterFileRow,
  type RosterGroup,
} from "./match";

export type PlanSummary = {
  total: number;
  ready: number;
  needsChoice: number;
  noChange: number;
  /** Streets that are not on any of our five routes. */
  blocked: number;
  /** Address cells the importer could not read -- fixable in the master list. */
  unreadable: number;
  sampled: number;
};

export type PlanOutcome =
  | { error: string; rows: null; summary: null }
  | { error: null; rows: PlanRow[]; summary: PlanSummary };

/**
 * Plans an upload. `parsed` is mutated only to stamp the roster's publication on
 * each row, which is how a file with no publication column is read.
 */
export function planRoster(
  parsed: ParsedRow[],
  existing: ExistingStop[],
  publications: { id: string; code: string; name: string }[],
  rosterPublicationId: string | null,
  /**
   * `keepAll` skips the trim that keeps the browser payload small. A harness
   * wants every row; the screen only needs the actionable ones plus a sample.
   * Nothing else differs, so a harness and the screen decide identically.
   */
  options: { keepAll?: boolean } = {},
): PlanOutcome {
  const fail = (error: string): PlanOutcome => ({ error, rows: null, summary: null });

  // A roster names no publication per row, so the uploader picks one and it is
  // stamped on every row.
  let chosen: { id: string; code: string; name: string } | undefined;
  if (rosterPublicationId) {
    chosen = publications.find((pub) => pub.id === rosterPublicationId);
    if (!chosen) return fail("Pick which publication that list is for.");
    for (const row of parsed) row.publication = chosen.code;
  }

  const streetZones = buildStreetZoneMap(existing);

  // Which street spellings in THIS upload are our streets written differently is
  // a fact about the whole file, not about one row -- the evidence is whether
  // the file also uses our spelling, and for which house numbers. So it is
  // settled once, before any row is planned. See ruleStreetVariants.
  const fileStreets = new Map<string, Set<string>>();
  for (const row of parsed) {
    if (!row.street || !row.houseNumber) continue;
    const key = normalizeStreet(row.street);
    if (!fileStreets.has(key)) fileStreets.set(key, new Set());
    fileStreets.get(key)!.add(normalizeHouseNumber(row.houseNumber));
  }
  const ourStreets = new Map<string, Set<string>>();
  for (const stop of existing) {
    const key = normalizeStreet(stop.street);
    if (!ourStreets.has(key)) ourStreets.set(key, new Set());
    ourStreets.get(key)!.add(normalizeHouseNumber(stop.houseNumber));
  }
  const streetRuling = ruleStreetVariants(fileStreets, ourStreets);

  // Built once, not once per row -- see buildStopIndex.
  const stopIndex = buildStopIndex(existing);

  // Keyed on OUR address, not the file's spelling. ruleStreetVariants can rule
  // two spellings the same street -- "6 Shenandoah" and "6 Shenandoah Dr" both
  // resolve to SHENANDOAH DR -- but keying on the raw spelling put them in two
  // groups of one, so each counted alone and both read "already gets it" while
  // the second household got no paper. Invisible, because no_change rows are not
  // even shipped to the browser.
  const rowKeys: (string | null)[] = parsed.map((row) => {
    if (!row.street || !row.houseNumber) return null;
    const own = normalizeStreet(row.street);
    const ruled = streetRuling.get(own);
    const street = ruled?.ruling === "same" ? ruled.ourStreet : own;
    return `${street}|${normalizeHouseNumber(row.houseNumber)}`;
  });

  // Every roster row at each address, grouped, so the address is settled as a
  // whole rather than one row at a time. Only for a roster: a file with its own
  // action column says per row what it wants.
  const groups = new Map<string, RosterFileRow[]>();
  if (chosen) {
    parsed.forEach((row, i) => {
      const key = rowKeys[i];
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({
        floorSide: mergeFloorSides(row.floorSide, row.floorSideAlt),
        name: row.name ?? null,
        externalId: row.externalId ?? null,
      });
    });
  }
  const seenAtAddress = new Map<string, number>();
  const rows = parsed.map((row, i) => {
    let rosterGroup: RosterGroup | undefined;
    const key = rowKeys[i];
    if (chosen && key) {
      const index = seenAtAddress.get(key) ?? 0;
      seenAtAddress.set(key, index + 1);
      rosterGroup = { fileRows: groups.get(key) ?? [], index };
    }
    return planRow(row, existing, publications, streetZones, streetRuling, stopIndex, rosterGroup);
  });

  if (chosen) {
    const addressesWith = new Set(
      existing
        .filter((stop) => stop.publicationIds.includes(chosen.id))
        .map((stop) => `${normalizeStreet(stop.street)}|${normalizeHouseNumber(stop.houseNumber)}`),
    ).size;

    // A roster is the whole truth for its publication, so an address it no longer
    // carries is a cancellation. Nothing in the file says so -- it has to be
    // derived from our side.
    const removals = planRosterRemovals(existing, chosen, fileStreets, parsed.length + 2);

    // Removals are one row per LINE, so the count fed to the guard is the
    // distinct ADDRESSES behind them -- which is what the 5% threshold was
    // calibrated against. Counting lines would tighten it silently.
    const byId = new Map(existing.map((stop) => [stop.id, stop]));
    const stopping = new Set(
      removals
        .map((removal) => (removal.stopId ? byId.get(removal.stopId) : undefined))
        .filter((stop): stop is ExistingStop => Boolean(stop))
        .map((stop) => `${normalizeStreet(stop.street)}|${normalizeHouseNumber(stop.houseNumber)}`),
    ).size;
    const removalCheck = removalsLookWrong(stopping, addressesWith);
    if (removalCheck.tripped) {
      return fail(
        `That list would stop ${stopping} of ${addressesWith} ${chosen.name} addresses, ` +
          `well past the ${removalCheck.limit} a normal week reaches. That is usually a partial ` +
          `file or a column that did not line up, not ${stopping} cancellations. Nothing has been ` +
          `changed — check the file covers all of Lakewood and re-upload.`,
      );
    }
    rows.push(...removals);

    // The same tripwire on the other side of the diff. A doubled or concatenated
    // upload is the case it exists for.
    const adding = rows.filter((row) => row.status === "ready" && row.action === "add").length;
    const additionCheck = additionsLookWrong(adding, addressesWith);
    if (additionCheck.tripped) {
      return fail(
        `That list would add ${adding} deliveries to ${chosen.name}, well past the ` +
          `${additionCheck.limit} a normal week reaches. That is usually the same file twice, or ` +
          `two exports pasted together, not ${adding} new subscribers. Nothing has been changed — ` +
          `check the file and re-upload.`,
      );
    }
  }

  const summary: PlanSummary = {
    total: rows.length,
    ready: rows.filter((row) => row.status === "ready").length,
    needsChoice: rows.filter((row) => row.status === "needs_choice").length,
    noChange: rows.filter((row) => row.status === "no_change").length,
    // Split out of `blocked`: an address cell the importer could not read is a
    // thing the office can fix, unlike a street that is not on our routes.
    blocked: rows.filter((row) => row.status === "blocked" && !row.unreadable).length,
    unreadable: rows.filter((row) => row.unreadable).length,
    sampled: 0,
  };

  // Everything actionable, plus a handful of the rest so the office can spot
  // check that "not on our routes" really means that.
  if (options.keepAll) return { error: null, rows, summary };

  const actionable = rows.filter((row) => row.status === "ready" || row.status === "needs_choice");
  const sample = rows.filter((row) => row.status !== "ready" && row.status !== "needs_choice").slice(0, 40);
  summary.sampled = sample.length;

  return { error: null, rows: [...actionable, ...sample], summary };
}
