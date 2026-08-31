import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportWorkspace } from "./import-workspace";

export default async function ImportPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Courier office only, matching Manage Users. Not a new boundary -- RLS already
  // refuses every write a scoped staffer could attempt, and import_runs_insert
  // fails at the first statement. The problem is upstream of the write: for a
  // publication-scoped user `loadContext` returns only stops that already have
  // their publication, so the whole count premise is computed from a partial
  // list. They would work through a plausible-looking plan of hundreds of rows
  // and then hit an opaque Postgres error with nothing applied.
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("is_courier_office")
    .eq("id", user.id)
    .single();
  if (!myProfile?.is_courier_office) redirect("/");

  const [{ data: zones }, { data: publications }, { data: runs }, { data: rulings }] = await Promise.all([
    supabase.from("zones").select("id, number, name").order("number"),
    supabase.from("publications").select("id, code, name").eq("active", true).order("name"),
    // Only the courier office can see these -- import_runs_select enforces it,
    // so a scoped staffer simply gets an empty list rather than an error.
    supabase
      .from("import_runs")
      .select("id, created_at, file_name, applied_count, undone_at, publication_id")
      .order("created_at", { ascending: false })
      .limit(5),
    // Answers the office has given. Shown so a permanent "no" is visible and
    // removable, rather than being an invisible decision nobody can review.
    supabase
      .from("address_rulings")
      .select("id, street, house_number, ruling, note, created_at, publication_id")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <ImportWorkspace
      zones={(zones ?? []).map((zone) => ({
        id: zone.id,
        number: zone.number,
        label: zone.name ?? `Zone ${zone.number}`,
      }))}
      publications={publications ?? []}
      rulings={(rulings ?? []).map((r) => ({
        id: r.id,
        street: r.street,
        houseNumber: r.house_number,
        ruling: r.ruling as "not_ours" | "ours",
        note: r.note,
        publicationName:
          (publications ?? []).find((pub) => pub.id === r.publication_id)?.name ?? null,
      }))}
      runs={(runs ?? []).map((run) => ({
        id: run.id,
        createdAt: run.created_at,
        fileName: run.file_name,
        appliedCount: run.applied_count,
        undoneAt: run.undone_at,
        publicationName:
          (publications ?? []).find((pub) => pub.id === run.publication_id)?.name ?? null,
      }))}
    />
  );
}
