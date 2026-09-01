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

/**
 * Machine-readable identity of a question, so an answer recorded against it can
 * be found again next week. The prose message is for people and gets reworded;
 * the kind never does. Grouping rule learned from review: a question that is
 * the same real-world question must map to ONE kind however many code paths
 * emit it -- both "has this household moved?" shapes are door_conflict, both
 * duplicate-detection reasons are duplicate_lines -- or the key flips between
 * weeks and the recorded answer is orphaned.
 */
export type QuestionKind =
  | "out_of_stretch"      // house number beyond the covered stretch of our street
  | "wrong_side_parity"   // every number we deliver is one parity, this is the other
  | "gap_between_blocks"  // falls between two delivered blocks
  | "route_position"      // brand-new door, one zone, needs a place in the walking order
  | "street_spans_zones"  // brand-new door, street lives in several zones
  | "near_miss_named"     // file street ~ our street, surname matches
  | "street_identity"     // one spelling covering our road and another (VINE ST)
  | "unit_letter"         // 132 vs 132A -- same door or a second unit?
  | "count_vs_capacity"   // more households listed than the house has
  | "no_current_delivery" // 3+ listed at an address we deliver none of
  | "crowded_address"     // 3+ lines on our side, indistinguishable here
  | "door_conflict"       // the list and the delivery disagree about the door
  | "pick_line"           // several addresses match, pick one
  | "unreadable_cell";    // the address cell itself could not be read

/** Tiny stable string hash (djb2) for keys that have no address to key on. */
export function hashKey(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export type PlanRow = {
  rowNumber: number;
  action: ParsedRow["action"];
  summary: string;
  /**
   * The address as the file wrote it, carried outside `summary` so the review
   * screen's "stop asking" buttons can record a ruling for rows that carry no
   * `newStop` -- the near-miss street questions. `summary` also holds the
   * subscriber's name, which must not leak into a ruling key.
   */
  street: string;
  houseNumber: string;
  /** Set on every needs_choice row (and unreadable rows): what KIND of question this is. */
  questionKind?: QuestionKind;
  /**
   * Stable identity of the question across uploads: kind|street|house, never
   * candidate ids, counts or row indices — those move while the question stays
   * the same question. Several file rows at one address share one key on
   * purpose: the office settles the ADDRESS once, not each row.
   */
  questionKey?: string;
  /**
   * An answer the office recorded on the questions page, joined back onto the
   * row at plan time so the person applying sees it without leaving the screen.
   */
  recordedAnswer?: { choice: string; note: string | null; answeredAt: string } | null;
  /**
   * Marks a removal row proposed because the master list names the address
   * fewer times than we deliver it — a copy cut, not a whole-address stop.
   * Feeds its own tripwire (surplusLookWrong), separate from the whole-address
   * removal guard.
   */
  surplusLine?: boolean;
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
  /**
   * True when the address cell itself could not be read -- "Meadowood Road 429"
   * with the number last, a missing house number. Distinct from the rest of
   * `blocked`, which is "this street is not on our routes", because this one the
   * office can FIX: it is a cell in the master list, not a fact about geography.
   * Counting them together hid 13 fixable rows inside 18,101 that are not.
   */
  unreadable?: boolean;
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
    /**
     * How many lines this address already had when the plan was built. The plan
     * round-trips through the browser and an address can be added by hand in the
     * meantime, so applyImport compares this against the list it re-reads and
     * skips the row if the premise moved. A create has no id to validate --
     * the address simply exists now and did not before.
     */
    linesAtPlanTime?: number;
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
 * A lookup built once per upload, so planning a row is a map hit rather than a
 * scan of every stop.
 *
 * planRow used to filter the whole stop table for each row, normalising street
 * and house number as it went. On the real Voice roster that is 19,600 rows
 * against 2,427 stops -- around 95 million regex-backed string operations, and
 * about 58 seconds of it, measured. The normalising happens once here instead.
 *
 * `streets` matters as much as the maps: the near-miss fallback compared edit
 * distance against every stop, where 71 distinct street names will do.
 */
export type StopIndex = {
  byStreetAndHouse: Map<string, ExistingStop[]>;
  byStreet: Map<string, ExistingStop[]>;
  streets: string[];
};

export function buildStopIndex(stops: ExistingStop[]): StopIndex {
  const byStreetAndHouse = new Map<string, ExistingStop[]>();
  const byStreet = new Map<string, ExistingStop[]>();
  for (const stop of stops) {
    const street = normalizeStreet(stop.street);
    const house = normalizeHouseNumber(stop.houseNumber);
    const key = `${street}|${house}`;
    byStreetAndHouse.set(key, [...(byStreetAndHouse.get(key) ?? []), stop]);
    byStreet.set(street, [...(byStreet.get(street) ?? []), stop]);
  }
  return { byStreetAndHouse, byStreet, streets: [...byStreet.keys()] };
}

/**
 * Resolves one spreadsheet row against the existing stops.
 *
 * Auto-merges only when the match is unambiguous; anything with more than one
 * plausible target comes back as needs_choice for the user to resolve, which is
 * what was asked for on the requirements call.
 */
/** One roster row at an address, reduced to what settling it needs. */
/**
 * How large a hole in a street's delivered house numbers means two separate
 * blocks of the route rather than one stretch with a few non-subscribers in it.
 * Zone 2's Pine St gap is 152 -> 198; Oak St is reached at five separate points
 * in zone 3. Twelve is well above ordinary infill and well below either.
 */
const BLOCK_GAP = 12;

/**
 * An answer the office has already given about an address or a street.
 *
 * `houseNumber` null means the whole street; `publicationId` null means every
 * publication. Both are normalised the way the matcher normalises, so a ruling
 * recorded against "Bruce St" also answers "BRUCE STREET".
 */
export type AddressRuling = {
  street: string;
  houseNumber: string;
  publicationId: string | null;
  ruling: "not_ours" | "ours";
  note: string | null;
};

/** Indexed once per upload; a plain array would be scanned 19,600 times. */
export type RulingIndex = Map<string, AddressRuling>;

export function buildRulingIndex(rulings: AddressRuling[]): RulingIndex {
  const map: RulingIndex = new Map();
  for (const r of rulings) {
    map.set(
      `${r.publicationId ?? ""}|${normalizeStreet(r.street)}|${normalizeHouseNumber(r.houseNumber)}`,
      r,
    );
  }
  return map;
}

/**
 * The office's answer for this address, if they have given one. A
 * publication-specific answer beats one recorded for every publication.
 *
 * Deliberately address-only. A street-wide answer sounds useful and is a trap:
 * the master list spells our Vine Ave as VINE ST, so a "not ours" recorded
 * against the street would have blanked the twenty-four Vine Ave doors we serve.
 */
export function rulingFor(
  index: RulingIndex,
  street: string,
  house: string,
  publicationId: string | null,
): AddressRuling | undefined {
  const st = normalizeStreet(street);
  const hn = normalizeHouseNumber(house);
  return index.get(`${publicationId ?? ""}|${st}|${hn}`) ?? index.get(`|${st}|${hn}`);
}

export type RosterFileRow = {
  floorSide: string | null;
  name: string | null;
  /** The publication's own subscriber id, when the file carries one. */
  externalId?: string | null;
};

/** What settleAddress decided for one roster row. */
export type AddressOutcome =
  | { kind: "no_change"; stopId: string }
  | { kind: "attach"; stopId: string }
  | { kind: "create"; floorSide: string | null }
  | { kind: "ask"; reason: string; ask: QuestionKind };

/** Compares a floor label from either side on the same footing. */
const doorOf = (value: string | null) =>
  normalizeFloorSide(value ?? "") ?? (value ? value.trim().toLowerCase() : null) ?? null;

/** Last alphabetic word of a name, which is the surname in every shape this roster uses. */
const surnameOf = (name: string | null) => {
  const words = (name ?? "").toLowerCase().replace(/[^a-z\s]/g, " ").trim().split(/\s+/);
  const last = words[words.length - 1] ?? "";
  return last === "family" || last.length < 3 ? "" : last;
};

/**
 * Settles every roster row at ONE address together.
 *
 * Ari, 2026-08-21: reconciliation is a count per address, not an identity match,
 * and no unit is ever assigned. Ari, 2026-08-31, on whether the printed floor
 * label binds the driver: *"if the listed address has a specific door that it
 * should go to, then the driver follows that. If there are no specific
 * instructions, then the driver will decide where to throw it."*
 *
 * Those two together are the whole design. Counting decides HOW MANY papers the
 * address gets. The stated door decides WHICH LINE each one lands on -- not as a
 * guess about identity, but because the label is an instruction the driver obeys.
 * So a file row naming a door is paired with the line carrying that door before
 * anything is counted.
 *
 * The first version of this got that wrong. It walked rows in file order and took
 * the first line with the publication missing, sorted by uuid. Measured on the
 * real 27 Aug roster: ten doors the file names ended up with no paper while
 * another door at the same house got two -- `5 GRASSMERE ST` basement LAN unserved
 * with upstairs COHEN served twice -- and twenty new lines duplicated a door
 * already served instead of creating the one the file asked for. Shuffling rows
 * within an address changed the created line 94 times over five trials.
 *
 * Deliberately NOT decided here: which of two indistinguishable lines gets a
 * paper. Where neither side states a door, the driver decides, so either is
 * correct and the choice is arbitrary rather than wrong.
 */
export function settleAddress(
  ourLines: ExistingStop[],
  fileRows: RosterFileRow[],
  publicationId: string,
): AddressOutcome[] {
  const out: AddressOutcome[] = new Array(fileRows.length);
  const taken = new Set<string>();

  // Settled in a canonical order, not the file's. Outcomes are written back to
  // each row's original position, so the caller is unaffected -- but two exports
  // of the same households in a different order now settle identically. Measured
  // before this: reversing the file changed 71 rows' status.
  const order = fileRows
    .map((_, i) => i)
    .sort((x, y) =>
      (doorOf(fileRows[x].floorSide) ?? "~").localeCompare(doorOf(fileRows[y].floorSide) ?? "~") ||
      (fileRows[x].name ?? "").localeCompare(fileRows[y].name ?? "") ||
      // The subscriber id before the index, so rows that are identical in door
      // and name still sort by something in the DATA. Without it, three rows at
      // one address -- two sharing an id, one without -- gave a different row the
      // "nothing to do" outcome depending on which order the export emitted, and
      // the questions the other two got were worded differently as a result.
      (fileRows[x].externalId ?? "").localeCompare(fileRows[y].externalId ?? "") ||
      x - y,
    );

  // A house has two apartments. More than two lines is either a real block --
  // 419 CEDAR BRIDGE AVE carries 23 -- or a duplicate in our own records, and
  // apartment numbers live in the instructions column which this never sees. So
  // above two lines nothing is WRITTEN: an address already covered still reports
  // no change, but attaching or creating goes to a person.
  const crowded = ourLines.length > 2;

  // The list naming one household twice is the unanswered copy-count question in
  // docs/domain-notes.md -- 25 customer ids repeat across 53 surplus rows, and
  // the count is also written into the address cell. Two rows sharing a surname
  // with nothing to tell them apart is exactly that ambiguity, so it is asked
  // rather than answered. Two rows naming DIFFERENT doors are distinguishable and
  // are two households.
  // Duplicate rows are NOT detected or asked about. Ari, 2026-09-01, shown the
  // "one paper or two?" question on 18 BRIDGEWOOD AVE: "you shouldn't be asking
  // the question because we always follow the master list. Take off all
  // questions that are similar to this." The list naming a household twice
  // means two papers, per the 2026-08-21 count rule -- the copy-count
  // double-encoding suspicion (25 repeated ids across 53 rows) is the file
  // question travelling with the first packet, not a per-address question, and
  // a wrong extra paper is the safe side of the asymmetry. The old SAME_ID /
  // SAME_NAME machinery lived here; git has it if the packet answer ever says
  // the repeats are NOT copies.

  /** Lines at this address that already carry the publication. */
  const served = ourLines.filter((line) => line.publicationIds.includes(publicationId));

  const pair = (index: number, line: ExistingStop) => {
    taken.add(line.id);
    if (line.publicationIds.includes(publicationId)) {
      out[index] = { kind: "no_change", stopId: line.id };
      return;
    }
    if (crowded) {
      out[index] = { kind: "ask", ask: "crowded_address", reason: `this address has ${ourLines.length} lines — pick which one` };
      return;
    }
    // The line the file names does not carry the publication. Whether that is an
    // ADDITION or a MOVE depends on the count, and the two rules Ari gave pull
    // apart here. The file names the basement at 5 GRASSMERE ST; we deliver to
    // the upstairs. Counting says one and one, nothing to do -- but then the
    // household the file names gets nothing. Attaching says the basement should
    // have it -- but that is two papers where the list asks for one.
    //
    // So it is neither: the household looks to have moved between the units, and
    // settling it means STOPPING a delivery, which is never done silently. Where
    // the file genuinely asks for more papers than we deliver, it is a plain
    // addition and no one needs to be asked.
    if (fileRows.length > served.length) {
      out[index] = { kind: "attach", stopId: line.id };
      return;
    }
    const elsewhere = served.map((line2) => doorOf(line2.floorSide) ?? "no label").join(" and ");
    out[index] = {
      kind: "ask",
      ask: "door_conflict",
      reason:
        `the list names the ${doorOf(line.floorSide) ?? "unlabelled"} unit, but the paper goes to ` +
        `the ${elsewhere} — has this household moved? Nothing is stopped without you saying so.`,
    };
  };

  /** Lines with the publication first, so a met count settles as "no change". */
  const preferServed = (candidates: ExistingStop[]) =>
    candidates.find((line) => line.publicationIds.includes(publicationId)) ?? candidates[0];
  const free = (extra: (line: ExistingStop) => boolean) =>
    ourLines.filter((line) => !taken.has(line.id) && extra(line));

  // Pass 1: a stated door pairs with the line carrying that door. This is the
  // pass that stops a paper landing on a door the file contradicts.
  for (const i of order) {
    const stated = doorOf(fileRows[i].floorSide);
    if (!stated) continue;
    const line = preferServed(free((candidate) => doorOf(candidate.floorSide) === stated));
    if (line) pair(i, line);
  }

  // Pass 1b: a stated door against a line carrying NO label. An unlabelled line
  // is not a different door -- it is no instruction at all, which is exactly the
  // case Ari described as the driver deciding. So the file saying "upstairs"
  // does not contradict it. Getting this wrong was the single biggest source of
  // noise in the first version of this function: 122 of 301 spurious "has this
  // household moved?" questions were one unlabelled line, already served,
  // against a file row naming a door.
  for (const i of order) {
    if (out[i] || !doorOf(fileRows[i].floorSide)) continue;
    const line = preferServed(free((candidate) => !doorOf(candidate.floorSide)));
    if (line) pair(i, line);
  }

  // Pass 2: ONLY rows that stated no door. Both sides are silent, so the driver
  // decides and either line is correct.
  //
  // A row that DID state a door and found neither its own door nor an unlabelled
  // line must not be paired here -- that was the original bug in a new place: it
  // put the paper on a door the file contradicts, and which row got mispaired
  // depended on file order. Such a row falls through to pass 3.
  for (const i of order) {
    if (out[i] || doorOf(fileRows[i].floorSide)) continue;
    // A served line anywhere at the address comes first, whether it carries a
    // label or not. Looking only among unlabelled lines meant that where the one
    // unlabelled line was UNSERVED, the labelled served line was unreachable and
    // the row fell through to "has this household moved?" -- four rows on the 27
    // Aug file, each one a household already getting its paper at the door its
    // own surname is on (12 Sheraton Dr · Katz against basement/KATZ). The file
    // states no door, so the driver decides and the served line is the answer.
    const surname = surnameOf(fileRows[i].name);
    const line =
      free((candidate) => candidate.publicationIds.includes(publicationId))[0] ??
      // Where nothing else distinguishes the free lines, a line carrying this
      // row's own surname is the better one. 4 STONEWALL CT: the file names
      // BADOUCH with no door, and we hold basement/GEWIRTZ and upstairs/BADOUCH
      // -- taking the first free line put BADOUCH's paper in GEWIRTZ's basement,
      // and the label is what the driver follows.
      //
      // This is a TIE-BREAK among lines at an address already matched, not
      // surname matching in the sense Ari rejected: it never decides whether an
      // address matches, never creates or removes a line, and never changes how
      // many papers the address gets.
      (surname
        ? free((candidate) => surnameOf(candidate.recipientName) === surname)[0]
        : undefined) ??
      preferServed(free((candidate) => !doorOf(candidate.floorSide))) ??
      preferServed(free(() => true));
    if (line) pair(i, line);
  }

  // Pass 3: everything still unsettled -- more households listed than lines held,
  // or a stated door we hold no line for.
  const capacity = Math.max(2, ourLines.length);
  for (const i of order) {
    if (out[i]) continue;
    if (fileRows.length > capacity) {
      out[i] = {
        kind: "ask",
        ask: "count_vs_capacity",
        reason:
          `the list has ${fileRows.length} households at this address but the house has ` +
          `${ourLines.length} — check the list before adding`,
      };
    } else if (crowded) {
      out[i] = { kind: "ask", ask: "crowded_address", reason: `this address has ${ourLines.length} lines — add this one by hand` };
    } else if (doorOf(fileRows[i].floorSide) && served.length >= fileRows.length) {
      // The file names a door we hold no line for, and the address already gets
      // as many papers as the list asks for. Creating the door would send one
      // too many; leaving it sends the paper to the wrong door. Same "moved"
      // shape as in pair(), reached from the other side.
      out[i] = {
        kind: "ask",
        ask: "door_conflict",
        reason:
          `the list names the ${doorOf(fileRows[i].floorSide)} unit, which we have no line for, ` +
          `and the address already gets ${served.length} — has this household moved?`,
      };
    } else {
      // The stated door is carried onto the new line, because the driver follows
      // it. Where the file states none, none is invented -- the driver decides.
      out[i] = { kind: "create", floorSide: fileRows[i].floorSide };
    }
  }

  return out;
}

/**
 * How many rows the file has at one address, and which of them this row is.
 *
 * Reconciliation is a count per address, not an identity match (Ari,
 * 2026-08-21): *"why do we need to use surname matching? ... just match
 * addresses. If there are two of the same address, then keep two of the same
 * thing again in the delivery list as well."* A two-family house where the file
 * lists one household and we deliver one paper needs no decision, and it does
 * not matter which unit is which -- so the matcher must not ask.
 *
 * Without this, `planRow` sees one row and two candidate stops and can only ask
 * "pick one". On the real 27 Aug Voice roster that was 486 of the 582 questions
 * put to the office, none of which had an answer worth giving.
 */
export type RosterGroup = {
  /** Every roster row at this (house number, street), in file order. */
  fileRows: RosterFileRow[];
  /** Which of them this row is, 0-based. */
  index: number;
};

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
  /** Built once per upload by the caller; see buildStopIndex for why. */
  index: StopIndex = buildStopIndex(stops),
  /**
   * Set for a roster import: every row at this address, so the address is
   * settled as a group rather than one row at a time. See settleAddress.
   */
  rosterGroup?: RosterGroup,
  /** Answers the office has already given. See AddressRuling. */
  rulings: RulingIndex = new Map(),
): PlanRow {
  const base: PlanRow = {
    rowNumber: row.rowNumber,
    action: row.action,
    summary: `${row.houseNumber} ${row.street}${row.name ? ` · ${row.name}` : ""}`,
    street: row.street,
    houseNumber: row.houseNumber,
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

  if (row.problem) {
    return {
      ...base,
      message: row.problem,
      unreadable: true,
      questionKind: "unreadable_cell",
      // No parseable address to key on, so the raw cell text is the identity.
      questionKey: `unreadable_cell|${hashKey(`${row.houseNumber} ${row.street} ${row.name ?? ""}`)}`,
    };
  }

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

  // An answer the office has already given comes first. This is the whole point
  // of the rulings table: 55 of the questions on the 27 Aug master list are "this
  // house number is outside the stretch we cover", and the answer is a fact about
  // geography that does not change week to week.
  const ruled = rulingFor(rulings, row.street, row.houseNumber, publication?.id ?? null);
  if (ruled?.ruling === "not_ours") {
    return {
      ...base,
      status: "blocked",
      message:
        `${row.houseNumber} ${row.street.toUpperCase()} is not on any of our routes ` +
        `— you told us so${ruled.note ? `: ${ruled.note}` : ""}`,
    };
  }

  let matches = index.byStreetAndHouse.get(`${street}|${house}`) ?? [];

  // No exact street hit. This used to accept any street within two edits that
  // shared the house number, and call the result ready -- which cannot tell
  // "HAZELWOOD CT is our HAZELWOOD LN" from "CHELSEA RD is a different road".
  // Both are two edits away and both share house numbers with us. So the ruling
  // decides, and anything it cannot settle goes to a person instead of being
  // applied. `needsPerson` carries the reason through to the review screen.
  let fuzzy = false;
  let needsPerson: string | null = null;
  let needsPersonKind: QuestionKind = "pick_line";
  const onOur = (ourStreet: string) => index.byStreetAndHouse.get(`${ourStreet}|${house}`) ?? [];

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
      if (matches.length) {
        needsPerson = ruled.why;
        needsPersonKind = "street_identity";
      }
    } else {
      // No ruling at all: the base word itself differs. That is sometimes a typo
      // ("SHENENDOAH DR" for SHENANDOAH DR) and sometimes a real road we simply
      // do not deliver -- and two edits cannot tell them apart. Measured on the
      // real Voice roster, all three of CHERRY ST, TEABERRY CT and WALTER DR
      // land here, matching HENRY ST, NEWBERRY CT and WALKER DR; WALTER/WALKER
      // is a single letter. So the message states what was found and asks,
      // rather than asserting the two are one street. Never auto-applied.
      // Compared against the 71 distinct street names, not every stop.
      const near = index.streets
        .filter((candidate) => editDistance(candidate, street) <= 2)
        .flatMap((candidate) => index.byStreetAndHouse.get(`${candidate}|${house}`) ?? []);

      // A street name in the file is THAT STREET unless there is positive
      // evidence it is a typo. Ari, 2026-08-31: "There is a Bruce St and Carol St
      // in Lakewood. Why should we assume that's not what it is?" -- and he is
      // right, the default was backwards. A similar name plus a house-number
      // coincidence is not evidence: it is guaranteed by construction, because
      // this branch only looks at house numbers we already hold.
      //
      // Measured on the 27 Aug roster: of the near-miss rows, exactly FOUR have
      // the same surname at the same house number -- WINDEMERE/WINDERMERE,
      // HAZLEWOOD/HAZELWOOD, CLEARMONT/CLAIRMONT, SHENENDOAH/SHENANDOAH, each a
      // single-letter slip. The rest -- BRUCE ST, BARON CT, CHERRY ST, CAREY ST,
      // MENDON DR, WALTER DR, DINA PL, JULE CT -- have none, and every one of
      // them is a real Lakewood street we simply do not deliver.
      //
      // So without a surname agreeing, this is not our street at all.
      // This branch is also reached for a street that IS ours where only the
      // house number is new -- OAK ST 1471 against our 26-110 has no ruling
      // either, because ruleStreetVariants only rules spellings that are NOT
      // ours. Such a row must fall through to the range and new-address checks
      // below, not be blocked. Only a street name we do not carry at all is
      // decided here.
      const weCarryTheStreet = (index.byStreet.get(street) ?? []).length > 0;
      const key = surnameOf(row.name);
      const named = key ? near.filter((stop) => surnameOf(stop.recipientName) === key) : [];
      // WITHOUT a surname match there is no question: the street is itself.
      // This used to ask "is this the same street written differently?" when
      // neither side had a name to compare, and Ari overruled the hedge on
      // 2026-09-01, shown 265 BRUCE ST asking after Bruce St had already been
      // settled: "I already told you that Bruce St is its own street, why are
      // you asking again?" Every instance of that question ever asked -- Bruce,
      // Carey, Cherry, Mendon, Baron and the rest -- was answered "it is its
      // own street", by him or by the map. So the default IS the answer, and
      // the map lookup that existed to answer it case by case is gone with it.
      // The residual risk is a typo of our street being missed as an addition,
      // which is the noticed-and-fixable side of the asymmetry.
      if (weCarryTheStreet) {
        // nothing to decide here; the house-number checks below own this case
      } else if (named.length) {
        matches = named;
        const where = [...new Set(matches.map((stop) => stop.street.toUpperCase()))].join(" or ");
        needsPerson =
          `${row.street.toUpperCase()} is not one of our streets, but ${row.houseNumber} ` +
          `${where} is, and the name matches — a slip of one or two letters?`;
        needsPersonKind = "near_miss_named";
      } else {
        return {
          ...base,
          status: "blocked",
          message: `${row.street.toUpperCase()} is not on any of our routes`,
        };
      }
    }
  }

  // The unit written as a letter on the house number on one side and not the
  // other -- we hold 105A CANARY DR, the upload says 105 with "apt A" in its
  // floor column, or the reverse. Measured on the real roster this is a larger
  // source of false cancellations than the street-suffix problem, because the
  // address looks absent and a roster import reads absent as gone.
  if (!matches.length) {
    const bare = house.replace(/[a-z]$/, "");
    const letterKin = (index.byStreet.get(street) ?? []).filter((stop) => {
      const theirs = normalizeHouseNumber(stop.houseNumber);
      return theirs !== house && theirs.replace(/[a-z]$/, "") === bare;
    });
    if (letterKin.length) {
      matches = letterKin;
      needsPersonKind = "unit_letter";
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
        ...asQuestion(base, needsPerson ? needsPersonKind : "pick_line"),
      };
    }
    const stop = matches[0];
    if (needsPerson) {
      return { ...base, status: "needs_choice", stopId: stop.id, candidates, message: needsPerson,
        ...asQuestion(base, needsPersonKind) };
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

  // Counting per address, which is what Ari asked for and what the code was not
  // doing. It applies only when the address is matched CONFIDENTLY -- exact
  // street and house number, or a street ruling of "same". `needsPerson` means
  // the identity itself is in doubt (a near-miss street name, a unit letter that
  // differs, a spelling the ruling could not settle), and counting a household
  // onto an address we are not sure of is the wrong kind of confidence.
  if (rosterGroup && publication && matches.length && !needsPerson) {
    const atAddress =
      index.byStreetAndHouse.get(`${normalizeStreet(matches[0].street)}|${house}`) ?? matches;
    const outcome = settleAddress(atAddress, rosterGroup.fileRows, publication.id)[rosterGroup.index];

    if (outcome.kind === "no_change") {
      const covered = atAddress.filter((stop) => stop.publicationIds.includes(publication.id)).length;
      return {
        ...base,
        status: "no_change",
        stopId: outcome.stopId,
        message:
          rosterGroup.fileRows.length > 1
            ? `${covered} of these already get ${publication.name} — nothing to do`
            : `already gets ${publication.name} — nothing to do`,
      };
    }
    if (outcome.kind === "attach") {
      const stop = atAddress.find((candidate) => candidate.id === outcome.stopId)!;
      return {
        ...base,
        status: "ready",
        stopId: stop.id,
        // Every line at the address, so the office can see WHICH door this will
        // touch and change it. The old code offered the narrowed `candidates`,
        // which sometimes did not even contain the stop it had chosen.
        candidates: atAddress.map((line) => ({
          stopId: line.id,
          label: labelFor(line),
          zoneNumber: line.zoneNumber,
        })),
        message: `adding to ${labelFor(stop)}`,
      };
    }
    if (outcome.kind === "create") {
      // NOT ready. create_stop_in_route appends at max(sequence) + 1, and every
      // production route ends with DONE / DONE! / END OF ROUTE at that maximum --
      // so an auto-created line prints BELOW the marker the driver stops at.
      // Measured on the 27 Aug roster: 48 rows would have been created in one
      // click, 30 of them a second line at an address already in the sequence,
      // where the right position is known exactly and is not the end.
      //
      // docs/domain-notes.md is explicit: "New addresses slot in by house
      // number... An unconfirmed address is listed on the cover as unplaced and
      // kept off the route pages entirely." Auto-creating was never sanctioned;
      // it just was not caught. Until there is somewhere to put an unplaced
      // address, the office positions it, as it does for a stop added by hand.
      const twin = atAddress[0];
      return {
        ...base,
        status: "needs_choice",
        candidates: atAddress.map((line) => ({
          stopId: line.id,
          label: labelFor(line),
          zoneNumber: line.zoneNumber,
        })),
        newStop: {
          ...newStopFrom(row, base, streetZones.get(street) ?? [], atAddress.length),
          zoneId: atAddress[0].zoneId,
          zoneNumber: atAddress[0].zoneNumber,
          floorSide: outcome.floorSide,
          linesAtPlanTime: atAddress.length,
        },
        message:
          `another household at this address${outcome.floorSide ? ` (${outcome.floorSide})` : ""} — ` +
          `add it next to ${labelFor(twin)} in zone ${twin.zoneNumber}. Applying it here would ` +
          `put it at the end of the route, past DONE.`,
        // Deliberately NOT a portal question. Ari, 2026-09-01, shown "is it a
        // real second household?": "What's the question on this one? Again, you
        // should be following the master list." The list naming another
        // household IS the answer; only the route placement remains, and that
        // is the courier office's work on this screen.
      };
    }
    return {
      ...base,
      status: "needs_choice",
      candidates: atAddress.map((line) => ({
        stopId: line.id,
        label: labelFor(line),
        zoneNumber: line.zoneNumber,
      })),
      message: outcome.reason,
      ...asQuestion(base, outcome.ask),
      // atAddress.length, not 0: if the office answers this question by picking
      // "Add as a new address", applyImport compares the live line count against
      // this. Hardcoded 0 made it decide the premise had moved and skip the row
      // -- silently discarding the answer it had just asked for.
      newStop: newStopFrom(row, base, streetZones.get(street) ?? [], atAddress.length),
    };
  }

  if (matches.length === 1) {
    const stop = matches[0];
    if (needsPerson) {
      return { ...base, status: "needs_choice", stopId: stop.id, candidates, message: needsPerson,
        ...asQuestion(base, needsPersonKind) };
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
    // Reached under a roster only when `needsPerson` is set -- counting above
    // handles a confident address match. So the reason the address is in doubt
    // is the useful half of the message, and it used to be dropped: the office
    // read "2 addresses match" when the real problem was that the street
    // spelling or the unit letter could not be settled.
    return {
      ...base,
      status: "needs_choice",
      candidates,
      message: needsPerson
        ? `${needsPerson} And ${matches.length} addresses match — pick one, or add it as a new address.`
        : `${matches.length} addresses match — pick one, or add it as a new address`,
      newStop: newStopFrom(row, base, streetZones.get(street) ?? []),
      ...asQuestion(base, needsPerson ? needsPersonKind : "pick_line"),
    };
  }

  // Brand new address: infer the zone from other stops on the same street.
  const zoneCandidates = streetZones.get(street) ?? [];

  // settleAddress never sees this path, because it is gated on having at least
  // one line at the address -- so the "never write to more than two lines blind"
  // rule was skipped at exactly the address we know least about. Measured:
  // 233 PINE ST has three roster rows, all unlabelled, all creating
  // independently. A house has two apartments.
  // Only on a street we deliver. Without the zoneCandidates guard this fired on
  // every out-of-area apartment block in Lakewood -- 100 WHISPER VILLAGE WAY has
  // 51 households, 325 7TH ST has 48 -- turning 1,261 rows that are simply not
  // on our routes into questions.
  if (rosterGroup && zoneCandidates.length && rosterGroup.fileRows.length > 2) {
    return {
      ...base,
      status: "needs_choice",
      message:
        `the list has ${rosterGroup.fileRows.length} households at this address and we deliver to ` +
        `none of them — check the list before adding any`,
      ...asQuestion(base, "no_current_delivery"),
    };
  }

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
  const numbersOnStreet = (index.byStreet.get(street) ?? [])
    .map((stop) => parseInt(normalizeHouseNumber(stop.houseNumber), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  const asNumber = parseInt(house, 10);
  if (numbersOnStreet.length && Number.isFinite(asNumber) && asNumber > 0) {
    const lo = Math.min(...numbersOnStreet);
    const hi = Math.max(...numbersOnStreet);
    // `ours` means the office has already confirmed this address is on the route,
    // so the geography questions below have been answered and must not recur.
    const confirmedOurs = ruled?.ruling === "ours";
    if (!confirmedOurs && (asNumber < lo || asNumber > hi)) {
      return {
        ...base,
        status: "needs_choice",
        message: `${row.houseNumber} is outside the ${lo}–${hi} stretch of ${row.street.toUpperCase()} our routes cover — confirm it is on this route before adding it`,
        newStop: newStopFrom(row, base, zoneCandidates),
        ...asQuestion(base, "out_of_stretch"),
      };
    }

    // Inside the range is not the same as inside a delivered block. Zone 2's
    // Pine St is 150-152 and then 198-270, all even; a global lo..hi test passes
    // 151, 185, 201 and 233 because they sit between 150 and 270. Measured on
    // the 27 Aug roster: 12 of the 18 brand-new doors were odd-side Pine St
    // 151-233, marked ready. docs/handoff.md lists exactly this as OPEN and says
    // lakewood-courier-routing should place them first.
    //
    // Two cheap discriminators, both from the numbers alone:
    const sorted = [...new Set(numbersOnStreet)].sort((a, b) => a - b);

    // One side of the street. Every number we deliver shares a parity and this
    // one does not -- a new side, not infill.
    const parities = new Set(sorted.map((n) => n % 2));
    if (!confirmedOurs && parities.size === 1 && !parities.has(asNumber % 2)) {
      return {
        ...base,
        status: "needs_choice",
        message:
          `every ${row.street.toUpperCase()} number we deliver is ${sorted[0] % 2 === 0 ? "even" : "odd"} ` +
          `(${lo}–${hi}), and ${row.houseNumber} is not — is this side of the street on our route?`,
        newStop: newStopFrom(row, base, zoneCandidates),
        ...asQuestion(base, "wrong_side_parity"),
      };
    }

    // A gap between two blocks. The street is reached at more than one point in
    // the route and this number falls between them, so there is no neighbour to
    // slot it beside.
    const below = sorted.filter((n) => n < asNumber).pop();
    const above = sorted.find((n) => n > asNumber);
    if (!confirmedOurs && below !== undefined && above !== undefined && above - below > BLOCK_GAP) {
      return {
        ...base,
        status: "needs_choice",
        message:
          `${row.houseNumber} falls in the gap between ${below} and ${above} on ` +
          `${row.street.toUpperCase()} — we deliver both blocks but nothing between them, so it has ` +
          `no position yet`,
        newStop: newStopFrom(row, base, zoneCandidates),
        ...asQuestion(base, "gap_between_blocks"),
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

  // A brand-new door, in range, on one route -- and still not `ready`.
  // create_stop_in_route appends at max(sequence) + 1, which on every production
  // route is AFTER the DONE marker the driver stops at. `1021 HEARTHSTONE DR` on
  // the 27 Aug roster is correct infill (we hold 1020 and 1025, the range, parity
  // and gap checks all pass) and would have been created there, printing below
  // DONE with a record saying the subscriber is served.
  //
  // The second-household path was already changed for this reason; this path was
  // missed, which made "nothing is auto-created" in docs/handoff.md false. The
  // neighbours that name the right position are in hand -- they just have
  // nowhere to be recorded until an unplaced-address destination exists.
  const between = zoneCandidates.length === 1
    ? (() => {
        const below = [...numbersOnStreet].filter((n) => n < asNumber).sort((a, b) => b - a)[0];
        const above = [...numbersOnStreet].filter((n) => n > asNumber).sort((a, b) => a - b)[0];
        return below !== undefined && above !== undefined ? ` between ${below} and ${above}` : "";
      })()
    : "";
  return {
    ...base,
    status: "needs_choice",
    message:
      zoneCandidates.length === 1
        ? `new address on zone ${zoneCandidates[0].zoneNumber} — add it${between} in the route. ` +
          `Applying it here would put it at the end, past DONE.`
        : "new address — this street spans several zones, pick one",
    newStop: newStopFrom(row, base, zoneCandidates),
    ...asQuestion(base, zoneCandidates.length === 1 ? "route_position" : "street_spans_zones"),
  };
}

/** Question identity for a needs_choice (or unreadable) row. */
function asQuestion(base: PlanRow, kind: QuestionKind): Pick<PlanRow, "questionKind" | "questionKey"> {
  return {
    questionKind: kind,
    questionKey: `${kind}|${normalizeStreet(base.street)}|${normalizeHouseNumber(base.houseNumber)}`,
  };
}

function newStopFrom(
  row: ParsedRow,
  base: PlanRow,
  zoneCandidates: { zoneId: string; zoneNumber: number }[],
  /**
   * Lines already at this address when the plan was built. MUST be passed
   * wherever we hold lines there, or applyImport's staleness check compares the
   * live count against 0 and silently skips the row -- which is what happened to
   * every question that offered "Add as a new address" at an address we already
   * serve: the office answered, the answer was discarded, and nothing said so.
   */
  linesAtPlanTime = 0,
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
    linesAtPlanTime,
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
/**
 * Which of our lines the master list leaves without a row, at an address the
 * list DOES carry. Ari, 2026-09-01, relaying Breindy Herman of the Voice
 * office: "the courier delivers a few to one address, but it's only on the
 * master list once... if it's on the master list once, the address should only
 * receive one" — and Ari: "why wouldn't you count it as a removal from the
 * courier list?" So the surplus is proposed for removal, one review row per
 * line, exactly like a whole-address removal.
 *
 * Derived from settleAddress's OWN outcomes rather than recomputing the
 * pairing, so the two can never drift: a served line no outcome claimed is
 * surplus. Never while anything at the address is still a question — an ask
 * means the pairing itself is unsettled, and removing under an open question
 * would preempt the person. Lines marked rosterManaged=false keep their
 * standing exemption from absence-based removal.
 */
export function surplusServedLines(
  ourLines: ExistingStop[],
  outcomes: AddressOutcome[],
  publicationId: string,
): ExistingStop[] {
  if (outcomes.some((o) => o.kind === "ask")) return [];
  const claimed = new Set(
    outcomes.flatMap((o) => (o.kind === "no_change" || o.kind === "attach" ? [o.stopId] : [])),
  );
  return ourLines.filter(
    (line) =>
      line.publicationIds.includes(publicationId) &&
      line.rosterManaged !== false &&
      !claimed.has(line.id),
  );
}

export function planRosterRemovals(
  stops: ExistingStop[],
  publication: { id: string; name: string },
  fileStreets: Map<string, Set<string>>,
  startingRowNumber: number,
): PlanRow[] {
  // Streets the roster covers at all. STRICT on purpose, and this is the whole
  // point: the loose test is used by listedUnderAnySpelling, where being generous
  // SUPPRESSES a removal -- the safe direction. Reusing it here pointed the same
  // generosity the other way, where it ENABLES removals.
  //
  // Measured against the real file: `sameStreetLoosely` allows one edit with no
  // length floor, so RIDER ST (we deliver 20 and 30) marked RIVER AVE covered and
  // all 7 of our River Ave addresses became removable with no River Ave row in
  // the file at all. Worse on our own streets, because stripStreetSuffix makes
  // PINE BLVD and PINE ST identical and PINE/VINE one edit apart: a file whose
  // only Vine-family rows are spelled VINE ST -- which the real file does --
  // marked both Pine streets covered and proposed 13 lines for removal on
  // streets it never named.
  //
  // So: the same street, or the same base word. No edit distance.
  //
  // The bare-base branch additionally requires the base to name exactly one of
  // OUR streets -- the recorded suffix rule ("a missing suffix may match only
  // when exactly one of our streets has that base name"), pointed at the
  // removal direction. Without it a bare `PINE` in the file -- which could be
  // Pine Blvd's rows with the suffix dropped -- counted as naming PINE ST too,
  // and covering a street is what ENABLES removals on it. `PONDEROSA` for our
  // one Ponderosa Dr still covers.
  const ourStreetsByBase = new Map<string, Set<string>>();
  for (const stop of stops) {
    const ours = normalizeStreet(stop.street);
    const base = stripStreetSuffix(ours);
    if (!ourStreetsByBase.has(base)) ourStreetsByBase.set(base, new Set());
    ourStreetsByBase.get(base)!.add(ours);
  }
  const namesTheStreet = (street: string) => {
    const ours = normalizeStreet(street);
    const base = stripStreetSuffix(ours);
    for (const candidate of fileStreets.keys()) {
      if (candidate === ours) return true;
      // A bare base word in the file ("PONDEROSA" for our PONDEROSA DR) is the
      // same street; a different type on the same base ("PINE BLVD" against our
      // PINE ST) is not.
      if (
        stripStreetSuffix(candidate) === base &&
        (candidate === base || ours === base) &&
        (ourStreetsByBase.get(base)?.size ?? 0) === 1
      ) {
        return true;
      }
    }
    return false;
  };

  /**
   * A street the roster names at all is covered, however few rows it carries.
   *
   * This used to also require the roster to name at least one address WE hold on
   * the street, added when the 27 Aug file's single River Ave row (`611 River
   * Ave`, not ours) looked like the publication failing to send us that street.
   * Ari corrected the premise (2026-08-31): River Ave is a commercial road, so
   * one subscriber row there is expected -- and ruled (2026-09-01) that its
   * unlisted addresses are removals like any other: *"if it's commercial and
   * it's being removed, why shouldn't it be listed as being removed?"* A road
   * whose rows are mostly businesses will rarely name an address we hold, so
   * that extra clause held back exactly the removals Ari wants. See
   * docs/domain-notes.md, "River Ave is a commercial road".
   *
   * A street the roster never names -- exactly, or as a bare base word that
   * could only be that street -- stays protected: a wholly absent street is the
   * signature of a file that did not include that part of town, and cancelling
   * a whole street on silence is the one mistake nobody reports. (A file cut
   * mid-street still names the street, so this does not protect against every
   * truncation; removalsLookWrong is the guard sized for that.) Measured on the
   * 27 Aug file, no street we deliver is wholly absent.
   */
  const covered = namesTheStreet;

  /** Addresses already ruled on, so `covered` and the spelling scan run once each. */
  const decided = new Map<string, boolean>();
  /** Distinct addresses being stopped -- what removalsLookWrong is calibrated on. */
  const seen = new Set<string>();
  const out: PlanRow[] = [];
  let rowNumber = startingRowNumber;

  for (const stop of stops) {
    if (!stop.publicationIds.includes(publication.id)) continue;
    // The round includes commercial drops -- Silvino's Auto, Ocean Dental,
    // Leisure Chateau -- that a subscriber export will never list. Without this
    // every roster import would propose cancelling all of them, every week.
    if (stop.rosterManaged === false) continue;
    // One row PER LINE, not per address (Ari, 2026-08-30): *"if the address is
    // not listed at all on the master list then all instances of the address
    // should be removed."* This used to dedupe on the address and set stopId to
    // the first stop it met, so 962 River Ave -- five Leisure Chateau lines --
    // produced one removal and left four papers going out every week. `seen` is
    // kept only to avoid repeating the two street lookups below per line.
    const key = `${normalizeStreet(stop.street)}|${normalizeHouseNumber(stop.houseNumber)}`;
    if (!decided.has(key)) {
      decided.set(key, covered(stop.street) && !listedUnderAnySpelling(stop.street, stop.houseNumber, fileStreets));
    }
    if (!decided.get(key)) continue;
    seen.add(key);
    out.push({
      rowNumber: rowNumber++,
      action: "remove",
      summary: `${stop.houseNumber} ${stop.street}${stop.recipientName ? ` · ${stop.recipientName}` : ""}`,
      street: stop.street,
      houseNumber: stop.houseNumber,
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
/**
 * The same tripwire on the other side of the diff.
 *
 * `removalsLookWrong` has guarded the deletion direction since the roster feature
 * shipped, because a wrong deletion stops a paying subscriber silently. Additions
 * had nothing: a doubled or concatenated upload reads every single-line address
 * as two households. Measured on the real file concatenated with itself, the
 * per-address settlement absorbs most of it -- 53 creates and 1,665 questions
 * rather than ~1,100 silent lines -- but the only thing standing between a
 * duplicated file and duplicated papers is an exact surname comparison, and
 * docs/domain-notes.md records that the two sources spell one family differently
 * constantly (DIAMANT/DIAMOND, NOSENCHUCK/NOSENCHUK).
 *
 * Deliberately looser than the removal guard: a wrong addition wastes a paper
 * where a wrong deletion loses a subscriber, and the first run of a publication
 * genuinely is a large reconciliation. The floor of 40 is above the 41 ready rows
 * the 27 Aug roster produces.
 */
export function additionsLookWrong(
  additions: number,
  publicationAddresses: number,
): { tripped: boolean; limit: number } {
  const limit = Math.max(40, Math.round(publicationAddresses * 0.15));
  return { tripped: additions > limit, limit };
}

/**
 * The tripwire for surplus-line removals, separate from the whole-address one
 * because the failure signatures differ: a TRUNCATED file inflates
 * whole-address removals (streets vanish), while a file cut mid-address
 * inflates surpluses (addresses present with fewer rows). Calibrated like the
 * additions guard rather than the whole-address one, because the first
 * count-sync against the master list is genuinely large -- the zones were
 * seeded from the courier's sheets, not the publication's counts. Measured on
 * the 27 Aug file: 50 surplus addresses on the first run. Like the removals
 * guard, this naturally tightens once the database mirrors an applied week.
 */
export function surplusLookWrong(
  surplusAddresses: number,
  publicationAddresses: number,
): { tripped: boolean; limit: number } {
  const limit = Math.max(60, Math.round(publicationAddresses * 0.1));
  return { tripped: surplusAddresses > limit, limit };
}

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
