"use server";

import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Only the link types this app actually sends. Anything else is treated as a
// bad link rather than passed through to Supabase.
const ALLOWED_TYPES = new Set<EmailOtpType>(["recovery", "invite", "email", "signup"]);

/**
 * Spends the one-time token. Deliberately a Server Action, reached only by an
 * explicit form POST -- see the page for why the GET must not do this.
 *
 * A Server Action can set cookies; a Server Component render cannot (Next.js
 * throws, and lib/supabase/server.ts swallows it), which is why verification
 * cannot simply live in the page itself.
 */
export async function confirmRecoveryLink(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  const requestedNext = String(formData.get("next") ?? "/reset-password");

  // Never bounce to an absolute URL from a query parameter -- that is an open
  // redirect, and these links get forwarded around.
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/reset-password";

  if (!tokenHash || !ALLOWED_TYPES.has(type)) redirect("/reset-password?expired=1");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) redirect("/reset-password?expired=1");

  redirect(next);
}
