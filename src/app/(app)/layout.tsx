import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
        <Link href="/" className="text-lg font-semibold">
          Lakewood Courier
        </Link>
        <div className="flex items-center gap-3 text-sm text-black/60 dark:text-white/60">
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
