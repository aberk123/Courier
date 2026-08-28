import type { ParsedRow } from "./parse";

export type ExistingStop = {
  id: string;
  zoneId: string;
  zoneNumber: number;
  recipientName: string | null;
  houseNumber: string;
  street: string;
  floorSide: string | null;
  publicationIds: string[];
  /**
   * False for a stop a publication's subscriber export will never contain --
   * commercial drops, institutions. Such a stop can still be added to; it just
   * must never be removed because a roster failed to mention it.
   */
  rosterManaged?: boolean;
};

export type Candidate = { stopId: string; label: string; zoneNumber: number };

export type PlanRow = {
  rowNumber: number;
  action: ParsedRow["action"];
  summary: string;
  publicationId: string | null;
  publicationName: string | null;
  /**
   * ready        = safe to apply
   * needs_choice = a person must pick
   * no_change    = matched, and already correct -- nothing to do
   * blocked      = cannot be applied at all
   *
   * no_change exists because it was being reported as blocked, so a row the
   * matcher had resolved perfectly ("already gets The Voice") was counted under
   * "cannot be applied" alongside streets in a different part of town. On the
   * real Voice roster that is over a thousand rows of success filed as failure.
   */
  status: "ready" | "needs_choice" | "no_change" | "blocked";
  message: string;
  candidates: Candidate[];
  /** Set for ready rows that target an existing stop. */
  stopId: string | null;
  /** Set for ready "add" rows that will create a new stop. */
  newStop: {
    zoneId: string | null;
    zoneNumber: number | null;
    zoneCandidates: { zoneId: string; zoneNumber: number }[];
    recipientName: string | null;
    houseNumber: string;
    street: string;
    floorSide: string | null;
    instructions: string | null;
  } | null;
  instructions: string | null;
  floorSide: string | null;
};

const SUFFIXES: Record<string, string> = {
  street: "st", str: "st", st: "st",
  avenue: "ave", av: "ave", ave: "ave",
  drive: "dr", dr: "dr",
  court: "ct", ct: "ct",
  circle: "cir", cir: "cir", circ: "cir",
  road: "rd", rd: "rd",
  lane: "ln", ln: "ln",
  place: "pl", pl: "pl",
  boulevard: "blvd", blvd: "blvd", boul: "blvd",
  terrace: "ter", ter: "ter", terr: "ter",
  parkway: "pkwy", pkwy: "pkwy",
  way: "way",
  trail: "trl", trl: "trl",
  square: "sq", sq: "sq",
};

/** Uppercase, strip punctuation, canonicalise the street-type suffix. */
export function normalizeStreet(value: string): string {
  const words = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  const last = words[words.length - 1];
  if (SUFFIXES[last]) words[words.length - 1] = SUFFIXES[last];
  return words.join(" ");
}

/**
 * Drops a trailing canonical street-type suffix from an already-normalized
 * street, so a search for "squankum rd" still finds "SQUANKUM ROAD". Callers
 * searching the database need this because the suffix a CSR types is rarely the
 * one the route sheet used.
 */
export function stripStreetSuffix(normalizedStreet: string): string {
  const words = normalizedStreet.split(" ").filter(Boolean);
  if (words.length < 2) return normalizedStreet;
  const suffixes = new Set(Object.values(SUFFIXES));
  if (suffixes.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

export function normalizeHouseNumber(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * upstairs / basement / nothing. Never anything else, and never a guess --
 * floor/side is part of an address's identity, so a wrong label picks the wrong
 * household at a two-family house.
 *
 * The first version was `/base|bsmt|bsmnt|down/` then `/up|second|2nd|top/`,
 * both unanchored. Measured against all 970 distinct floor cells in The Voice's
 * real roster (docs/domain-notes.md), it got three classes of value wrong:
 *
 *   - Six real basements returned nothing, because `basment` contains none of
 *     `base`, `bsmt` or `bsmnt`.
 *   - `upstairs (no one lives in basement)` returned basement: the basement
 *     branch ran first, and the word appears in a note *denying* it.
 *   - Unanchored `/up/` matched the "up" inside "older co(up)le", and `top`
 *     matched "on top of mailbox" -- inventing a floor out of placement text.
 *
 * So: whole words only, the misspellings that actually occur spelled out, and a
 * cell naming both floors resolves to nothing rather than picking one.
 */
const UPSTAIRS =
  /\b(?:up|upstairs|upstair|upstaira|upstaire|uptairs|usptairs|upsatirs)\b|\b(?:2nd|second)\s+floor\b/;
const BASEMENT =
  /\b(?:basement|basment|basemnt|bsement|bsmt|bsmnt|bmnst|bmsnt|downstairs)\b|\blower\s+level\b/;

export function normalizeFloorSide(value: string | null): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  const up = UPSTAIRS.test(v);
  const down = BASEMENT.test(v);
  // Both named, e.g. "Upstairs and downstairs" -- unresolvable, so label nothing.
  if (up && down) return null;
  if (down) return "basement";
  if (up) return "upstairs";
  return null;
}

/**
 * Some cells carry a floor in each of the two extension columns the publication
 * exports. Union them, and refuse to choose when they disagree.
 */
export function mergeFloorSides(a: string | null, b: string | null): string | null {
  const first = normalizeFloorSide(a);
  const second = normalizeFloorSide(b);
  if (first && second) return first === second ? first : null;
  return first ?? second;
}

const STREET_TYPES = new Set(Object.values(SUFFIXES));
const houseNum = (h: string) => parseInt(h, 10) || 0;

/**
 * Is one of our addresses present in the upload under ANY spelling of its street?
 *
 * Only ever used to *suppress* a removal, never to create a match, so it is
 * deliberately generous where the ruling is strict. The asymmetry is the point:
 * a wrong addition wastes one paper, a wrong removal stops a paying subscriber
 * and they complain to the publication rather than to us, so nobody here finds
 * out. Being too eager to suppress costs a stale address; being too strict costs
 * a cancelled subscriber.
 *
 * It catches what ruleStreetVariants cannot, because the ruling groups streets
 * by their base word and a typo changes the base word itself. On the real Voice
 * roster our 10 SHENANDOAH DR is written "10 Shenendoah Dr", and a check that
 * only knew about street *types* read that address as gone. Seven of nine
 * apparent cancellations in zones 1-2 were this shape.
 *
 * The unit letter is treated the same way: we hold 105A CANARY DR where the
 * upload writes 105 with "apt A" in its floor column, and vice versa.
 *
 * Generous is not the same as blind. Comparison is on the street's base word
 * with its type stripped, so CANARY ST can stand in for our CANARY DR, and the
 * tolerance scales with length: two edits are allowed only on a base of eight
 * characters or more. Flat "within two edits" suppressed 207 CAROL ST because
 * the upload contains 207 CAREY ST -- two edits on a five-letter name, and a
 * different street. That is the opposite failure and just as bad: a suppressor
 * that swallows everything makes removals useless.
 */
function sameStreetLoosely(a: string, b: string): boolean {
  if (a === b) return true;
  const baseA = stripStreetSuffix(a);
  const baseB = stripStreetSuffix(b);
  if (baseA === baseB) return true;
  const distance = editDistance(baseA, baseB);
  if (distance <= 1) return true;
  return distance === 2 && Math.min(baseA.length, baseB.length) >= 8;
}

export function listedUnderAnySpelling(
  ourStreet: string,
  ourHouse: string,
  fileStreets: Map<string, Set<string>>,
): boolean {
  const street = normalizeStreet(ourStreet);
  const house = normalizeHouseNumber(ourHouse);
  const bare = house.replace(/[a-z]$/, "");
  for (const [candidate, houses] of fileStreets) {
    if (!sameStreetLoosely(candidate, street)) continue;
    for (const theirs of houses) {
      if (theirs === house) return true;
      if (theirs.replace(/[a-z]$/, "") === bare) return true;
    }
  }
  return false;
}

export type StreetRuling = "same" | "different" | "unresolved";

/**
 * Decides, for every street spelling in an upload that does not match one of
 * ours exactly, whether it IS one of our streets written differently.
 *
 * This exists because edit distance cannot tell the two cases apart, and both
 * occur in the same real file. `HAZELWOOD CT` is our HAZELWOOD LN; `CHELSEA RD`
 * is a different road that merely rhymes with our CHELSEA CT. Both are two edits
 * away from ours and both share house numbers with us. Matching on the name
 * alone either invents deliveries or cancels real ones -- and a wrong
 * cancellation is the one nobody finds out about.
 *
 * The evidence that separates them is in the upload itself, so all of it is
 * needed at once rather than row by row:
 *
 *   1. No street type at all (`PONDEROSA`) and exactly one of our streets
 *      carries that base -- a bare base word cannot be a *different* street.
 *   2. It holds none of our house numbers -- a different street.
 *   3. Most of its numbers sit outside the range we cover -- a different street.
 *      `CEDAR CT` runs to 70 where our CEDAR ST stops at 18.
 *   4. The upload ALSO uses our spelling. Disjoint number sets mean one street
 *      written two ways (`HAZELWOOD CT` 4,6,11,14,19 against the file's own
 *      HAZELWOOD LN 1,3,8,9,10,12,15,16 -- never the same number, and together
 *      they fill our 1-17). Overlapping sets mean two real roads.
 *   5. The upload never uses our spelling -- then this is our street.
 *
 * Anything left over is "unresolved" and must reach a person. `VINE ST` is the
 * case that forces that: the file uses that one name both for a road in the 100s
 * we do not serve and for 580-736, which is our VINE AVE.
 */
export function ruleStreetVariants(
  fileStreets: Map<string, Set<string>>,
  ourStreets: Map<string, Set<string>>,
): Map<string, { ourStreet: string; ruling: StreetRuling; why: string }> {
  const byBase = new Map<string, string[]>();
  for (const street of ourStreets.keys()) {
    const base = stripStreetSuffix(street);
    byBase.set(base, [...(byBase.get(base) ?? []), street]);
  }

  const out = new Map<string, { ourStreet: string; ruling: StreetRuling; why: string }>();
  for (const [fileStreet, fileNums] of fileStreets) {
    if (ourStreets.has(fileStreet)) continue; // exact match, nothing to rule
    const candidates = byBase.get(stripStreetSuffix(fileStreet)) ?? [];
    if (candidates.length !== 1) continue; // no candidate, or ambiguous between our own streets
    const ourStreet = candidates[0];
    const ourNums = ourStreets.get(ourStreet)!;
    const put = (ruling: StreetRuling, why: string) => out.set(fileStreet, { ourStreet, ruling, why });

    const last = fileStreet.split(" ").pop() ?? "";
    if (!STREET_TYPES.has(last)) {
      put("same", `no street type given, and only ${ourStreet.toUpperCase()} carries that name`);
      continue;
    }

    const overlap = [...fileNums].filter((n) => ourNums.has(n));
    if (!overlap.length) {
      put("different", `holds none of the house numbers we deliver to on ${ourStreet.toUpperCase()}`);
      continue;
    }

    const values = [...ourNums].map(houseNum).filter(Boolean);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const outside = [...fileNums].filter((n) => houseNum(n) < lo || houseNum(n) > hi);

    // Substantially in our range AND substantially outside it means the upload
    // is using one name for two roads. VINE ST does exactly this, covering both
    // a stretch in the 100s we do not serve and 580-736, which is our VINE AVE.
    // Calling the whole spelling "different" would drop the real addresses and,
    // once removals are enabled, read them as cancellations; calling it "same"
    // would invent deliveries on our street for the other road's numbers. So it
    // goes to a person to split row by row. One or two collisions either way is
    // coincidence; three is a pattern. Deliberately not a ratio -- an evenly
    // split street is the ambiguous case, not a resolved one.
    if (overlap.length >= 3 && outside.length >= 3) {
      put("unresolved", `it covers both our ${lo}-${hi} and a stretch well outside it — one name, two roads`);
      continue;
    }
    if (outside.length > fileNums.size / 2) {
      put("different", `most of its numbers fall outside our ${lo}-${hi} on ${ourStreet.toUpperCase()}`);
      continue;
    }

    const canonical = fileStreets.get(ourStreet);
    if (!canonical) {
      put("same", `the upload never spells it ${ourStreet.toUpperCase()}, and its numbers are ours`);
      continue;
    }
    const collides = [...fileNums].some((n) => canonical.has(n));
    if (!collides) {
      put("same", `the upload uses both spellings but never for the same house number`);
    } else {
      put("unresolved", `the upload uses both spellings for some of the same house numbers`);
    }
  }
  return out;
}

/** Levenshtein, capped — we only care about near-misses. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function labelFor(stop: ExistingStop) {
  const bits = [`${stop.houseNumber} ${stop.street}`];
  if (stop.floorSide) bits.push(stop.floorSide);
  if (stop.recipientName) bits.push(stop.recipientName);
  return `${bits.join(" · ")} (zone ${stop.zoneNumber})`;
}

/**
 * Resolves one spreadsheet row against the existing stops.
 *
 * Auto-merges only when the match is unambiguous; anything with more than one
 * plausible target comes back as needs_choice for the user to resolve, which is
 * what was asked for on the requirements call.
 */
export function planRow(
  row: ParsedRow,
  stops: ExistingStop[],
  publications: { id: string; code: string; name: string }[],
  streetZones: Map<string, { zoneId: string; zoneNumber: number }[]>,
  /**
   * Ruling for every street spelling in this upload that is not one of ours --
   * see ruleStreetVariants. Without it a near-miss street cannot be told from a
   * different road with a similar name, and the matcher auto-merges both.
   */
  streetRuling: Map<string, { ourStreet: string; ruling: StreetRuling; why: string }> = new Map(),
): PlanRow {
  const base: PlanRow = {
    rowNumber: row.rowNumber,
    action: row.action,
    summary: `${row.houseNumber} ${row.street}${row.name ? ` · ${row.name}` : ""}`,
    publicationId: null,
    publicationName: null,
    status: "blocked",
    message: "",
    candidates: [],
    stopId: null,
    newStop: null,
    instructions: row.instructions,
    floorSide: mergeFloorSides(row.floorSide, row.floorSideAlt),
  };

  if (row.problem) return { ...base, message: row.problem };

  // Resolve publication (required for add/remove, optional for change)
  let publication: { id: string; code: string; name: string } | undefined;
  if (row.publication) {
    const key = row.publication.toLowerCase().replace(/[^a-z0-9]/g, "");
    publication = publications.find(
      (pub) =>
        pub.code.replace(/[^a-z0-9]/g, "") === key ||
        pub.name.toLowerCase().replace(/[^a-z0-9]/g, "") === key,
    );
    if (!publication) {
      return { ...base, message: `unknown publication "${row.publication}"` };
    }
  }
  if ((row.action === "add" || row.action === "remove") && !publication) {
    return { ...base, message: "a publication is required to add or remove" };
  }
  base.publicationId = publication?.id ?? null;
  base.publicationName = publication?.name ?? null;

  const street = normalizeStreet(row.street);
  const house = normalizeHouseNumber(row.houseNumber);

  let matches = stops.filter(
    (stop) =>
      normalizeStreet(stop.street) === street && normalizeHouseNumber(stop.houseNumber) === house,
  );

  // No exact street hit. This used to accept any street within two edits that
  // shared the house number, and call the result ready -- which cannot tell
  // "HAZELWOOD CT is our HAZELWOOD LN" from "CHELSEA RD is a different road".
  // Both are two edits away and both share house numbers with us. So the ruling
  // decides, and anything it cannot settle goes to a person instead of being
  // applied. `needsPerson` carries the reason through to the review screen.
  let fuzzy = false;
  let needsPerson: string | null = null;
  const onOur = (ourStreet: string) =>
    stops.filter(
      (stop) =>
        normalizeStreet(stop.street) === ourStreet &&
        normalizeHouseNumber(stop.houseNumber) === house,
    );

  if (!matches.length) {
    const ruled = streetRuling.get(street);
    if (ruled?.ruling === "different") {
      return {
        ...base,
        status: "blocked",
        message: `${row.street.toUpperCase()} is not one of our streets — ${ruled.why}`,
      };
    }
    if (ruled?.ruling === "same") {
      matches = onOur(ruled.ourStreet);
      fuzzy = matches.length > 0;
    } else if (ruled?.ruling === "unresolved") {
      matches = onOur(ruled.ourStreet);
      if (matches.length) needsPerson = ruled.why;
    } else {
      // No ruling at all: the base word itself differs, so this is a typo
      // ("SHENENDOAH DR"). Still worth surfacing, never worth auto-applying.
      matches = stops.filter(
        (stop) =>
          normalizeHouseNumber(stop.houseNumber) === house &&
          editDistance(normalizeStreet(stop.street), street) <= 2,
      );
      if (matches.length) needsPerson = `the street is spelled differently from ours`;
    }
  }

  // The unit written as a letter on the house number on one side and not the
  // other -- we hold 105A CANARY DR, the upload says 105 with "apt A" in its
  // floor column, or the reverse. Measured on the real roster this is a larger
  // source of false cancellations than the street-suffix problem, because the
  // address looks absent and a roster import reads absent as gone.
  if (!matches.length) {
    const bare = house.replace(/[a-z]$/, "");
    const letterKin = stops.filter((stop) => {
      if (normalizeStreet(stop.street) !== street) return false;
      const theirs = normalizeHouseNumber(stop.houseNumber);
      return theirs !== house && theirs.replace(/[a-z]$/, "") === bare;
    });
    if (letterKin.length) {
      matches = letterKin;
      needsPerson = `we deliver to ${letterKin
        .map((stop) => stop.houseNumber)
        .join(" and ")} on this street, not ${row.houseNumber} — same door or a second unit?`;
    }
  }

  // Narrow by floor/side, then by name, before declaring it ambiguous.
  if (matches.length > 1 && base.floorSide) {
    const byFloor = matches.filter((stop) => stop.floorSide === base.floorSide);
    if (byFloor.length) matches = byFloor;
  }
  if (matches.length > 1 && row.name) {
    const key = row.name.toLowerCase().replace(/[^a-z]/g, "");
    const byName = matches.filter(
      (stop) =>
        stop.recipientName &&
        editDistance(stop.recipientName.toLowerCase().replace(/[^a-z]/g, ""), key) <= 2,
    );
    if (byName.length) matches = byName;
  }

  const candidates = matches.map((stop) => ({
    stopId: stop.id,
    label: labelFor(stop),
    zoneNumber: stop.zoneNumber,
  }));

  if (row.action === "remove" || row.action === "change") {
    if (!matches.length) {
      return { ...base, message: "no matching address found" };
    }
    if (matches.length > 1) {
      return {
        ...base,
        status: "needs_choice",
        candidates,
        message: `${matches.length} addresses match — pick one`,
      };
    }
    const stop = matches[0];
    if (needsPerson) {
      return { ...base, status: "needs_choice", stopId: stop.id, candidates, message: needsPerson };
    }
    if (row.action === "remove" && publication && !stop.publicationIds.includes(publication.id)) {
      return {
        ...base,
        status: "no_change",
        stopId: stop.id,
        message: `${stop.recipientName ?? "this address"} does not currently get ${publication.name}`,
      };
    }
    return {
      ...base,
      status: "ready",
      stopId: stop.id,
      candidates,
      message: fuzzy ? `matched "${stop.street}" (spelling differs)` : "",
    };
  }

  // action === "add"
  if (matches.length === 1) {
    const stop = matches[0];
    if (needsPerson) {
      return { ...base, status: "needs_choice", stopId: stop.id, candidates, message: needsPerson };
    }
    if (publication && stop.publicationIds.includes(publication.id)) {
      return {
        ...base,
        status: "no_change",
        stopId: stop.id,
        message: `already gets ${publication.name} — nothing to do`,
      };
    }
    return {
      ...base,
      status: "ready",
      stopId: stop.id,
      candidates,
      message: fuzzy
        ? `adding to existing "${stop.street}" (spelling differs)`
        : "adding to existing address",
    };
  }
  if (matches.length > 1) {
    return {
      ...base,
      status: "needs_choice",
      candidates,
      message: `${matches.length} addresses match — pick one, or add it as a new address`,
      newStop: newStopFrom(row, base, streetZones.get(street) ?? []),
    };
  }

  // Brand new address: infer the zone from other stops on the same street.
  const zoneCandidates = streetZones.get(street) ?? [];

  // The street name matches ours exactly, but is this the stretch we walk?
  // A town-wide roster contains the whole of a street we only cover part of:
  // OAK ST 1386-1491 against our 26-110, twelve HENRY ST numbers in the 200s
  // against our 28-111, VINE AVE 102-186 against our 550-736, MARC DR 8-50
  // against our 504-604. Fifty of the sixty-eight "new addresses" on the real
  // Voice roster were this. Nothing flagged them, because ruleStreetVariants
  // only looks at streets whose NAME differs -- so an exact name match with a
  // house number from a different part of town sailed through as ready.
  //
  // Not blocked, because the judgement is genuinely open at the edges: 19
  // HAZELWOOD LN just past our 1-17 is probably the next house along, and
  // docs/domain-notes.md records 314 CEDAR BRIDGE AVE as a real addition even
  // though our Cedar Bridge is only 417 and 419. So it becomes a decision with
  // the range named, rather than a silent creation in the wrong part of town.
  const numbersOnStreet = stops
    .filter((stop) => normalizeStreet(stop.street) === street)
    .map((stop) => parseInt(normalizeHouseNumber(stop.houseNumber), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  const asNumber = parseInt(house, 10);
  if (numbersOnStreet.length && Number.isFinite(asNumber) && asNumber > 0) {
    const lo = Math.min(...numbersOnStreet);
    const hi = Math.max(...numbersOnStreet);
    if (asNumber < lo || asNumber > hi) {
      return {
        ...base,
        status: "needs_choice",
        message: `${row.houseNumber} is outside the ${lo}–${hi} stretch of ${row.street.toUpperCase()} our routes cover — confirm it is on this route before adding it`,
        newStop: newStopFrom(row, base, zoneCandidates),
      };
    }
  }

  // A street that appears in no route at all is out of the area we deliver to.
  // A publication's roster covers a whole town -- 18,018 of the 19,621 rows in
  // the real Voice file are on 1,856 streets we have never delivered to -- so
  // asking the office to place each one would bury the handful that matter
  // under thousands that do not. Ari's rule is that an unplaced address stays
  // off the route pages; it is reported, not queued as a decision.
  if (!zoneCandidates.length) {
    // Deliberately NO newStop. The review screen offers a route picker whenever
    // a row carries one, and picking a route marks the row ready -- so leaving
    // it populated here meant every one of the ~19,000 out-of-area rows showed
    // a dropdown that would happily place 27 Hawk Way on a route that has never
    // been near Hawk Way. There is nothing to choose: we do not deliver to that
    // street at all.
    return {
      ...base,
      status: "blocked",
      message: `${row.street.toUpperCase()} is not on any of our routes`,
    };
  }

  return {
    ...base,
    status: zoneCandidates.length === 1 ? "ready" : "needs_choice",
    message:
      zoneCandidates.length === 1
        ? `new address — zone ${zoneCandidates[0].zoneNumber} (from other stops on this street)`
        : "new address — this street spans several zones, pick one",
    newStop: newStopFrom(row, base, zoneCandidates),
  };
}

function newStopFrom(
  row: ParsedRow,
  base: PlanRow,
  zoneCandidates: { zoneId: string; zoneNumber: number }[],
): NonNullable<PlanRow["newStop"]> {
  return {
    zoneId: zoneCandidates.length === 1 ? zoneCandidates[0].zoneId : null,
    zoneNumber: zoneCandidates.length === 1 ? zoneCandidates[0].zoneNumber : null,
    zoneCandidates,
    recipientName: row.name,
    houseNumber: row.houseNumber,
    street: row.street,
    floorSide: base.floorSide,
    instructions: row.instructions,
  };
}

/**
 * Turns "absent from the roster" into proposed removals.
 *
 * A publication's roster says who should be receiving it. It has no way to say
 * "cancel this one" -- a cancellation shows up only as an address that is no
 * longer there. So the removals have to be derived by walking our own list, and
 * that is the dangerous direction: every weakness in matching becomes a
 * subscriber who silently stops getting their paper.
 *
 * Three rules keep it honest:
 *
 *  - Only addresses on streets the roster actually covers are considered. The
 *    roster is town-wide but we hold five zones of about thirty, so a street the
 *    upload never mentions at all means the publication did not send us that
 *    part of town, not that everyone on it cancelled.
 *  - Presence is tested with listedUnderAnySpelling, which is deliberately
 *    looser than the matcher.
 *  - It works at address level, never unit level. If a house has two units
 *    taking the publication and the roster lists the address once, neither is
 *    removed. Ari's rule is a count per address; a roster cannot say which unit
 *    stopped, so this does not guess. The cost is that a house going from two
 *    copies to one is not detected here.
 */
export function planRosterRemovals(
  stops: ExistingStop[],
  publication: { id: string; name: string },
  fileStreets: Map<string, Set<string>>,
  startingRowNumber: number,
): PlanRow[] {
  // Streets the roster covers at all -- compared loosely, so a street that only
  // ever appears misspelled still counts as covered.
  const covered = (street: string) =>
    [...fileStreets.keys()].some((candidate) => sameStreetLoosely(candidate, normalizeStreet(street)));

  const seen = new Set<string>();
  const out: PlanRow[] = [];
  let rowNumber = startingRowNumber;

  for (const stop of stops) {
    if (!stop.publicationIds.includes(publication.id)) continue;
    // The round includes commercial drops -- Silvino's Auto, Ocean Dental,
    // Leisure Chateau -- that a subscriber export will never list. Without this
    // every roster import would propose cancelling all of them, every week.
    if (stop.rosterManaged === false) continue;
    const key = `${normalizeStreet(stop.street)}|${normalizeHouseNumber(stop.houseNumber)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!covered(stop.street)) continue;
    if (listedUnderAnySpelling(stop.street, stop.houseNumber, fileStreets)) continue;

    out.push({
      rowNumber: rowNumber++,
      action: "remove",
      summary: `${stop.houseNumber} ${stop.street}${stop.recipientName ? ` · ${stop.recipientName}` : ""}`,
      publicationId: publication.id,
      publicationName: publication.name,
      status: "ready",
      message: `not on the new ${publication.name} list — stop delivering`,
      candidates: [],
      stopId: stop.id,
      newStop: null,
      instructions: null,
      floorSide: null,
    });
  }
  return out;
}

/**
 * Real week-to-week churn on these routes is a handful of addresses. A run that
 * proposes to cancel a large slice of a publication's list is a matching fault
 * or a truncated file, not a week's changes -- and it is the one mistake nobody
 * finds out about, because the subscriber complains to the publication.
 *
 * So the run stops and says so rather than applying. This is the "diff two
 * consecutive issues" control from docs/handoff.md, in the only form available
 * before there is a previous file to diff against: once the database mirrors
 * last week's roster, the same check compares this week to last week for free.
 */
export function removalsLookWrong(
  removals: number,
  publicationAddresses: number,
): { tripped: boolean; limit: number } {
  const limit = Math.max(25, Math.round(publicationAddresses * 0.05));
  return { tripped: removals > limit, limit };
}

/** street (normalized) -> zones that already contain it */
export function buildStreetZoneMap(stops: ExistingStop[]) {
  const map = new Map<string, { zoneId: string; zoneNumber: number }[]>();
  for (const stop of stops) {
    const key = normalizeStreet(stop.street);
    const list = map.get(key) ?? [];
    if (!list.some((zone) => zone.zoneId === stop.zoneId)) {
      list.push({ zoneId: stop.zoneId, zoneNumber: stop.zoneNumber });
    }
    map.set(key, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.zoneNumber - b.zoneNumber);
  return map;
}
