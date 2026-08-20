"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireCourierOffice() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_courier_office")
    .eq("id", user.id)
    .single();
  if (!profile?.is_courier_office) throw new Error("Only the courier office can manage users.");

  return { supabase, user };
}

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// Build a link straight to our own /auth/confirm route from the token hash.
// Deliberately NOT using the action_link Supabase returns: that one bounces
// through Supabase's /verify endpoint, which requires the domain to be on the
// project's redirect allowlist and hands the session back in a URL fragment
// the server can never read. Going direct sidesteps both problems.
function confirmUrl(origin: string, hashedToken: string) {
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", "/reset-password");
  return url.toString();
}

export type InviteState = { error: string | null; success: string | null; link: string | null };

export async function inviteUser(_prevState: InviteState, formData: FormData): Promise<InviteState> {
  const fail = (error: string): InviteState => ({ error, success: null, link: null });

  try {
    await requireCourierOffice();
  } catch (error) {
    return fail((error as Error).message);
  }

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim() || null;
  const isCourierOffice = formData.get("isCourierOffice") === "on";
  const publicationIds = formData.getAll("publicationIds").map(String);

  if (!email) return fail("Email is required.");

  const admin = createAdminClient();
  const origin = await siteOrigin();

  // Create the account directly with the email pre-confirmed, rather than
  // inviteUserByEmail(), so this never depends on outbound SMTP being wired
  // up on the Supabase project. The courier office passes the link along by
  // whatever means they already use.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return fail(createError?.message ?? "Failed to create user.");
  }

  const { supabase } = await requireCourierOffice();

  if (fullName || isCourierOffice) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: fullName, is_courier_office: isCourierOffice })
      .eq("id", created.user.id);
    if (profileError) return fail(profileError.message);
  }

  if (publicationIds.length) {
    const { error: accessError } = await supabase
      .from("user_publication_access")
      .insert(
        publicationIds.map((publicationId) => ({
          user_id: created.user.id,
          publication_id: publicationId,
        })),
      );
    if (accessError) return fail(accessError.message);
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (linkError || !linkData) {
    return {
      error: null,
      success: `${email} was added, but generating their sign-in link failed: ${
        linkError?.message ?? "unknown error"
      }. Use "Get password reset link" on their row below.`,
      link: null,
    };
  }

  revalidatePath("/users");
  return {
    error: null,
    success: `${email} was added. Send them the link below to set their password.`,
    link: confirmUrl(origin, linkData.properties.hashed_token),
  };
}

export async function setCourierOffice(formData: FormData) {
  const { supabase, user } = await requireCourierOffice();
  const userId = String(formData.get("userId"));
  const value = formData.get("value") === "true";

  // The UI disables this button on your own row; enforce it server-side too so
  // the office can't strip its own access and lock everyone out of this page.
  if (userId === user.id && !value) {
    throw new Error("You can't remove your own courier office access.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_courier_office: value })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/users");
}

export async function togglePublicationAccess(formData: FormData) {
  const { supabase } = await requireCourierOffice();
  const userId = String(formData.get("userId"));
  const publicationId = String(formData.get("publicationId"));
  const grant = formData.get("grant") === "true";

  if (grant) {
    const { error } = await supabase
      .from("user_publication_access")
      .insert({ user_id: userId, publication_id: publicationId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("user_publication_access")
      .delete()
      .eq("user_id", userId)
      .eq("publication_id", publicationId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/users");
}

export type ResetLinkState = { error: string | null; link: string | null };

export async function sendResetLink(
  _prevState: ResetLinkState,
  formData: FormData,
): Promise<ResetLinkState> {
  try {
    await requireCourierOffice();
  } catch (error) {
    return { error: (error as Error).message, link: null };
  }

  const email = String(formData.get("email") ?? "");
  if (!email) return { error: "Missing email.", link: null };

  const admin = createAdminClient();
  const origin = await siteOrigin();

  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data) return { error: error?.message ?? "Failed to generate link.", link: null };

  return { error: null, link: confirmUrl(origin, data.properties.hashed_token) };
}

export type UpdateUserState = { error: string | null; success: string | null };

/**
 * Edit an existing user's email and display name.
 *
 * The email lives in auth.users and the name in profiles, so this touches both:
 * the email through the Admin API (the only way to change a login), the name
 * through the RLS client so profiles_update still gates it on courier office.
 */
export async function updateUser(
  _prevState: UpdateUserState,
  formData: FormData,
): Promise<UpdateUserState> {
  const fail = (error: string): UpdateUserState => ({ error, success: null });

  let supabase;
  try {
    ({ supabase } = await requireCourierOffice());
  } catch (error) {
    return fail((error as Error).message);
  }

  const userId = String(formData.get("userId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const previousEmail = String(formData.get("previousEmail") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim() || null;

  if (!userId) return fail("Missing user.");
  if (!email) return fail("Email is required.");

  const changes: string[] = [];

  if (email !== previousEmail) {
    // email_confirm so the new address is trusted immediately -- without it the
    // account is left needing a confirmation click that depends on outbound
    // SMTP, which this project deliberately does not rely on (see inviteUser).
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });
    if (error) return fail(error.message);
    changes.push(`email changed to ${email}`);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId);
  if (profileError) return fail(profileError.message);

  revalidatePath("/users");
  return {
    error: null,
    success: changes.length ? `Saved — ${changes.join(", ")}.` : "Saved.",
  };
}

export type DeleteUserState = { error: string | null };

/**
 * Delete a user outright. profiles and user_publication_access both cascade
 * from auth.users, so removing the auth account takes their access with it.
 *
 * Returns state rather than throwing so a failure renders inline on the row
 * instead of replacing the whole page with the error boundary.
 */
export async function deleteUser(
  _prevState: DeleteUserState,
  formData: FormData,
): Promise<DeleteUserState> {
  let user;
  try {
    ({ user } = await requireCourierOffice());
  } catch (error) {
    return { error: (error as Error).message };
  }

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Missing user." };

  // Refusing self-deletion is also what keeps at least one courier office
  // account alive: whoever is doing the deleting necessarily survives it, so
  // this page can never be orphaned.
  if (userId === user.id) {
    return { error: "You can't delete your own account." };
  }

  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath("/users");
  return { error: null };
}
