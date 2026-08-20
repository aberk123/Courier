"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Adds an address from the home screen, where the CSR has searched but not yet
 * opened a route. Same RPC the zone workspace uses -- the only difference is
 * that the zone comes from a picker instead of the page, and that we land the
 * CSR on the new address afterwards so they can see it took.
 */
export async function createStopFromHome(formData: FormData) {
  const supabase = await createClient();
  const zoneId = String(formData.get("zoneId"));

  const { data: stopId, error } = await supabase.rpc("create_stop_in_route", {
    p_zone_id: zoneId,
    p_recipient_name: String(formData.get("recipientName") ?? "") || null,
    p_house_number: String(formData.get("houseNumber") ?? ""),
    p_street: String(formData.get("street") ?? ""),
    p_floor_side: String(formData.get("floorSide") ?? "") || null,
    p_special_instructions: String(formData.get("specialInstructions") ?? "") || null,
    p_publication_ids: formData.getAll("publicationIds").map(String),
  });
  if (error) throw new Error(error.message);

  // The RPC returns the stop, not the route, and a scoped staffer cannot read
  // the zone back through the new stop until its publication links exist -- so
  // ask for the zone directly.
  const { data: zone } = await supabase
    .from("zones")
    .select("number")
    .eq("id", zoneId)
    .maybeSingle();

  revalidatePath("/");
  if (zone) {
    revalidatePath(`/zones/${zone.number}`);
    redirect(`/zones/${zone.number}?stop=${stopId}`);
  }
  redirect("/");
}
