import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportWorkspace } from "./import-workspace";

export default async function ImportPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: zones }, { data: publications }] = await Promise.all([
    supabase.from("zones").select("id, number, name").order("number"),
    supabase.from("publications").select("id, code, name").eq("active", true).order("name"),
  ]);

  return (
    <ImportWorkspace
      zones={(zones ?? []).map((zone) => ({
        id: zone.id,
        number: zone.number,
        label: zone.name ?? `Zone ${zone.number}`,
      }))}
      publications={publications ?? []}
    />
  );
}
