import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ZoneWorkspace, type StopWithPublications } from "./zone-workspace";

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

  const [{ data: publications }, { data: stops }] = await Promise.all([
    supabase.from("publications").select("id, code, name").eq("active", true).order("name"),
    supabase
      .from("stops")
      .select(
        "id, recipient_name, house_number, street, floor_side, special_instructions, stop_publications(publication_id)",
      )
      .eq("zone_id", zone.id)
      .eq("active", true)
      .order("street")
      .order("house_number"),
  ]);

  const stopsForClient: StopWithPublications[] = (stops ?? []).map((stop) => ({
    id: stop.id,
    recipientName: stop.recipient_name,
    houseNumber: stop.house_number,
    street: stop.street,
    floorSide: stop.floor_side,
    specialInstructions: stop.special_instructions,
    publicationIds: stop.stop_publications.map((sp) => sp.publication_id),
  }));

  return (
    <ZoneWorkspace
      zoneId={zone.id}
      zoneNumber={zone.number}
      zoneName={zone.name}
      publications={publications ?? []}
      initialStops={stopsForClient}
    />
  );
}
