"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/fetch-all";
import { parseCsv, rowsFromGrid, type ParsedRow } from "@/lib/import/parse";
import { planRoster, type PlanSummary } from "@/lib/import/plan";
import { checkStreetsExist } from "@/lib/import/street-check";
export type { PlanSummary };
import {
  normalizeHouseNumber,
  normalizeStreet,
  type ExistingStop,
  type AddressRuling,
  type PlanRow,
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
  const [stops, { data: publications, error: pubError }, { data: zones, error: zoneError }, rulings] = await Promise.all([
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
    // Answers the office has already given, so the same question is not asked
    // every week. Courier-office only by RLS; a scoped staffer simply gets none.
    //
    // Paged and ordered like everything else here. This table only grows -- 69
    // answers were available to record in week one alone -- so it crosses
    // PostgREST's 1,000-row cap within months, after which an arbitrary and
    // unstable subset of the office's answers would silently stop applying.
    fetchAllPages("your recorded answers", (from, to) =>
      supabase
        .from("address_rulings")
        .select("street, house_number, publication_id, ruling, note", { count: "exact" })
        .order("street")
        .order("house_number")
        .range(from, to),
    ),
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

  const addressRulings: AddressRuling[] = rulings.map((r) => ({
    street: r.street,
    houseNumber: r.house_number ?? "",
    publicationId: r.publication_id,
    ruling: r.ruling as AddressRuling["ruling"],
    note: r.note,
  }));

  return { supabase, existing, publications: publications ?? [], zones: zones ?? [], addressRulings };
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
  let addressRulings: AddressRuling[];
  try {
    ({ existing, publications, addressRulings } = await loadContext());
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not read the current address list.",
      rows: null,
      fileName: file.name,
      summary: null,
    };
  }

  // One code path, shared with every harness that checks these numbers. See
  // src/lib/import/plan.ts -- this used to be 150 lines inline, which meant the
  // only way to measure it was to reimplement it, and the reimplementation
  // drifted six rows away from what the screen showed.
  let outcome = planRoster(parsed, existing, publications, rosterPublication || null, addressRulings);

  // Second pass with the map's answers. The no-name near-miss questions ("is
  // CAREY ST the same street as our CAROL ST written differently?") are the one
  // row shape a map settles, and Ari's rule is to check: a confirmed real street
  // is that street, not a misspelling of ours. Fails soft in every direction --
  // lookup unreachable, street not found, or nothing checkable -- by leaving the
  // plan exactly as pass one made it. See src/lib/import/street-check.ts.
  const checkable = (outcome.rows ?? []).filter((row) => row.mapCheckable);
  if (checkable.length) {
    const realStreets = await checkStreetsExist(checkable);
    if (realStreets.size) {
      const repass = planRoster(parsed, existing, publications, rosterPublication || null,
        addressRulings, { realStreets });
      if (!repass.error) outcome = repass;
    }
  }

  if (outcome.error) {
    return { error: outcome.error, rows: null, fileName: file.name, summary: null };
  }
  return { error: null, rows: outcome.rows, fileName: file.name, summary: outcome.summary };
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

  // The plan is a photograph of the address list at Review time, and this list
  // was just re-read. Between the two, a CSR can take the same phone call the
  // roster is reporting and add the address by hand -- docs/domain-notes.md
  // requires both paths stay open, so this is the ordinary case, not an exotic
  // one. Validating ids does not catch it, because a "create" row has no id to
  // validate: the address simply exists now and did not before.
  //
  // So the premise is re-checked for every create: how many lines the address
  // already has with this publication. If that has changed since the plan was
  // built, the row is skipped rather than applied. Two office staff each
  // uploading the same roster is the same shape.
  const linesWithPub = new Map<string, number>();
  for (const stop of existing) {
    const key = `${normalizeStreet(stop.street)}|${normalizeHouseNumber(stop.houseNumber)}`;
    linesWithPub.set(key, (linesWithPub.get(key) ?? 0) + 1);
  }
  /** Creates already made by THIS apply, so two rows for one address still both land. */
  const createdHere = new Map<string, number>();

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
        // Was this address created or extended since the plan was built?
        const key = `${normalizeStreet(row.newStop.street)}|${normalizeHouseNumber(row.newStop.houseNumber)}`;
        const now = linesWithPub.get(key) ?? 0;
        const planned = row.newStop.linesAtPlanTime ?? now;
        if (now > planned + (createdHere.get(key) ?? 0)) {
          skipped += 1;
          continue;
        }
        createdHere.set(key, (createdHere.get(key) ?? 0) + 1);
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

/**
 * Records an answer the office has given about an address or a street, so the
 * weekly import stops asking it.
 *
 * Ari, 2026-08-31: "it does make sense to build something to record decisions
 * about specific addresses so that we don't have to answer the same questions
 * every week." Measured on the 27 Aug master list, 55 questions were "this house
 * number is outside the stretch of that street our routes cover" -- a fact about
 * geography, re-answered every week because there was nowhere to put it.
 *
 * Scoped to the whole street when no house number is given, which is usually what
 * the office means: BRUCE ST is a real Lakewood street we do not deliver, and
 * that is true of every number on it.
 */
export async function recordRuling(_prev: { error: string | null; saved: string | null }, formData: FormData) {
  const street = String(formData.get("street") ?? "").trim();
  const houseNumber = String(formData.get("houseNumber") ?? "").trim();
  const ruling = String(formData.get("ruling") ?? "");
  const publicationId = String(formData.get("publicationId") ?? "").trim();

  if (!street) return { error: "That row has no street to record.", saved: null };
  if (ruling !== "not_ours" && ruling !== "ours") {
    return { error: "Unrecognised answer.", saved: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again — your session expired.", saved: null };

  if (!houseNumber) return { error: "That row has no house number to record.", saved: null };

  // Upsert on the address, so changing your mind replaces the old answer rather
  // than leaving two contradictory ones and letting row order decide.
  const { error } = await supabase.from("address_rulings").upsert(
    {
      created_by: user.id,
      // Stored normalised, so an answer recorded against "Bruce St" also answers
      // "BRUCE STREET" next week.
      street: normalizeStreet(street),
      house_number: normalizeHouseNumber(houseNumber),
      publication_id: publicationId || null,
      ruling,
      note: String(formData.get("note") ?? "").trim() || null,
    },
    { onConflict: "street,house_number,publication_id" },
  );
  if (error) return { error: `Could not record that: ${error.message}`, saved: null };

  revalidatePath("/import");
  return {
    error: null,
    saved:
      ruling === "not_ours"
        ? `${houseNumber} ${street.toUpperCase()} recorded as not on our routes — we will stop asking.`
        : `${houseNumber} ${street.toUpperCase()} recorded as on our routes — we will stop asking.`,
  };
}

/** Removes an answer, so the address goes back to being asked about. */
export async function deleteRuling(_prev: { error: string | null; saved: string | null }, formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Nothing to remove.", saved: null };
  const supabase = await createClient();
  const { error } = await supabase.from("address_rulings").delete().eq("id", id);
  if (error) return { error: `Could not remove that: ${error.message}`, saved: null };
  revalidatePath("/import");
  return { error: null, saved: "Answer removed — that address will be asked about again." };
}
