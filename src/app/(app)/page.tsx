import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: zones } = await supabase
    .from("zones")
    .select("number, name")
    .order("number");

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold">Zones</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Pick a zone to search and edit its addresses.
      </p>

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
    </div>
  );
}
