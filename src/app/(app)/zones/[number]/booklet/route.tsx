import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBooklet } from "@/lib/booklet";
import { BookletDocument } from "@/lib/booklet-pdf";

// One booklet per route, downloaded as its own PDF. Deliberately not a single
// combined document: Lakewood Courier's printer auto-staples each print job, so
// one continuous PDF would have to be manually sorted and stapled afterwards.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params;
  const zoneNumber = Number(number);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const { data: zone } = await supabase
    .from("zones")
    .select("id, number, name")
    .eq("number", zoneNumber)
    .maybeSingle();
  if (!zone) return new NextResponse("Zone not found", { status: 404 });

  const [{ data: profile }, { data: access }, { data: allPublications }] = await Promise.all([
    supabase.from("profiles").select("is_courier_office").eq("id", user.id).single(),
    supabase.from("user_publication_access").select("publication_id"),
    supabase.from("publications").select("id, code, name").eq("active", true).order("name"),
  ]);

  const accessibleIds = new Set((access ?? []).map((row) => row.publication_id));
  const publications = (allPublications ?? []).filter(
    (pub) => profile?.is_courier_office || accessibleIds.has(pub.id),
  );

  // ?pubs=voice,shopper selects a subset; omitted means every publication the
  // caller can see. Codes rather than ids so the URL stays hand-editable.
  const requested = request.nextUrl.searchParams.get("pubs");
  const selected = requested
    ? publications.filter((pub) => requested.split(",").includes(pub.code))
    : publications;

  if (!selected.length) {
    return new NextResponse("No publications selected, or none you can access.", { status: 400 });
  }

  const booklet = await getBooklet(
    supabase,
    zone,
    publications,
    selected.map((pub) => pub.id),
  );

  const printedOn = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const buffer = await renderToBuffer(
    <BookletDocument booklet={booklet} printedOn={printedOn} />,
  );

  const slug = selected.length === publications.length ? "all" : selected.map((p) => p.code).join("-");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="zone-${zone.number}-${slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
