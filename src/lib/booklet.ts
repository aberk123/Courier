import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type CoverRow = { id: string; address: string; detail: string };

export type BookletStop = {
  recipientName: string | null;
  houseNumber: string;
  street: string;
  floorSide: string | null;
  instructions: string[];
  publications: string[];
};

export type BookletLine =
  | { kind: "direction"; text: string }
  | { kind: "stop"; stop: BookletStop };

export type Booklet = {
  zoneNumber: number;
  zoneName: string | null;
  publicationLabel: string;
  additions: CoverRow[];
  deletions: CoverRow[];
  changes: CoverRow[];
  complaints: CoverRow[];
  lines: BookletLine[];
  counts: { stops: number; byPublication: { name: string; count: number }[] };
};

// Static template copy, identical every week -- confirmed as a standing footer
// rather than per-week data. Both numbers are Amrom's and are deliberately kept
// distinct: the 666 line is the direct/24h one from the sample cover sheet, the
// 546 line is the office number in his email signature.
export const STANDING_FOOTER = [
  "Please review your route sheet every week — addresses change.",
  "Do not slam magazines into doors.",
  "Report a missed or hard-to-find address immediately.",
  "If you are unsure, ask. Do not guess.",
  "Amrom — 732-666-1311 (24 hours a day) · Office 732-546-9333",
];

function addressOf(stop: {
  house_number: string;
  street: string;
  recipient_name?: string | null;
  floor_side?: string | null;
}) {
  const parts = [`${stop.house_number} ${stop.street}`];
  if (stop.floor_side) parts.push(stop.floor_side);
  const address = parts.join(" · ");
  return stop.recipient_name ? `${stop.recipient_name} · ${address}` : address;
}

/**
 * Everything one printed booklet needs: the four cover-sheet sections (pending
 * items only) plus the route itself in driving order.
 *
 * `publicationIds` narrows the booklet to a subset of publications. Inclusion is
 * ANY, not ALL -- a stop appears if it receives at least one selected
 * publication, because the courier physically visits it either way. See
 * docs/domain-notes.md.
 */
export async function getBooklet(
  supabase: Client,
  zone: { id: string; number: number; name: string | null },
  publications: { id: string; name: string }[],
  publicationIds: string[],
): Promise<Booklet> {
  const selected = new Set(publicationIds);
  const selectedNames = publications
    .filter((pub) => selected.has(pub.id))
    .map((pub) => pub.name);

  const [events, changes, complaints, entries] = await Promise.all([
    supabase
      .from("stop_publication_events")
      .select(
        "id, event_type, publication_id, publications(name), stops!inner(zone_id, recipient_name, house_number, street, floor_side)",
      )
      .eq("stops.zone_id", zone.id)
      .is("shown_on_cover_sheet_at", null)
      .order("created_at"),
    supabase
      .from("stop_instruction_changes")
      .select(
        "id, description, stops!inner(zone_id, recipient_name, house_number, street, floor_side)",
      )
      .eq("stops.zone_id", zone.id)
      .is("shown_on_cover_sheet_at", null)
      .order("created_at"),
    supabase
      .from("complaints")
      .select(
        "id, description, stops!inner(zone_id, recipient_name, house_number, street, floor_side)",
      )
      .eq("stops.zone_id", zone.id)
      .is("shown_on_cover_sheet_at", null)
      .order("created_at"),
    supabase
      .from("route_entries")
      .select(
        "sequence, kind, direction_text, stops(id, recipient_name, house_number, street, floor_side, special_instructions, special_instructions_2, active, stop_publications(publication_id))",
      )
      .eq("zone_id", zone.id)
      .order("sequence"),
  ]);

  const pubName = new Map(publications.map((pub) => [pub.id, pub.name]));

  const additions: CoverRow[] = [];
  const deletions: CoverRow[] = [];
  for (const event of events.data ?? []) {
    // Cover sheet is scoped to the publications this booklet was run for.
    if (!selected.has(event.publication_id)) continue;
    const row = {
      id: event.id,
      address: addressOf(event.stops),
      detail: `${event.event_type === "added" ? "Add" : "Delete"} ${
        event.publications?.name ?? "publication"
      }`,
    };
    (event.event_type === "added" ? additions : deletions).push(row);
  }

  const changeRows: CoverRow[] = (changes.data ?? []).map((row) => ({
    id: row.id,
    address: addressOf(row.stops),
    detail: row.description,
  }));

  const complaintRows: CoverRow[] = (complaints.data ?? []).map((row) => ({
    id: row.id,
    address: addressOf(row.stops),
    detail: row.description,
  }));

  const lines: BookletLine[] = [];
  const counts = new Map<string, number>();
  let stopCount = 0;

  for (const entry of entries.data ?? []) {
    if (entry.kind === "direction") {
      if (entry.direction_text) lines.push({ kind: "direction", text: entry.direction_text });
      continue;
    }
    const stop = entry.stops;
    if (!stop || !stop.active) continue;

    const stopPubIds = stop.stop_publications.map((sp) => sp.publication_id);
    const forThisBooklet = stopPubIds.filter((id) => selected.has(id));
    if (!forThisBooklet.length) continue; // ANY-inclusion

    for (const id of forThisBooklet) {
      const name = pubName.get(id);
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    stopCount += 1;

    lines.push({
      kind: "stop",
      stop: {
        recipientName: stop.recipient_name,
        houseNumber: stop.house_number,
        street: stop.street,
        floorSide: stop.floor_side,
        instructions: [stop.special_instructions, stop.special_instructions_2].filter(
          (value): value is string => Boolean(value),
        ),
        publications: forThisBooklet
          .map((id) => pubName.get(id))
          .filter((name): name is string => Boolean(name))
          .sort(),
      },
    });
  }

  // A direction row with no stops under it in this booklet is navigation to
  // somewhere the courier isn't going -- drop trailing/orphaned ones.
  const pruned: BookletLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.kind === "direction") {
      const next = lines.slice(i + 1).find((candidate) => candidate.kind === "stop");
      const nextDirection = lines.slice(i + 1).findIndex((c) => c.kind === "direction");
      const stopBefore = lines
        .slice(i + 1, nextDirection === -1 ? undefined : i + 1 + nextDirection)
        .some((c) => c.kind === "stop");
      if (!next || !stopBefore) continue;
    }
    pruned.push(line);
  }

  return {
    zoneNumber: zone.number,
    zoneName: zone.name,
    publicationLabel:
      selectedNames.length === publications.length
        ? "All publications"
        : selectedNames.join(" + ") || "No publications selected",
    additions,
    deletions,
    changes: changeRows,
    complaints: complaintRows,
    lines: pruned,
    counts: {
      stops: stopCount,
      byPublication: [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
  };
}
