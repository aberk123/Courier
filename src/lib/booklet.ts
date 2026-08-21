import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type CoverRow = { id: string; address: string; detail: string };

/**
 * Collapses a stop/publication's pending events down to the one change the
 * courier actually needs to hear about, or nothing at all.
 *
 * Every event passed in is unshown, so the courier's picture of this address is
 * whatever it was *before* the first of them. You can only remove a publication
 * that was subscribed, so the first event's type reveals that prior state: a
 * leading `added` means they did not have it, a leading `removed` means they
 * did. If the last event puts the address back where the courier already
 * believes it to be, the churn cancels and nothing should print.
 *
 * That is what stops an address added and then removed inside one cycle from
 * printing under Additions -- which told the courier to start delivering
 * somewhere that had already left the route.
 */
export function netPendingEvent<T extends { event_type: string }>(group: T[]): T | null {
  const first = group[0];
  const last = group[group.length - 1];
  if (!first || !last) return null;
  return first.event_type === last.event_type ? last : null;
}

export type BookletStop = {
  houseNumber: string;
  street: string;
  floorSide: string | null;
  instructions: string[];
  /**
   * The single letters the drivers already read off the paper route sheets --
   * not full names. The courier PDF prints these big and bold so they can be
   * read at night; see docs/domain-notes.md.
   */
  publicationLetters: string[];
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

/**
 * Ari, 2026-08-21: "in general, we don't need last names on courier list."
 * Amrom had already said the name "doesn't really matter to the driver". The
 * floor/side is what distinguishes two households at one house number, and that
 * is kept -- so dropping the name loses nothing the courier uses. Names stay on
 * the in-app screens, where staff need them to answer the phone.
 */
function addressOf(stop: {
  house_number: string;
  street: string;
  floor_side?: string | null;
}) {
  const parts = [`${stop.house_number} ${stop.street}`];
  if (stop.floor_side) parts.push(stop.floor_side);
  return parts.join(" · ");
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
  // courier_letter is required, not optional: if a caller forgets to select it
  // the fallback would quietly hand Bina "B", which BP already owns, and two
  // publications would share a letter on the route sheet. Better a type error.
  publications: { id: string; name: string; courier_letter: string | null }[],
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
        "id, stop_id, event_type, publication_id, publications(name), stops!inner(zone_id, house_number, street, floor_side)",
      )
      .eq("stops.zone_id", zone.id)
      .is("shown_on_cover_sheet_at", null)
      .order("created_at"),
    supabase
      .from("stop_instruction_changes")
      .select(
        "id, description, stops!inner(zone_id, house_number, street, floor_side)",
      )
      .eq("stops.zone_id", zone.id)
      .is("shown_on_cover_sheet_at", null)
      .order("created_at"),
    supabase
      .from("complaints")
      .select(
        "id, description, stops!inner(zone_id, house_number, street, floor_side)",
      )
      .eq("stops.zone_id", zone.id)
      .is("shown_on_cover_sheet_at", null)
      .order("created_at"),
    supabase
      .from("route_entries")
      .select(
        "sequence, kind, direction_text, stops(id, house_number, street, floor_side, special_instructions, special_instructions_2, active, stop_publications(publication_id))",
      )
      .eq("zone_id", zone.id)
      .order("sequence"),
  ]);

  const pubName = new Map(publications.map((pub) => [pub.id, pub.name]));
  // Falls back to the name's first letter so a publication added before anyone
  // assigns it a letter still marks its addresses, rather than vanishing from
  // the route sheet entirely.
  const pubLetter = new Map(
    publications.map((pub) => [
      pub.id,
      (pub.courier_letter ?? pub.name.charAt(0)).toUpperCase(),
    ]),
  );

  const additions: CoverRow[] = [];
  const deletions: CoverRow[] = [];

  // One group per address-and-publication, in query order (`order("created_at")`),
  // which grouping preserves -- so netPendingEvent's first/last really are.
  const pendingEvents = (events.data ?? []).filter((event) =>
    // Cover sheet is scoped to the publications this booklet was run for.
    selected.has(event.publication_id),
  );
  const byStopAndPublication = new Map<string, typeof pendingEvents>();
  for (const event of pendingEvents) {
    const key = `${event.stop_id}:${event.publication_id}`;
    const group = byStopAndPublication.get(key);
    if (group) group.push(event);
    else byStopAndPublication.set(key, [event]);
  }

  for (const group of byStopAndPublication.values()) {
    const net = netPendingEvent(group);
    if (!net) continue;

    const row = {
      id: net.id,
      address: addressOf(net.stops),
      detail: `${net.event_type === "added" ? "Add" : "Delete"} ${
        net.publications?.name ?? "publication"
      }`,
    };
    (net.event_type === "added" ? additions : deletions).push(row);
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
        houseNumber: stop.house_number,
        street: stop.street,
        floorSide: stop.floor_side,
        instructions: [stop.special_instructions, stop.special_instructions_2].filter(
          (value): value is string => Boolean(value),
        ),
        publicationLetters: forThisBooklet
          .map((id) => pubLetter.get(id))
          .filter((letter): letter is string => Boolean(letter))
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
