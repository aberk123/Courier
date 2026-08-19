"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(signIn, null);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-5 rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black"
      >
        <div>
          <h1 className="text-xl font-semibold">Lakewood Courier</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Sign in to manage routes and addresses.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            autoFocus
            className="w-full rounded-lg border border-black/15 px-4 py-3 text-base dark:border-white/20 dark:bg-black"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Password</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-black/15 px-4 py-3 text-base dark:border-white/20 dark:bg-black"
          />
        </label>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-black px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
