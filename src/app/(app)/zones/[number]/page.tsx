import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ZoneWorkspace, type RouteItem } from "./zone-workspace";

// Supabase caps a response at 1000 rows. The largest zone is currently 735
// route entries, so nothing is near the ceiling -- but if a zone ever crosses
// it, rows would be dropped silently. We compare against the true count and
// surface a banner rather than quietly serving a short route.
const ROW_CAP = 1000;

export default async function ZonePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const zoneNumber = Number(number);
  const supabase = await createClient();

  const { data: zone } = await supabase
    .from("zones")
    .select("id, number, name")
    .eq("number", zoneNumber)
    .maybeSingle();

  if (!zone) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: access },
    { data: allPublications },
    { data: entries, count: entryCount },
  ] = await Promise.all([
    supabase.from("profiles").select("is_courier_office").eq("id", user!.id).single(),
    supabase.from("user_publication_access").select("publication_id"),
    supabase.from("publications").select("id, code, name").eq("active", true).order("name"),
    supabase
      .from("route_entries")
      .select(
        "id, sequence, kind, direction_text, stops(id, recipient_name, house_number, street, floor_side, special_instructions, special_instructions_2, active, stop_publications(publication_id))",
        { count: "exact" },
      )
      .eq("zone_id", zone.id)
      .order("sequence"),
  ]);

  // Only offer publications this user can actually act on. Showing all 15 to a
  // publication-scoped staffer renders 14 toggles as "off" even when the stop
  // receives them, which misrepresents the data and produces a write that RLS
  // then rejects.
  const accessibleIds = new Set((access ?? []).map((row) => row.publication_id));
  const publications = (allPublications ?? []).filter(
    (pub) => profile?.is_courier_office || accessibleIds.has(pub.id),
  );

  const items: RouteItem[] = [];
  for (const entry of entries ?? []) {
    if (entry.kind === "direction") {
      if (entry.direction_text) {
        items.push({ kind: "direction", id: entry.id, text: entry.direction_text });
      }
      continue;
    }
    const stop = entry.stops;
    // An inaccessible stop is already filtered out by RLS; an inactive one is
    // retained in the sequence (soft-delete convention) but not shown.
    if (!stop || !stop.active) continue;
    items.push({
      kind: "stop",
      id: entry.id,
      stopId: stop.id,
      recipientName: stop.recipient_name,
      houseNumber: stop.house_number,
      street: stop.street,
      floorSide: stop.floor_side,
      specialInstructions: stop.special_instructions,
      specialInstructions2: stop.special_instructions_2,
      publicationIds: stop.stop_publications.map((sp) => sp.publication_id),
    });
  }

  const truncated = (entries?.length ?? 0) >= ROW_CAP && (entryCount ?? 0) > (entries?.length ?? 0);

  return (
    <ZoneWorkspace
      zoneId={zone.id}
      zoneNumber={zone.number}
      zoneName={zone.name}
      publications={publications}
      items={items}
      truncated={truncated}
      isCourierOffice={Boolean(profile?.is_courier_office)}
    />
  );
}
