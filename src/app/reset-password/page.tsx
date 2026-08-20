import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Redirect to the same path without the code so a page refresh doesn't
    // try to exchange an already-used code again.
    redirect(error ? "/reset-password?expired=1" : "/reset-password");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      {user ? (
        <SetPasswordForm />
      ) : (
        <div className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-black">
          <h1 className="text-xl font-semibold">Link expired</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            This password link is invalid or has already been used. Ask the courier office to
            send you a new one, or sign in if you already know your password.
          </p>
          <Link href="/login" className="inline-block underline underline-offset-2">
            Back to sign in
          </Link>
        </div>
      )}
    </main>
  );
}
