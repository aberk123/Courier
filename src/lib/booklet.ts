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
  /**
   * `skipped` marks a stretch of the route where this booklet's publications
   * have no deliveries. The text is never dropped -- see
   * collapseSkippedStretches for why -- only quietened.
   */
  | { kind: "direction"; text: string; skipped?: boolean }
  | { kind: "stop"; stop: BookletStop };

/** Runs shorter than this keep every direction at full weight. */
const SKIP_RUN_MIN = 3;

/**
 * Collapses stretches of the route that this booklet has no deliveries on.
 *
 * A publication-scoped booklet inherits the whole route's driving directions,
 * so filtering to one publication leaves long runs of instructions with nothing
 * under them. Measured on the real routes for Mishpacha alone: 21 of zone 1's 32
 * directions, 46 of zone 2's 65, 24 of zone 3's 51, with unbroken runs of 17, 14
 * and 8. Printed as-is it reads as a fault, and Ari's courier said so.
 *
 * Deleting them is NOT safe, and this is the important part. Those runs contain
 * real turns: zone 2's run of 14 holds "TURN LEFT ON MARC DR", "TURN RIGHT ONTO
 * SPRUCE" and "TURN RIGHT ON HOWARD DR" -- drop it and the courier cannot get
 * from Ned Dr to Howard Dr. Zone 1's holds the whole drive out of the Cedar
 * Bridge complex. So every word is kept; a run is merged into one quiet block.
 *
 * Deadness must be decided from the UNFILTERED route -- see markDeadDirections --
 * and NOT from whether directions happen to sit next to each other in the output.
 * Directions are consecutive in the source route for their own reasons: a door
 * code follows the drive to the building, "WALKING ROUTE" follows the park
 * instruction. Grouping on adjacency muted the 419 Cedar Bridge door code on the
 * all-publications booklet -- where nothing is filtered out at all -- directly
 * above 23 deliveries in that building, under the words "Nothing for this booklet
 * along here". Zone 1 seq 158-160, and the same shape at zone 2 seq 357-359 and
 * 617-619, zone 3 seq 410-412, zone 4 seq 234-237.
 *
 * Once deadness is correct there is no need to keep the last direction of a run
 * at full weight: a dead run is always followed either by a live direction, which
 * is already loud, or by the end of the route, which is dropped.
 */
export function collapseSkippedStretches(lines: BookletLine[]): BookletLine[] {
  const out: BookletLine[] = [];
  let run: string[] = [];

  const flush = () => {
    if (!run.length) return;
    if (run.length < SKIP_RUN_MIN) {
      // One or two lines are not worth a collapsed block, and the driver still
      // has to drive them.
      for (const text of run) out.push({ kind: "direction", text });
    } else {
      out.push({ kind: "direction", text: run.join("   >   "), skipped: true });
    }
    run = [];
  };

  for (const line of lines) {
    if (line.kind === "direction" && line.skipped) {
      run.push(line.text);
      continue;
    }
    flush();
    out.push(line);
  }
  flush();
  return out;
}

/**
 * Marks the directions this booklet has no deliveries under, reading the route
 * the way the courier wrote it: a run of consecutive direction rows is one
 * navigation unit, and it is dead only when every stop that unit leads to was
 * filtered out or retired. `survives` is the same test the line builder applies.
 *
 * Returns indexes into `entries`, so the caller can flag each direction as it
 * builds its lines.
 */
export function markDeadDirections<S>(
  entries: { kind: string; direction_text: string | null; stop: S | null }[],
  survives: (stop: S) => boolean,
): Set<number> {
  const dead = new Set<number>();
  let unit: number[] = [];
  let live = false;
  let inStops = false;

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry.kind === "direction") {
      // A direction after a run of stops opens a new unit and closes the last.
      if (inStops) {
        if (!live) for (const j of unit) dead.add(j);
        unit = [];
        live = false;
        inStops = false;
      }
      if (entry.direction_text) unit.push(index);
      continue;
    }
    inStops = true;
    if (entry.stop && survives(entry.stop)) live = true;
  }
  if (!live) for (const j of unit) dead.add(j);
  return dead;
}

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

  const routeEntries = entries.data ?? [];

  // ANY-inclusion: a stop is on this booklet if it is live and receives at least
  // one selected publication. Named because markDeadDirections needs the very
  // same test -- if the two ever drift, a live stretch would be muted again.
  const survives = (stop: NonNullable<(typeof routeEntries)[number]["stops"]>) =>
    stop.active && stop.stop_publications.some((sp) => selected.has(sp.publication_id));

  // Which stretches are dead is a fact about the whole route, so it is settled
  // before any stop is dropped.
  const dead = markDeadDirections(
    routeEntries.map((entry) => ({
      kind: entry.kind,
      direction_text: entry.direction_text,
      stop: entry.stops,
    })),
    survives,
  );

  for (let index = 0; index < routeEntries.length; index++) {
    const entry = routeEntries[index];
    if (entry.kind === "direction") {
      if (entry.direction_text)
        lines.push({
          kind: "direction",
          text: entry.direction_text,
          ...(dead.has(index) ? { skipped: true } : {}),
        });
      continue;
    }
    const stop = entry.stops;
    if (!stop || !survives(stop)) continue;

    const forThisBooklet = stop.stop_publications
      .map((sp) => sp.publication_id)
      .filter((id) => selected.has(id));

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

  // This used to DROP any direction with no stop under it, on the reasoning that
  // it was navigation to somewhere the courier isn't going. That is wrong and it
  // was shipped: those runs carry the turns between the places he IS going.
  // Zone 2's dead stretch contains "TURN LEFT ON MARC DR", "TURN RIGHT ONTO
  // SPRUCE" and "TURN RIGHT ON HOWARD DR" -- dropping it strands him between Ned
  // Dr and Howard Dr. Ari, 2026-08-21: "If you remove a street without any
  // deliveries, the courier may be missing an important turn in order to get to
  // the next street." Nothing is removed now; dead stretches are only quietened.
  //
  // Trailing directions after the last stop are still dropped -- there is no
  // delivery left to navigate to. In production those are only DONE / DONE! /
  // END OF ROUTE. Note the consequence: a booklet for a publication with no
  // stops in this zone comes out with no route rows at all.
  const lastStop = lines.map((l) => l.kind).lastIndexOf("stop");
  const pruned = collapseSkippedStretches(
    lastStop === -1 ? [] : lines.slice(0, lastStop + 1),
  );

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
