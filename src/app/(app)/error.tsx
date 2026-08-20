"use client";

import Link from "next/link";
import { useEffect } from "react";

// Without this, any thrown server action -- an RLS denial, a dropped
// connection, a bad write -- lands the user on Next.js's default error screen
// with no way back.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isPermission =
    /permission|not permitted|row-level security|do not have access/i.test(error.message);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-black">
        <h1 className="text-xl font-semibold">
          {isPermission ? "You don't have access to that" : "Something went wrong"}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {isPermission
            ? "That change is outside the publications your account can edit. Ask the courier office if you think you should be able to make it."
            : "The change was not saved. You can try again — if it keeps happening, tell the courier office what you were doing."}
        </p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/20"
          >
            Back to zones
          </Link>
        </div>
      </div>
    </main>
  );
}
