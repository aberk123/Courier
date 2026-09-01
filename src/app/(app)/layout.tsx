import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { Breadcrumbs } from "./breadcrumbs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: zones }] = await Promise.all([
    user
      ? supabase.from("profiles").select("is_courier_office").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
    // Five rows, so cheap enough to fetch on every page in exchange for a trail
    // that shows a route's real name rather than its number.
    supabase.from("zones").select("number, name"),
  ]);

  const zoneLabels = Object.fromEntries(
    (zones ?? []).map((zone) => [String(zone.number), zone.name ?? `Zone ${zone.number}`]),
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
        <Link href="/" className="text-lg font-semibold">
          Lakewood Courier
        </Link>
        <div className="flex items-center gap-4 text-sm text-black/60 dark:text-white/60">
          <Link href="/import" className="underline underline-offset-2">
            Import
          </Link>
          <Link href="/questions" className="underline underline-offset-2">
            Questions
          </Link>
          {profile?.is_courier_office ? (
            <Link href="/users" className="underline underline-offset-2">
              Manage users
            </Link>
          ) : null}
          {user?.email ? <span className="hidden sm:inline">{user.email}</span> : null}
          <form action={signOut}>
            <button type="submit" className="underline underline-offset-2">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <Breadcrumbs zoneLabels={zoneLabels} />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
