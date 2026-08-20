import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBooklet } from "@/lib/booklet";
import { CoverWorkspace } from "./cover-workspace";

export default async function CoverPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: zone } = await supabase
    .from("zones")
    .select("id, number, name")
    .eq("number", Number(number))
    .maybeSingle();
  if (!zone) notFound();

  const [{ data: profile }, { data: access }, { data: allPublications }] = await Promise.all([
    supabase.from("profiles").select("is_courier_office").eq("id", user.id).single(),
    supabase.from("user_publication_access").select("publication_id"),
    supabase.from("publications").select("id, code, name").eq("active", true).order("name"),
  ]);

  const accessibleIds = new Set((access ?? []).map((row) => row.publication_id));
  const publications = (allPublications ?? []).filter(
    (pub) => profile?.is_courier_office || accessibleIds.has(pub.id),
  );

  // Rendered for every publication the viewer can see; the client narrows the
  // PDF and the mark-as-printed scope from there.
  const booklet = await getBooklet(
    supabase,
    zone,
    publications,
    publications.map((pub) => pub.id),
  );

  return (
    <CoverWorkspace
      zoneId={zone.id}
      zoneNumber={zone.number}
      zoneLabel={zone.name ?? `Zone ${zone.number}`}
      publications={publications}
      sections={{
        additions: booklet.additions,
        deletions: booklet.deletions,
        changes: booklet.changes,
        complaints: booklet.complaints,
      }}
      isCourierOffice={Boolean(profile?.is_courier_office)}
    />
  );
}
