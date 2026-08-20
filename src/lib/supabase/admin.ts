import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Service-role client: bypasses RLS entirely. Only for operations that
// genuinely require Supabase's Admin API (creating auth users, generating
// password-reset links) — never for regular data reads/writes, which should
// go through the per-request client in server.ts so RLS still applies.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it as a server-only env var (Supabase dashboard -> Project Settings -> API -> service_role key) to enable user management.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
