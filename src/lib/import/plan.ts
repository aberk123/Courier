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
import type { ParsedRow } from "./parse.ts";
import { buildQuestions, type QuestionUpsert } from "./questions.ts";
import {
  additionsLookWrong,
  normalizeFloorSide,
  settleAddress,
  surplusServedLines,
  keepPriority,
  buildStopIndex,
  buildStreetZoneMap,
  mergeFloorSides,
  normalizeHouseNumber,
  normalizeStreet,
  stripStreetSuffix,
  planRosterRemovals,
  planRow,
  removalsLookWrong,
  surplusLookWrong,
  buildRulingIndex,
  ruleStreetVariants,
  type AddressRuling,
  type ExistingStop,
  type PlanRow,
  type RosterFileRow,
  type RosterGroup,
} from "./match.ts";

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
  | { error: string; rows: null; summary: null; questions: null }
  | {
      error: null;
      rows: PlanRow[];
      summary: PlanSummary;
      /**
       * The standing questions this plan raises, for the /questions portal.
       * Computed from the FULL row list before the browser trim below — the
       * trim ships only a 40-row sample of the non-actionable rows, and the
       * unreadable-cell questions live there. Roster uploads only.
       */
      questions: QuestionUpsert[] | null;
    };

/**
 * Plans an upload. `parsed` is mutated only to stamp the roster's publication on
 * each row and to apply the trailing-A basement rule below -- both before
 * anything is grouped or matched, so every later stage sees one consistent row.
 */
export function planRoster(
  parsed: ParsedRow[],
  existing: ExistingStop[],
  publications: { id: string; code: string; name: string }[],
  rosterPublicationId: string | null,
  /** Answers the office has already given about an address or a street. */
  rulings: AddressRuling[] = [],
  /**
   * `keepAll` skips the trim that keeps the browser payload small. A harness
   * wants every row; the screen only needs the actionable ones plus a sample.
   * Nothing else differs, so a harness and the screen decide identically.
   */
  options: { keepAll?: boolean } = {},
): PlanOutcome {
  const fail = (error: string): PlanOutcome => ({ error, rows: null, summary: null, questions: null });

  // A roster names no publication per row, so the uploader picks one and it is
  // stamped on every row.
  let chosen: { id: string; code: string; name: string } | undefined;
  if (rosterPublicationId) {
    chosen = publications.find((pub) => pub.id === rosterPublicationId);
    if (!chosen) return fail("Pick which publication that list is for.");
    for (const row of parsed) row.publication = chosen.code;
  }

  const streetZones = buildStreetZoneMap(existing);

  const ourStreets = new Map<string, Set<string>>();
  for (const stop of existing) {
    const key = normalizeStreet(stop.street);
    if (!ourStreets.has(key)) ourStreets.set(key, new Set());
    ourStreets.get(key)!.add(normalizeHouseNumber(stop.houseNumber));
  }

  // The trailing-A basement rule (Ari, 2026-09-01): "If you see an A after a
  // house number, then you can assume you can match it to a basement, because
  // many times an A is listed when it means a basement." So the file's 68A on
  // a street where we deliver a plain 68 -- and hold no separate 68A of our own
  // (105A CANARY DR and 12A GILA PL are real distinct addresses; an exact match
  // always wins) -- is read as 68, basement. Only the letter A; only when the
  // row states no floor of its own (a stated door is an order and is never
  // overwritten); and done HERE, before grouping, or the rewritten row would
  // count in a group of its own -- the exact split-group defect the review
  // proved against rewriting inside planRow.
  for (const row of parsed) {
    if (!row.street || !row.houseNumber) continue;
    const lettered = /^(\d+)a$/i.exec(row.houseNumber.trim());
    if (!lettered) continue;
    const street = ourStreets.get(normalizeStreet(row.street));
    if (!street) continue;
    if (street.has(normalizeHouseNumber(row.houseNumber))) continue; // we hold the lettered address itself
    if (!street.has(normalizeHouseNumber(lettered[1]))) continue;    // ...and must hold the bare one
    if (normalizeFloorSide(row.floorSide) || normalizeFloorSide(row.floorSideAlt)) continue;
    row.houseNumber = lettered[1];
    row.floorSide = "basement";
  }

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
  const streetRuling = ruleStreetVariants(fileStreets, ourStreets);

  // Built once, not once per row -- see buildStopIndex.
  const stopIndex = buildStopIndex(existing);
  const rulingIndex = buildRulingIndex(rulings);

  // Normalising once per row here rather than three times: this file's history
  // includes a measured 58-second matching incident.
  //
  // Keyed on OUR address, not the file's spelling. ruleStreetVariants can rule
  // two spellings the same street -- "6 Shenandoah" and "6 Shenandoah Dr" both
  // resolve to SHENANDOAH DR -- but keying on the raw spelling put them in two
  // groups of one, so each counted alone and both read "already gets it" while
  // the second household got no paper. Invisible, because no_change rows are not
  // even shipped to the browser. Eight of our addresses are reached under more
  // than one spelling in the 27 Aug file.
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
  /** Addresses where some row is still a question — surplus is never removed
   * under an open question. Review-proven: the question's own row can sit at a
   * DIFFERENT key than the address it is about (the file's 132B asks the
   * unit_letter question about our 132), so the keys of every stop a question
   * row points at — its match and its candidates — are held too. */
  const keyHasQuestion = new Set<string>();
  const addressKeyOfStop = new Map(
    existing.map((stop) => [
      stop.id,
      `${normalizeStreet(stop.street)}|${normalizeHouseNumber(stop.houseNumber)}`,
    ]),
  );
  const rows = parsed.map((row, i) => {
    let rosterGroup: RosterGroup | undefined;
    const key = rowKeys[i];
    if (chosen && key) {
      const index = seenAtAddress.get(key) ?? 0;
      seenAtAddress.set(key, index + 1);
      rosterGroup = { fileRows: groups.get(key) ?? [], index };
    }
    const planned = planRow(row, existing, publications, streetZones, streetRuling, stopIndex, rosterGroup, rulingIndex);
    if (planned.status === "needs_choice") {
      if (key) keyHasQuestion.add(key);
      if (planned.stopId) keyHasQuestion.add(addressKeyOfStop.get(planned.stopId) ?? "");
      for (const candidate of planned.candidates) {
        keyHasQuestion.add(addressKeyOfStop.get(candidate.stopId) ?? "");
      }
    }
    return planned;
  });

  // An unreadable row is a claimant nobody could place: "Maple Avenue 12 ·
  // Katz" may be the very household whose line the surplus rule is about to
  // cut, sitting one row up as "could not read". Review-proven with the real
  // parser. So a surplus on any street an unreadable cell mentions is a choice
  // for a person, not a ready cut, until the office fixes the cell. (A row with
  // no address text at all can claim nothing identifiable and holds nothing.)
  const unreadableTexts = chosen
    ? parsed
        .filter((row) => row.problem && (row.street || row.houseNumber))
        .map((row) => normalizeStreet(`${row.houseNumber} ${row.street}`))
    : [];

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

    // The same truth WITHIN an address (Ari, 2026-09-01, relaying the Voice
    // office): on the master list once means one paper, so our lines the list's
    // rows did not claim are proposed for removal too. One review row per
    // surplus line; ready where the line is identifiable, a choice where the
    // address holds more than two lines -- "an address holding more than two
    // lines is never written to blind" still stands, so there the office picks
    // which line stops. Skipped entirely while the address has any open
    // question. See surplusServedLines for the exemptions.
    let surplusRowNumber = parsed.length + 2 + removals.length;
    for (const [key, fileRows] of groups) {
      if (keyHasQuestion.has(key)) continue;
      const atAddress = stopIndex.byStreetAndHouse.get(key) ?? [];
      if (!atAddress.length) continue;
      const outcomes = settleAddress(atAddress, fileRows, chosen.id);
      const surplus = surplusServedLines(atAddress, outcomes, chosen.id);
      const streetBase = atAddress.length
        ? stripStreetSuffix(normalizeStreet(atAddress[0].street))
        : "";
      const heldByUnreadable =
        streetBase.length > 0 && unreadableTexts.some((text) => text.includes(streetBase));
      for (const line of surplus) {
        const label = `${line.houseNumber} ${line.street}` +
          `${line.floorSide ? ` (${line.floorSide})` : ""}` +
          `${line.recipientName ? ` · ${line.recipientName}` : ""}`;
        const crowded = atAddress.length > 2;
        const ready = !crowded && !heldByUnreadable;
        removals.push({
          rowNumber: surplusRowNumber++,
          action: "remove",
          summary: label,
          street: line.street,
          houseNumber: line.houseNumber,
          publicationId: chosen.id,
          publicationName: chosen.name,
          status: ready ? "ready" : "needs_choice",
          message: crowded
            ? `the new ${chosen.name} list has ${fileRows.length} at this address but ` +
              `${atAddress.length} lines receive it — pick which line stops`
            : heldByUnreadable
              ? `on the new ${chosen.name} list ${fileRows.length === 1 ? "once" : `${fileRows.length} times`}, ` +
                `but more lines receive it — and an unreadable row in the file mentions this street, ` +
                `so confirm it is not this household before stopping the line`
              : `on the new ${chosen.name} list ${fileRows.length === 1 ? "once" : `${fileRows.length} times`}, ` +
                `but more lines receive it — stop this one`,
          candidates: ready
            ? []
            : [...surplus].sort((a, b) => keepPriority(a) - keepPriority(b)).map((s) => ({
                stopId: s.id,
                label: `${s.houseNumber} ${s.street}${s.floorSide ? ` · ${s.floorSide}` : ""}${s.recipientName ? ` · ${s.recipientName}` : ""}`,
                zoneNumber: s.zoneNumber,
              })),
          stopId: ready ? line.id : null,
          newStop: null,
          instructions: null,
          floorSide: line.floorSide,
          surplusLine: true,
        });
      }
    }

    // Removals are one row per LINE, so the count fed to the guard is the
    // distinct ADDRESSES behind them -- which is what the 5% threshold was
    // calibrated against. Counting lines would tighten it silently.
    const byId = new Map(existing.map((stop) => [stop.id, stop]));
    const addressOf = (removal: PlanRow) => {
      const stop = removal.stopId ? byId.get(removal.stopId) : undefined;
      const source = stop ?? { street: removal.street, houseNumber: removal.houseNumber };
      return `${normalizeStreet(source.street)}|${normalizeHouseNumber(source.houseNumber)}`;
    };
    // Whole-address removals feed the guard they were always calibrated for;
    // the surplus lines get their own (see surplusLookWrong -- the failure
    // signatures differ, and the first count-sync is legitimately large).
    const stopping = new Set(
      removals.filter((r) => !r.surplusLine).map(addressOf),
    ).size;
    const surplusAddresses = new Set(
      removals.filter((r) => r.surplusLine).map(addressOf),
    ).size;
    // Recorded intent (review, 2026-09-01): once the database mirrors an
    // applied week, this limit should drop toward the whole-address guard's 5%
    // -- the floor of 60 exists for the first count-sync only. A per-line cut
    // is exactly as severe as a whole-address removal for that household; the
    // "copy" framing must not be read as milder. Known shape that sails under
    // both guards: an export deduplicated to one row per address.
    const surplusCheck = surplusLookWrong(surplusAddresses, addressesWith);
    if (surplusCheck.tripped) {
      return fail(
        `That list would cut copies at ${surplusAddresses} of ${addressesWith} ${chosen.name} ` +
        `addresses, past the ${surplusCheck.limit} a normal week reaches. That is usually a file ` +
        `cut off mid-address, not real churn. Nothing has been changed — check the file and re-upload.`,
      );
    }
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
  //
  // This trim is not cosmetic. The whole plan is 5.4 MB of JSON, it was held in a
  // hidden field and posted back on Apply, and Next.js caps a Server Action body
  // at 6 MB -- rejecting it BEFORE the action runs, so it cannot be caught and
  // turned into a message. The office would have clicked Apply and watched
  // nothing happen. It was also 19,600 rows in the DOM, which locked the page up
  // for a minute.
  const questions = chosen ? buildQuestions(rows, chosen.id, existing) : null;

  if (options.keepAll) {
    // `rows` carries everything here, so "sampled" is not 40 examples -- it is
    // the whole non-actionable remainder. Reporting 0 would have made a harness
    // read the summary as if it were the screen's.
    summary.sampled = rows.length - summary.ready - summary.needsChoice;
    return { error: null, rows, summary, questions };
  }

  const actionable = rows.filter((row) => row.status === "ready" || row.status === "needs_choice");
  const sample = rows.filter((row) => row.status !== "ready" && row.status !== "needs_choice").slice(0, 40);
  summary.sampled = sample.length;

  return { error: null, rows: [...actionable, ...sample], summary, questions };
}
