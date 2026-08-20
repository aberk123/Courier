"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markPrinted(formData: FormData) {
  const supabase = await createClient();
  const zoneId = String(formData.get("zoneId"));
  const zoneNumber = String(formData.get("zoneNumber"));
  const publicationIds = formData.getAll("publicationIds").map(String);

  const { error } = await supabase.rpc("mark_cover_sheet_printed", {
    p_zone_id: zoneId,
    p_publication_ids: publicationIds,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/zones/${zoneNumber}/cover`);
  revalidatePath(`/zones/${zoneNumber}`);
}
