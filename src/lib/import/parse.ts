export type RawRow = Record<string, string>;

export type ParsedRow = {
  rowNumber: number;
  action: "add" | "remove" | "change" | "unknown";
  name: string | null;
  houseNumber: string;
  street: string;
  publication: string | null;
  floorSide: string | null;
  instructions: string | null;
  problem?: string;
};

// Header aliases, so the office does not have to match our column names
// exactly. Everything is compared lowercased with non-letters stripped.
const FIELD_ALIASES: Record<keyof Omit<ParsedRow, "rowNumber" | "action" | "problem">, string[]> = {
  name: ["name", "recipient", "recipientname", "subscriber", "lastname"],
  houseNumber: ["housenumber", "house", "housenum", "number", "no", "streetnumber", "addressnumber"],
  street: ["street", "streetname", "road", "address"],
  publication: ["publication", "magazine", "pub", "title"],
  floorSide: ["floorside", "floor", "side", "unit", "apt", "apartment"],
  instructions: ["instructions", "instruction", "specialinstructions", "notes", "note", "comment"],
};

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
  return { map, actionIndex };
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
export function rowsFromGrid(grid: string[][]): ParsedRow[] {
  if (!grid.length) return [];
  const [headers, ...body] = grid;
  const { map, actionIndex } = buildHeaderMap(headers);

  const cell = (row: string[], index: number | undefined) =>
    index === undefined ? "" : (row[index] ?? "").trim();

  return body.map((row, index) => {
    const houseNumber = cell(row, map.houseNumber);
    const street = cell(row, map.street);
    const action = actionIndex >= 0 ? resolveAction(cell(row, actionIndex)) : "unknown";

    const problems: string[] = [];
    if (action === "unknown") problems.push("unrecognised action");
    if (!houseNumber) problems.push("missing house number");
    if (!street) problems.push("missing street");

    return {
      rowNumber: index + 2, // +2: 1-indexed, and row 1 is the header
      action,
      name: cell(row, map.name) || null,
      houseNumber,
      street,
      publication: cell(row, map.publication) || null,
      floorSide: cell(row, map.floorSide) || null,
      instructions: cell(row, map.instructions) || null,
      problem: problems.length ? problems.join(", ") : undefined,
    };
  });
}
