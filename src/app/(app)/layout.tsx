import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("is_courier_office").eq("id", user.id).single()
    : { data: null };

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
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
