import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Password-reset / invite links land here, NOT on a page. Session cookies can
// only be written from a Route Handler or Server Action -- Next.js throws if a
// Server Component tries to set them (and lib/supabase/server.ts swallows that
// error), so verifying inside a page would silently drop the session and make
// every valid link look expired.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/reset-password";

  // Build the onward redirect without leaking the token into the address bar.
  const redirectTo = request.nextUrl.clone();
  redirectTo.search = "";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirectTo.pathname = next;
      return NextResponse.redirect(redirectTo);
    }
  }

  redirectTo.pathname = "/reset-password";
  redirectTo.searchParams.set("expired", "1");
  return NextResponse.redirect(redirectTo);
}
