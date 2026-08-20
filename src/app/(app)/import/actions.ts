"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsv, rowsFromGrid, type ParsedRow } from "@/lib/import/parse";
import { buildStreetZoneMap, planRow, type ExistingStop, type PlanRow } from "@/lib/import/match";

export type PlanState = { error: string | null; rows: PlanRow[] | null; fileName: string | null };
export type ApplyState = { error: string | null; applied: number | null; skipped: number | null };

async function loadContext() {
  const supabase = await createClient();

  const [{ data: stops }, { data: publications }, { data: zones }] = await Promise.all([
    supabase
      .from("stops")
      .select(
        "id, zone_id, recipient_name, house_number, street, floor_side, stop_publications(publication_id), zones!inner(number)",
      )
      .eq("active", true),
    supabase.from("publications").select("id, code, name").eq("active", true).order("name"),
    supabase.from("zones").select("id, number").order("number"),
  ]);

  const existing: ExistingStop[] = (stops ?? []).map((stop) => ({
    id: stop.id,
    zoneId: stop.zone_id,
    zoneNumber: stop.zones.number,
    recipientName: stop.recipient_name,
    houseNumber: stop.house_number,
    street: stop.street,
    floorSide: stop.floor_side,
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
    return { error: "Choose a spreadsheet first.", rows: null, fileName: null };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "That file is larger than 5 MB.", rows: null, fileName: null };
  }

  let parsed: ParsedRow[];
  try {
    parsed = rowsFromGrid(await gridFromFile(file));
  } catch (error) {
    return {
      error: `Could not read that file: ${(error as Error).message}`,
      rows: null,
      fileName: file.name,
    };
  }

  if (!parsed.length) {
    return { error: "No rows found. Is the first row a header?", rows: null, fileName: file.name };
  }

  const { existing, publications } = await loadContext();
  const streetZones = buildStreetZoneMap(existing);
  const rows = parsed.map((row) => planRow(row, existing, publications, streetZones));

  return { error: null, rows, fileName: file.name };
}

export async function applyImport(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  let rows: PlanRow[];
  try {
    rows = JSON.parse(String(formData.get("plan") ?? "[]")) as PlanRow[];
  } catch {
    return { error: "The review data was malformed — re-upload the file.", applied: null, skipped: null };
  }

  const { supabase, existing, publications, zones } = await loadContext();

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

  revalidatePath("/", "layout");
  return { error: null, applied, skipped };
}
