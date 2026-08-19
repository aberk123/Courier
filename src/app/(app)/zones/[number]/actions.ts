"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function togglePublication(formData: FormData) {
  const supabase = await createClient();
  const stopId = String(formData.get("stopId"));
  const publicationId = String(formData.get("publicationId"));
  const eventType = formData.get("eventType") === "added" ? "added" : "removed";
  const zoneNumber = String(formData.get("zoneNumber"));

  const { error } = await supabase.from("stop_publication_events").insert({
    stop_id: stopId,
    publication_id: publicationId,
    event_type: eventType,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/zones/${zoneNumber}`);
}

export async function createStop(formData: FormData) {
  const supabase = await createClient();
  const zoneId = String(formData.get("zoneId"));
  const zoneNumber = String(formData.get("zoneNumber"));
  const recipientName = (String(formData.get("recipientName") ?? "") || null) as string | null;
  const houseNumber = String(formData.get("houseNumber") ?? "");
  const street = String(formData.get("street") ?? "");
  const floorSide = (String(formData.get("floorSide") ?? "") || null) as string | null;
  const specialInstructions = (String(formData.get("specialInstructions") ?? "") || null) as
    | string
    | null;
  const publicationIds = formData.getAll("publicationIds").map(String);

  const { data: stop, error } = await supabase
    .from("stops")
    .insert({
      zone_id: zoneId,
      recipient_name: recipientName,
      house_number: houseNumber,
      street,
      floor_side: floorSide,
      special_instructions: specialInstructions,
    })
    .select("id")
    .single();

  if (error || !stop) throw new Error(error?.message ?? "Failed to create address");

  if (publicationIds.length) {
    const { error: eventsError } = await supabase.from("stop_publication_events").insert(
      publicationIds.map((publicationId) => ({
        stop_id: stop.id,
        publication_id: publicationId,
        event_type: "added" as const,
      })),
    );
    if (eventsError) throw new Error(eventsError.message);
  }

  revalidatePath(`/zones/${zoneNumber}`);
}

export async function updateInstructions(formData: FormData) {
  const supabase = await createClient();
  const stopId = String(formData.get("stopId"));
  const zoneNumber = String(formData.get("zoneNumber"));
  const specialInstructions = String(formData.get("specialInstructions") ?? "");
  const previous = String(formData.get("previousInstructions") ?? "");

  const { error } = await supabase
    .from("stops")
    .update({ special_instructions: specialInstructions || null })
    .eq("id", stopId);
  if (error) throw new Error(error.message);

  if (specialInstructions !== previous) {
    await supabase.from("stop_instruction_changes").insert({
      stop_id: stopId,
      description: `Instructions changed: "${previous || "(none)"}" -> "${specialInstructions || "(none)"}"`,
    });
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
