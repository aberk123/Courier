import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

// Token verification happens in /auth/confirm (a Route Handler) before landing
// here, so by this point the visitor either has a session or the link was bad.
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      {user ? (
        <SetPasswordForm />
      ) : (
        <div className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-black">
          <h1 className="text-xl font-semibold">This link has already been used</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Password links work only once. This usually means it was opened before — often by
            whoever sent it, checking that it worked — or that a newer link has since been
            generated, which cancels the older one.
          </p>
          <p className="text-sm text-black/60 dark:text-white/60">
            Ask the courier office for a fresh link and open it yourself, or sign in if you
            already know your password.
          </p>
          <Link href="/login" className="inline-block underline underline-offset-2">
            Back to sign in
          </Link>
        </div>
      )}
    </main>
  );
}
