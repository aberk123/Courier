"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function togglePublication(formData: FormData) {
  const supabase = await createClient();
  const stopId = String(formData.get("stopId"));
  const publicationId = String(formData.get("publicationId"));
  const wantOn = formData.get("eventType") === "added";
  const zoneNumber = String(formData.get("zoneNumber"));

  // Read current state rather than trusting the button that was rendered.
  // A double-tap (easy on a phone) would otherwise log two identical events,
  // and the event log is what the cover sheet's Additions/Deletions read from,
  // so duplicates would print twice. stop_publications stays correct either
  // way thanks to `on conflict do nothing`, but the log would not.
  const { data: existing } = await supabase
    .from("stop_publications")
    .select("publication_id")
    .eq("stop_id", stopId)
    .eq("publication_id", publicationId)
    .maybeSingle();

  const isOn = Boolean(existing);
  if (isOn === wantOn) {
    revalidatePath(`/zones/${zoneNumber}`);
    return;
  }

  const { error } = await supabase.from("stop_publication_events").insert({
    stop_id: stopId,
    publication_id: publicationId,
    event_type: wantOn ? "added" : "removed",
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/zones/${zoneNumber}`);
}

export async function createStop(formData: FormData) {
  const supabase = await createClient();
  const zoneId = String(formData.get("zoneId"));
  const zoneNumber = String(formData.get("zoneNumber"));

  // Single RPC so the stop, its publication events and its position in the
  // route sequence are created atomically. See the create_stop_in_route
  // migration for why this cannot be done from the client.
  const { error } = await supabase.rpc("create_stop_in_route", {
    p_zone_id: zoneId,
    p_recipient_name: String(formData.get("recipientName") ?? "") || null,
    p_house_number: String(formData.get("houseNumber") ?? ""),
    p_street: String(formData.get("street") ?? ""),
    p_floor_side: String(formData.get("floorSide") ?? "") || null,
    p_special_instructions: String(formData.get("specialInstructions") ?? "") || null,
    p_publication_ids: formData.getAll("publicationIds").map(String),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/zones/${zoneNumber}`);
}

export async function updateStopDetails(formData: FormData) {
  const supabase = await createClient();
  const stopId = String(formData.get("stopId"));
  const zoneNumber = String(formData.get("zoneNumber"));

  const floorSide = String(formData.get("floorSide") ?? "") || null;
  const instructions = String(formData.get("specialInstructions") ?? "") || null;
  const instructions2 = String(formData.get("specialInstructions2") ?? "") || null;

  const prevFloorSide = String(formData.get("previousFloorSide") ?? "") || null;
  const prevInstructions = String(formData.get("previousInstructions") ?? "") || null;
  const prevInstructions2 = String(formData.get("previousInstructions2") ?? "") || null;

  const { error } = await supabase
    .from("stops")
    .update({
      floor_side: floorSide,
      special_instructions: instructions,
      special_instructions_2: instructions2,
    })
    .eq("id", stopId);
  if (error) throw new Error(error.message);

  // Floor/side and instruction edits are exactly what the cover sheet's
  // "Changes" section reports, so each edited field is logged separately.
  const changes: string[] = [];
  const describe = (label: string, before: string | null, after: string | null) => {
    if (before !== after) changes.push(`${label}: "${before ?? "(none)"}" -> "${after ?? "(none)"}"`);
  };
  describe("Floor/side", prevFloorSide, floorSide);
  describe("Instructions", prevInstructions, instructions);
  describe("Instructions (2)", prevInstructions2, instructions2);

  if (changes.length) {
    await supabase
      .from("stop_instruction_changes")
      .insert({ stop_id: stopId, description: changes.join("; ") });
  }

  revalidatePath(`/zones/${zoneNumber}`);
}

export async function logComplaint(formData: FormData) {
  const supabase = await createClient();
  const stopId = String(formData.get("stopId"));
  const zoneNumber = String(formData.get("zoneNumber"));
  const description = String(formData.get("description") ?? "");

  const { error } = await supabase.from("complaints").insert({ stop_id: stopId, description });
  if (error) throw new Error(error.message);

  revalidatePath(`/zones/${zoneNumber}`);
}

export async function deactivateStop(formData: FormData) {
  const supabase = await createClient();
  const stopId = String(formData.get("stopId"));
  const zoneNumber = String(formData.get("zoneNumber"));

  const { error } = await supabase.from("stops").update({ active: false }).eq("id", stopId);
  if (error) throw new Error(error.message);

  revalidatePath(`/zones/${zoneNumber}`);
}
