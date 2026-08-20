import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { parseAddressQuery } from "@/lib/address-search";
import { AddAddressPanel } from "./add-address-panel";

// Search is a plain GET form rather than a client-side filter. The CSR is often
// on the phone with a subscriber, so the result needs to survive a reload and a
// back button, and 2,623 stops across five routes is too much to ship to the
// browser just to filter it there -- the zone workspace already pays that cost
// for one route at a time.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: zones }, { data: profile }, { data: access }, { data: allPublications }] =
    await Promise.all([
      supabase.from("zones").select("id, number, name").order("number"),
      supabase.from("profiles").select("is_courier_office").eq("id", user!.id).single(),
      supabase.from("user_publication_access").select("publication_id"),
      supabase.from("publications").select("id, code, name").eq("active", true).order("name"),
    ]);

  // Same scoping as the zone workspace: only offer publications this user can
  // actually act on, or a scoped staffer sees toggles that RLS then rejects.
  const accessibleIds = new Set((access ?? []).map((row) => row.publication_id));
  const publications = (allPublications ?? []).filter(
    (pub) => profile?.is_courier_office || accessibleIds.has(pub.id),
  );
  const pubName = new Map(publications.map((pub) => [pub.id, pub.name]));

  const parsed = q ? parseAddressQuery(q) : null;

  let results: {
    id: string;
    recipientName: string | null;
    houseNumber: string;
    street: string;
    floorSide: string | null;
    zoneNumber: number;
    zoneLabel: string;
    receives: string[];
  }[] = [];

  if (parsed) {
    let query = supabase
      .from("stops")
      .select(
        "id, recipient_name, house_number, street, floor_side, zones!inner(number, name), stop_publications(publication_id)",
      )
      .eq("active", true)
      .order("street")
      .order("house_number")
      .limit(60);

    // An exact house number, because "28" should not also return 128 and 280.
    if (parsed.houseNumber) query = query.ilike("house_number", parsed.houseNumber);

    if (parsed.streetTerm) {
      query = parsed.houseNumber
        ? // Number and street given: both must match, or every "28" in town comes back.
          query.ilike("street", `%${parsed.streetTerm}%`)
        : // Just a word: it could be a street or a surname, so try both.
          query.or(
            `street.ilike.%${parsed.streetTerm}%,recipient_name.ilike.%${parsed.text}%`,
          );
    }

    const { data } = await query;
    results = (data ?? []).map((stop) => ({
      id: stop.id,
      recipientName: stop.recipient_name,
      houseNumber: stop.house_number,
      street: stop.street,
      floorSide: stop.floor_side,
      zoneNumber: stop.zones.number,
      zoneLabel: stop.zones.name ?? `Zone ${stop.zones.number}`,
      receives: (stop.stop_publications ?? [])
        .map((link) => pubName.get(link.publication_id))
        .filter((name): name is string => Boolean(name))
        .sort(),
    }));
  }

  // If the address is new but its street is already on a route, that route is
  // almost certainly the right one -- which is the whole reason the CSR was
  // searching. This deliberately asks about the *street*, ignoring the house
  // number, rather than reading it off the results above: a new number on a
  // known street matches nothing, and that is exactly when the suggestion is
  // needed most.
  let suggestedZoneNumber: number | null = null;
  if (parsed?.streetTerm) {
    const { data: streetRows } = await supabase
      .from("stops")
      .select("zones!inner(number)")
      .eq("active", true)
      .ilike("street", `%${parsed.streetTerm}%`)
      .limit(200);

    const zoneTally = new Map<number, number>();
    for (const row of streetRows ?? []) {
      zoneTally.set(row.zones.number, (zoneTally.get(row.zones.number) ?? 0) + 1);
    }
    // A street can run through more than one route; the busiest is the best guess.
    suggestedZoneNumber = [...zoneTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold">Find an address</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Search every route at once — you don&apos;t need to know which one it&apos;s on.
      </p>

      <form action="/" method="get" className="mt-5 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          autoFocus
          placeholder="28 Squankum Rd, or a street, or a name"
          aria-label="Search addresses on every route"
          className="flex-1 rounded-lg border border-black/15 px-3 py-2 text-base dark:border-white/20 dark:bg-black"
        />
        <button
          type="submit"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Search
        </button>
      </form>

      {parsed ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60">
            {results.length
              ? `${results.length} match${results.length === 1 ? "" : "es"}${
                  results.length === 60 ? " (showing the first 60)" : ""
                }`
              : "No matches"}
          </h2>

          {results.length ? (
            <ul className="mt-3 divide-y divide-black/10 dark:divide-white/10">
              {results.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/zones/${row.zoneNumber}?stop=${row.id}`}
                    className="flex items-start justify-between gap-3 py-3 hover:bg-black/[.03] dark:hover:bg-white/[.06]"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">
                        {row.houseNumber} {row.street}
                      </span>
                      {row.floorSide ? (
                        <span className="ml-2 text-sm text-black/60 dark:text-white/60">
                          {row.floorSide}
                        </span>
                      ) : null}
                      {row.recipientName ? (
                        <span className="block text-sm text-black/60 dark:text-white/60">
                          {row.recipientName}
                        </span>
                      ) : null}
                      <span className="block text-xs text-black/50 dark:text-white/50">
                        {row.receives.length ? row.receives.join(" · ") : "No publications"}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-black/15 px-2.5 py-1 text-xs font-medium dark:border-white/20">
                      {row.zoneLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-black/60 dark:text-white/60">
              Nothing on any route matches “{q}”. If it&apos;s a new subscriber, add the
              address below.
            </p>
          )}

          <AddAddressPanel
            zones={(zones ?? []).map((zone) => ({
              id: zone.id,
              number: zone.number,
              label: zone.name ?? `Zone ${zone.number}`,
            }))}
            publications={publications}
            suggestedZoneNumber={suggestedZoneNumber}
            prefill={q ?? ""}
            startOpen={results.length === 0}
          />
        </section>
      ) : (
        <>
          <h2 className="mt-8 text-sm font-medium text-black/60 dark:text-white/60">
            Or open a route
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {zones?.map((zone) => (
              <li key={zone.number}>
                <Link
                  href={`/zones/${zone.number}`}
                  className="flex min-h-16 items-center justify-center rounded-xl border border-black/10 px-4 py-4 text-lg font-medium hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.06]"
                >
                  {zone.name ?? `Zone ${zone.number}`}
                </Link>
              </li>
            ))}
          </ul>
          {!zones?.length ? (
            <p className="mt-6 text-black/60 dark:text-white/60">No zones yet.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
