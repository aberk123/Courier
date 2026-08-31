"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/fetch-all";
import { parseCsv, rowsFromGrid, type ParsedRow } from "@/lib/import/parse";
import {
  buildStopIndex,
  mergeFloorSides,
  buildStreetZoneMap,
  normalizeHouseNumber,
  normalizeStreet,
  planRosterRemovals,
  planRow,
  removalsLookWrong,
  ruleStreetVariants,
  type ExistingStop,
  type PlanRow,
  type RosterGroup,
  type RosterFileRow,
} from "@/lib/import/match";

/**
 * `rows` deliberately carries only the rows a person can act on, plus a small
 * sample of the rest. A publication's town-wide roster plans ~19,600 rows, and
 * sending them all cost three things at once, measured on the real Voice file:
 * 5.4 MB of JSON to the browser and back through a hidden input (against a 6 MB
 * Server Action limit, so Apply was ~0.6 MB from failing silently), 19,600 table
 * rows in the DOM, and a page that locked up for a minute. `summary` carries the
 * counts so nothing is hidden from the office -- only shipped.
 */
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
export type PlanState = {
  error: string | null;
  rows: PlanRow[] | null;
  fileName: string | null;
  summary: PlanSummary | null;
};
export type ApplyState = { error: string | null; applied: number | null; skipped: number | null };

async function loadContext() {
  const supabase = await createClient();

  // Paged, and the error is not swallowed. An unpaged select stops at
  // PostgREST's 1,000-row cap, which had this planning the weekly roster
  // against the first 1,000 of 2,427 addresses -- see src/lib/fetch-all.ts for
  // what that did to the numbers. `.order("id")` is what makes the pages line
  // up; without a stable order they overlap and skip.
  const [stops, { data: publications, error: pubError }, { data: zones, error: zoneError }] = await Promise.all([
    fetchAllPages("addresses", (from, to) =>
      supabase
        .from("stops")
        .select(
          "id, zone_id, recipient_name, house_number, street, floor_side, roster_managed, stop_publications(publication_id), zones!inner(number)",
          // Measured against a live server: this is the TOTAL matching the
          // filter, not the size of the window, and it is correct alongside the
          // zones!inner embed. fetchAllPages pages until it reaches it.
          { count: "exact" },
        )
        .eq("active", true)
        .order("id")
        .range(from, to),
    ),
    supabase.from("publications").select("id, code, name").eq("active", true).order("name"),
    supabase.from("zones").select("id, number").order("number"),
  ]);

  if (pubError) throw new Error(`Could not read the publication list: ${pubError.message}`);
  if (zoneError) throw new Error(`Could not read the route list: ${zoneError.message}`);

  const existing: ExistingStop[] = stops.map((stop) => ({
    id: stop.id,
    zoneId: stop.zone_id,
    zoneNumber: stop.zones.number,
    recipientName: stop.recipient_name,
    houseNumber: stop.house_number,
    street: stop.street,
    floorSide: stop.floor_side,
    rosterManaged: stop.roster_managed,
    publicationIds: stop.stop_publications.map((sp) => sp.publication_id),
  }));

  return { supabase, existing, publications: publications ?? [], zones: zones ?? [] };
}

async function gridFromFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return parseCsv(new TextDecoder().decode(buffer));
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const grid: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    // row.values is 1-indexed with a leading hole.
    const values = row.values as unknown[];
    for (let i = 1; i < values.length; i++) {
      const value = values[i];
      cells.push(
        value === null || value === undefined
          ? ""
          : typeof value === "object" && value !== null && "text" in value
            ? String((value as { text: unknown }).text)
            : String(value),
      );
    }
    grid.push(cells);
  });
  return grid.filter((row) => row.some((cell) => cell.trim() !== ""));
}

export async function planImport(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) {
    return { error: "Choose a spreadsheet first.", rows: null, fileName: null, summary: null };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "That file is larger than 5 MB.", rows: null, fileName: null, summary: null };
  }

  // A file with no action column is a publication's own roster -- a list of who
  // should be receiving it -- so each row is an "add". Absence IS meaningful
  // too: Ari settled "whose list wins" on 2026-08-27 in the publication's
  // favour, so an address the roster no longer carries becomes a removal. That
  // is planRosterRemovals below, guarded by removalsLookWrong. (This comment
  // used to say the opposite; it predated the decision.)
  const rosterPublication = String(formData.get("rosterPublication") ?? "").trim();

  let parsed: ParsedRow[];
  try {
    parsed = rowsFromGrid(await gridFromFile(file), {
      defaultAction: rosterPublication ? "add" : undefined,
    });
  } catch (error) {
    return {
      error: `Could not read that file: ${(error as Error).message}`,
      rows: null,
      fileName: file.name,
      summary: null,
    };
  }

  if (!parsed.length) {
    return {
      error: "No rows found. Is the first row a header?",
      rows: null,
      fileName: file.name,
      summary: null,
    };
  }

  // A truncated or failed read must stop the run, not quietly plan against
  // whatever arrived: everything the roster did not mention looks like a
  // cancellation, and everything already on the route looks new.
  let existing: ExistingStop[];
  let publications: { id: string; code: string; name: string }[];
  try {
    ({ existing, publications } = await loadContext());
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not read the current address list.",
      rows: null,
      fileName: file.name,
      summary: null,
    };
  }

  // A roster names no publication per row, so the uploader picks one and it is
  // stamped on every row.
  if (rosterPublication) {
    const chosen = publications.find((pub) => pub.id === rosterPublication);
    if (!chosen) {
      return {
        error: "Pick which publication that list is for.",
        rows: null,
        fileName: file.name,
        summary: null,
      };
    }
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

  // Every roster row at each address, grouped, so the address is settled as a
  // whole rather than one row at a time. Only for a roster: a file with its own
  // action column says per row what it wants. Normalising once per row here,
  // rather than three times as before -- this file's history includes a measured
  // 58-second matching incident.
  const rowKeys: (string | null)[] = parsed.map((row) =>
    row.street && row.houseNumber
      ? `${normalizeStreet(row.street)}|${normalizeHouseNumber(row.houseNumber)}`
      : null,
  );
  const groups = new Map<string, RosterFileRow[]>();
  if (rosterPublication) {
    parsed.forEach((row, i) => {
      const key = rowKeys[i];
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({
        floorSide: mergeFloorSides(row.floorSide, row.floorSideAlt),
        name: row.name ?? null,
      });
    });
  }
  const seenAtAddress = new Map<string, number>();
  const rows = parsed.map((row, i) => {
    let rosterGroup: RosterGroup | undefined;
    const key = rowKeys[i];
    if (rosterPublication && key) {
      const index = seenAtAddress.get(key) ?? 0;
      seenAtAddress.set(key, index + 1);
      rosterGroup = { fileRows: groups.get(key) ?? [], index };
    }
    return planRow(row, existing, publications, streetZones, streetRuling, stopIndex, rosterGroup);
  });

  // A roster is the whole truth for its publication, so an address it no longer
  // carries is a cancellation. Nothing in the file says so -- it has to be
  // derived from our side. See planRosterRemovals for the three rules that keep
  // that from cancelling real subscribers.
  if (rosterPublication) {
    const chosen = publications.find((pub) => pub.id === rosterPublication)!;
    const removals = planRosterRemovals(
      existing,
      chosen,
      fileStreets,
      parsed.length + 2,
    );
    const addresses = new Set(
      existing
        .filter((stop) => stop.publicationIds.includes(chosen.id))
        .map((stop) => `${normalizeStreet(stop.street)}|${normalizeHouseNumber(stop.houseNumber)}`),
    ).size;
    // Removals are one row per LINE now, so the count fed to the guard is the
    // distinct ADDRESSES behind them -- which is what the 5% threshold was
    // calibrated against. Counting lines would tighten it silently.
    const byId = new Map(existing.map((stop) => [stop.id, stop]));
    const stopping = new Set(
      removals
        .map((removal) => (removal.stopId ? byId.get(removal.stopId) : undefined))
        .filter((stop): stop is ExistingStop => Boolean(stop))
        .map((stop) => `${normalizeStreet(stop.street)}|${normalizeHouseNumber(stop.houseNumber)}`),
    ).size;
    const check = removalsLookWrong(stopping, addresses);
    if (check.tripped) {
      return {
        error:
          `That list would stop ${stopping} of ${addresses} ${chosen.name} addresses, ` +
          `well past the ${check.limit} a normal week reaches. That is usually a partial file or ` +
          `a column that did not line up, not ${stopping} cancellations. Nothing has been changed — ` +
          `check the file covers all of Lakewood and re-upload.`,
        rows: null,
        fileName: file.name,
        summary: null,
      };
    }
    rows.push(...removals);
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
  const actionable = rows.filter((row) => row.status === "ready" || row.status === "needs_choice");
  const sample = rows.filter((row) => row.status !== "ready" && row.status !== "needs_choice").slice(0, 40);
  summary.sampled = sample.length;

  return { error: null, rows: [...actionable, ...sample], fileName: file.name, summary };
}

export async function applyImport(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  let rows: PlanRow[];
  try {
    rows = JSON.parse(String(formData.get("plan") ?? "[]")) as PlanRow[];
  } catch {
    return { error: "The review data was malformed — re-upload the file.", applied: null, skipped: null };
  }

  let ctx: Awaited<ReturnType<typeof loadContext>>;
  try {
    ctx = await loadContext();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not read the current address list.",
      applied: null,
      skipped: null,
    };
  }
  const { supabase, existing, publications, zones } = ctx;

  // Everything this apply writes is tagged with one run id, so undo_import_run
  // can reverse the lot as a unit. Without it an undo means finding every row
  // written inside a one-minute window and reversing it by hand -- and
  // stop_publications carries no timestamp at all.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: run, error: runError } = await supabase
    .from("import_runs")
    .insert({
      created_by: user?.id ?? null,
      file_name: String(formData.get("fileName") ?? "") || null,
      publication_id: String(formData.get("rosterPublication") ?? "") || null,
    })
    .select("id")
    .single();
  if (runError || !run) {
    return {
      error: `Could not start the import: ${runError?.message ?? "no run created"}. Nothing has been changed.`,
      applied: null,
      skipped: null,
    };
  }
  const runId = run.id;

  // The plan round-trips through the browser, so nothing in it is trusted:
  // every id is re-checked against what this user can actually see. RLS is
  // still the real boundary, this just fails loudly instead of at the insert.
  const validStopIds = new Set(existing.map((stop) => stop.id));
  const validPublicationIds = new Set(publications.map((pub) => pub.id));
  const validZoneIds = new Set(zones.map((zone) => zone.id));

  let applied = 0;
  let skipped = 0;

  for (const row of rows) {
    // Only rows the reviewer left in a ready state are applied. Anything still
    // needing a choice, or blocked, is deliberately left alone.
    if (row.status !== "ready") {
      skipped += 1;
      continue;
    }
    if (row.stopId && !validStopIds.has(row.stopId)) {
      skipped += 1;
      continue;
    }
    if (row.publicationId && !validPublicationIds.has(row.publicationId)) {
      skipped += 1;
      continue;
    }
    if (row.newStop?.zoneId && !validZoneIds.has(row.newStop.zoneId)) {
      skipped += 1;
      continue;
    }

    try {
      if (row.action === "add" && row.newStop && !row.stopId) {
        if (!row.newStop.zoneId) {
          skipped += 1;
          continue;
        }
        const { error } = await supabase.rpc("create_stop_in_route", {
          p_zone_id: row.newStop.zoneId,
          p_recipient_name: row.newStop.recipientName,
          p_house_number: row.newStop.houseNumber,
          p_street: row.newStop.street,
          p_floor_side: row.newStop.floorSide,
          p_special_instructions: row.newStop.instructions,
          p_publication_ids: row.publicationId ? [row.publicationId] : [],
          p_import_run_id: runId,
        });
        if (error) throw new Error(error.message);
        applied += 1;
        continue;
      }

      if (!row.stopId) {
        skipped += 1;
        continue;
      }

      if (row.action === "add" || row.action === "remove") {
        if (!row.publicationId) {
          skipped += 1;
          continue;
        }
        const { error } = await supabase.from("stop_publication_events").insert({
          stop_id: row.stopId,
          publication_id: row.publicationId,
          event_type: row.action === "add" ? "added" : "removed",
          import_run_id: runId,
        });
        if (error) throw new Error(error.message);
        applied += 1;
        continue;
      }

      if (row.action === "change") {
        const patch: { special_instructions?: string | null; floor_side?: string | null } = {};
        if (row.instructions !== null) patch.special_instructions = row.instructions;
        if (row.floorSide !== null) patch.floor_side = row.floorSide;
        if (!Object.keys(patch).length) {
          skipped += 1;
          continue;
        }
        const { error } = await supabase.from("stops").update(patch).eq("id", row.stopId);
        if (error) throw new Error(error.message);

        // Logged so it reaches the cover sheet's Changes section.
        await supabase.from("stop_instruction_changes").insert({
          stop_id: row.stopId,
          description: [
            row.floorSide !== null ? `Floor/side -> "${row.floorSide}"` : null,
            row.instructions !== null ? `Instructions -> "${row.instructions}"` : null,
          ]
            .filter(Boolean)
            .join("; "),
        });
        applied += 1;
        continue;
      }

      skipped += 1;
    } catch (error) {
      return {
        error: `Stopped at row ${row.rowNumber}: ${(error as Error).message}. ${applied} change(s) before it were applied.`,
        applied,
        skipped,
      };
    }
  }

  // Recorded last, so the number on the undo button is what actually landed.
  await supabase.from("import_runs").update({ applied_count: applied }).eq("id", runId);

  revalidatePath("/", "layout");
  return { error: null, applied, skipped };
}

export type UndoState = { error: string | null; message: string | null };

/**
 * Reverses one whole import.
 *
 * The work is all in undo_import_run -- publication changes are reversed by
 * logging the opposite event so the same trigger applies them, and addresses the
 * import created are deleted outright. This only checks the caller and reports
 * what happened, including anything the database refused to delete because
 * somebody had worked on it since.
 */
export async function undoImport(_prev: UndoState, formData: FormData): Promise<UndoState> {
  const runId = String(formData.get("runId") ?? "");
  if (!runId) return { error: "No import selected.", message: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_import_run", { p_run_id: runId });

  if (error) return { error: error.message, message: null };

  const result = (data ?? {}) as { reversed?: number; deleted?: number; kept_because_edited?: number };
  const parts = [
    result.deleted ? `${result.deleted} address${result.deleted === 1 ? "" : "es"} removed again` : null,
    result.reversed ? `${result.reversed} publication change${result.reversed === 1 ? "" : "s"} put back` : null,
  ].filter(Boolean);
  const kept = result.kept_because_edited
    ? ` ${result.kept_because_edited} address${result.kept_because_edited === 1 ? " was" : "es were"} left alone because somebody edited ${result.kept_because_edited === 1 ? "it" : "them"} after the import.`
    : "";

  revalidatePath("/", "layout");
  return {
    error: null,
    message: `Import undone — ${parts.length ? parts.join(", ") : "nothing to reverse"}.${kept}`,
  };
}
