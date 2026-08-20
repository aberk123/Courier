"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setNewPassword(_prevState: string | null, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (password !== confirmPassword) {
    return "Passwords don't match.";
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Leaked-password protection is on, and its wording ("known to be weak and
    // easy to guess") reads like advice rather than a refusal -- Amrom hit this
    // on 2026-08-20, believed the password had been set, and then could not
    // sign in. Say plainly that nothing was saved and what to do about it.
    if (/weak|easy to guess|known to be/i.test(error.message)) {
      return "That password was not saved: it appears in a list of passwords known to have been leaked, so it is not safe to use. Try a longer one — three or four unrelated words is ideal.";
    }
    return error.message;
  }

  redirect("/");
}
