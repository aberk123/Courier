export type RawRow = Record<string, string>;

export type ParsedRow = {
  rowNumber: number;
  action: "add" | "remove" | "change" | "unknown";
  name: string | null;
  houseNumber: string;
  street: string;
  publication: string | null;
  floorSide: string | null;
  /**
   * A second floor/side column. The Voice's export splits them: most "Upstairs"
   * values land in `extended_addr` and most "Basement" values in
   * `extended_addr2` -- 1,534 basements live only in the second column, so
   * reading one of them merges every basement household into the upstairs one
   * at the same door. See docs/domain-notes.md.
   */
  floorSideAlt: string | null;
  /**
   * The publication's own subscriber id (`customers.id`), when the file carries
   * one. This is the evidence that tells two households apart from one household
   * listed twice, and it was being discarded -- so a surname comparison stood in
   * for it and asked 20 unnecessary questions on the real roster. Measured on
   * that file: of 32 pairs of rows sharing a surname at one of our addresses,
   * ALL 32 carry different ids, i.e. two separate subscriptions.
   */
  externalId?: string | null;
  /**
   * The row's city, when the file carries one (the 31 Aug cleanup export added
   * `addresses.city`). Same street names exist in Jackson, Toms River and
   * Howell, and several "non-matches" were exactly that — a same-named street
   * in a different town (Ari, 2026-09-02). Null when the file has no city
   * column, which must behave exactly as before.
   */
  city?: string | null;
  instructions: string | null;
  problem?: string;
};

// Header aliases, so the office does not have to match our column names
// exactly. Everything is compared lowercased with non-letters stripped.
const FIELD_ALIASES: Record<
  keyof Omit<ParsedRow, "rowNumber" | "action" | "problem" | "floorSideAlt" | "externalId">,
  string[]
> = {
  city: ["city", "addressescity", "addresscity", "town"],
  name: [
    "name", "recipient", "recipientname", "subscriber", "lastname", "surname",
    // A publication's CRM export, e.g. The Voice's `customers.last_name`.
    "customerslastname", "customerlastname",
  ],
  houseNumber: ["housenumber", "house", "housenum", "number", "no", "streetnumber", "addressnumber"],
  // `address` and `addressesaddr` can be the whole address in one cell; the
  // house number is split off below when there is no separate column for it.
  street: ["street", "streetname", "road", "address", "addressesaddr", "addressaddr", "addressline1"],
  publication: ["publication", "magazine", "pub", "title"],
  floorSide: [
    "floorside", "floor", "side", "unit", "apt", "apartment",
    "addressesextendedaddr", "extendedaddr", "addressextendedaddr",
  ],
  instructions: ["instructions", "instruction", "specialinstructions", "notes", "note", "comment"],
};

/** Only ever a second floor/side column; kept separate so it can be unioned. */
const FLOOR_SIDE_ALT = [
  "addressesextendedaddr2", "extendedaddr2", "addressextendedaddr2", "floorside2", "unit2",
];

/** A first-name column, joined to the surname when both are present. */
const FIRST_NAME = ["firstname", "customersfirstname", "customerfirstname", "givenname"];
/**
 * The publication's subscriber id, most specific alias first. Resolved by
 * SPECIFICITY, not by column position: a file with both `ID` (a row counter) and
 * `customers.id` used to take whichever came first, so a counter could decide
 * whether a household gets one paper or two. A bare "id" is not on the list at
 * all for the same reason -- it is the commonest name for a row number.
 */
const EXTERNAL_ID = ["customersid", "customerid", "subscriberid", "accountid"];

const ACTION_ALIASES: Record<ParsedRow["action"], string[]> = {
  add: ["add", "added", "addition", "new", "a", "+"],
  remove: ["remove", "removed", "delete", "deleted", "deletion", "cancel", "stop", "d", "-"],
  change: ["change", "changed", "update", "updated", "edit", "instruction", "c"],
  unknown: [],
};

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9+-]/g, "");

function buildHeaderMap(headers: string[]) {
  const map: Partial<Record<keyof typeof FIELD_ALIASES, number>> = {};
  headers.forEach((header, index) => {
    const key = norm(header);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (map[field as keyof typeof FIELD_ALIASES] === undefined && aliases.includes(key)) {
        map[field as keyof typeof FIELD_ALIASES] = index;
      }
    }
  });
  const actionIndex = headers.findIndex((header) =>
    ["action", "type", "changetype", "addremove", "status"].includes(norm(header)),
  );
  const altFloorIndex = headers.findIndex((header) => FLOOR_SIDE_ALT.includes(norm(header)));
  const firstNameIndex = headers.findIndex((header) => FIRST_NAME.includes(norm(header)));
  let externalIdIndex = -1;
  for (const alias of EXTERNAL_ID) {
    const found = headers.findIndex((header) => norm(header) === alias);
    if (found !== -1) {
      externalIdIndex = found;
      break;
    }
  }
  return { map, actionIndex, altFloorIndex, firstNameIndex, externalIdIndex };
}

/**
 * Splits "999 Morris Ave" into its house number and street. Used only when the
 * upload has no separate house-number column, which is how a publication's own
 * export arrives. 19,608 of the 19,621 rows in the real Voice roster split on
 * this; the 13 that do not are reversed ("Meadowood Road 429") or glued
 * ("1OMNI CT"), and become blocked rows rather than guesses.
 */
export function splitAddress(
  value: string,
): { houseNumber: string; street: string; unit?: string } | null {
  let text = value.trim();
  // The apartment written FIRST: "apt a / 93 Harvard Street", "unit 7202 / 100
  // Whisper Village Way". Ari, 2026-09-01: the Voice office puts the apartment
  // number before the address on purpose, so the address is whatever follows
  // it. The unit is kept -- it rides along as an instruction, never guessed
  // into a floor.
  const prefixed = text.match(/^(?:apt|apartment|unit|#)\s*\.?\s*([A-Za-z0-9-]+)\s*[\/,–—-]?\s+(.+)$/i);
  let unit: string | undefined;
  if (prefixed) {
    unit = prefixed[1];
    text = prefixed[2].trim();
  }
  const m = text.match(/^([0-9]+[A-Za-z]?)\s+(.+)$/);
  if (!m) return null;
  return { houseNumber: m[1], street: m[2].trim(), ...(unit ? { unit } : {}) };
}

function resolveAction(value: string): ParsedRow["action"] {
  const key = norm(value);
  for (const [action, aliases] of Object.entries(ACTION_ALIASES)) {
    if (aliases.includes(key)) return action as ParsedRow["action"];
  }
  return "unknown";
}

/** RFC4180-ish CSV split that respects quoted fields and embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // handled by \n
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Turns a grid (from CSV or a worksheet) into typed rows. */
export type GridOptions = {
  /**
   * What a row means when the upload has no action column. A publication's own
   * roster is a list of who should be receiving it, so every row is an "add";
   * leaving it "unknown" would block the whole file.
   */
  defaultAction?: ParsedRow["action"];
};

export function rowsFromGrid(grid: string[][], options: GridOptions = {}): ParsedRow[] {
  if (!grid.length) return [];
  const [headers, ...body] = grid;
  const { map, actionIndex, altFloorIndex, firstNameIndex, externalIdIndex } = buildHeaderMap(headers);

  const cell = (row: string[], index: number | undefined) =>
    index === undefined || index < 0 ? "" : (row[index] ?? "").trim();

  return body.map((row, index) => {
    let houseNumber = cell(row, map.houseNumber);
    let street = cell(row, map.street);

    // No house-number column: the address is one cell, so split it.
    let unsplittable = false;
    let unit: string | undefined;
    if (!houseNumber && street) {
      const parts = splitAddress(street);
      if (parts) {
        houseNumber = parts.houseNumber;
        street = parts.street;
        unit = parts.unit;
      } else {
        unsplittable = true;
      }
    }

    const action =
      actionIndex >= 0 ? resolveAction(cell(row, actionIndex)) : (options.defaultAction ?? "unknown");

    const surname = cell(row, map.name);
    const given = cell(row, firstNameIndex);
    const name = [given, surname].filter(Boolean).join(" ") || null;

    const problems: string[] = [];
    if (action === "unknown") problems.push("unrecognised action");
    if (unsplittable) problems.push(`could not read a house number out of "${street}"`);
    else if (!houseNumber) problems.push("missing house number");
    if (!street) problems.push("missing street");

    return {
      rowNumber: index + 2, // +2: 1-indexed, and row 1 is the header
      action,
      name,
      houseNumber,
      street,
      publication: cell(row, map.publication) || null,
      floorSide: cell(row, map.floorSide) || null,
      floorSideAlt: cell(row, altFloorIndex) || null,
      city: cell(row, map.city) || null,
      externalId: cell(row, externalIdIndex) || null,
      // A unit split off the front of the address rides along as an
      // instruction -- never invented into a floor label.
      instructions: [unit ? `Apt ${unit}` : null, cell(row, map.instructions) || null]
        .filter(Boolean)
        .join("; ") || null,
      problem: problems.length ? problems.join(", ") : undefined,
    };
  });
}
