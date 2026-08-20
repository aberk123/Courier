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
};

export type Candidate = { stopId: string; label: string; zoneNumber: number };

export type PlanRow = {
  rowNumber: number;
  action: ParsedRow["action"];
  summary: string;
  publicationId: string | null;
  publicationName: string | null;
  /** ready = safe to apply; needs_choice = user must pick; blocked = cannot apply */
  status: "ready" | "needs_choice" | "blocked";
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

export function normalizeHouseNumber(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeFloorSide(value: string | null): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (/base|bsmt|bsmnt|down/.test(v)) return "basement";
  if (/up|second|2nd|top/.test(v)) return "upstairs";
  return null;
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
    floorSide: normalizeFloorSide(row.floorSide),
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

  // No exact street hit: allow a near-miss on the street name only, so
  // "Shenandoa Dr" still finds "SHENANDOAH DR".
  let fuzzy = false;
  if (!matches.length) {
    matches = stops.filter(
      (stop) =>
        normalizeHouseNumber(stop.houseNumber) === house &&
        editDistance(normalizeStreet(stop.street), street) <= 2,
    );
    fuzzy = matches.length > 0;
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
    if (row.action === "remove" && publication && !stop.publicationIds.includes(publication.id)) {
      return {
        ...base,
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
    if (publication && stop.publicationIds.includes(publication.id)) {
      return {
        ...base,
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
  return {
    ...base,
    status: zoneCandidates.length === 1 ? "ready" : "needs_choice",
    message:
      zoneCandidates.length === 1
        ? `new address — zone ${zoneCandidates[0].zoneNumber} (from other stops on this street)`
        : zoneCandidates.length
          ? "new address — this street spans several zones, pick one"
          : "new address — street not in any route yet, pick a zone",
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
