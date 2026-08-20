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

  return supabase;
}

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export type InviteState = { error: string | null; success: string | null };

export async function inviteUser(_prevState: InviteState, formData: FormData): Promise<InviteState> {
  try {
    await requireCourierOffice();
  } catch (error) {
    return { error: (error as Error).message, success: null };
  }

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim() || null;
  const isCourierOffice = formData.get("isCourierOffice") === "on";
  const publicationIds = formData.getAll("publicationIds").map(String);

  if (!email) return { error: "Email is required.", success: null };

  const admin = createAdminClient();
  const origin = await siteOrigin();

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });
  if (inviteError || !invited.user) {
    return { error: inviteError?.message ?? "Failed to invite user.", success: null };
  }

  const supabase = await createClient();

  if (fullName || isCourierOffice) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: fullName, is_courier_office: isCourierOffice })
      .eq("id", invited.user.id);
    if (profileError) return { error: profileError.message, success: null };
  }

  if (publicationIds.length) {
    const { error: accessError } = await supabase
      .from("user_publication_access")
      .insert(publicationIds.map((publicationId) => ({ user_id: invited.user.id, publication_id: publicationId })));
    if (accessError) return { error: accessError.message, success: null };
  }

  revalidatePath("/users");
  return { error: null, success: `Invite sent to ${email}.` };
}

export async function setCourierOffice(formData: FormData) {
  const supabase = await requireCourierOffice();
  const userId = String(formData.get("userId"));
  const value = formData.get("value") === "true";

  const { error } = await supabase.from("profiles").update({ is_courier_office: value }).eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/users");
}

export async function togglePublicationAccess(formData: FormData) {
  const supabase = await requireCourierOffice();
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

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/reset-password` },
  });
  if (error || !data) return { error: error?.message ?? "Failed to generate link.", link: null };

  return { error: null, link: data.properties.action_link };
}
