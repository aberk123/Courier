import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UsersWorkspace, type ManagedUser } from "./users-workspace";

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("is_courier_office")
    .eq("id", user.id)
    .single();
  if (!myProfile?.is_courier_office) redirect("/");

  const [{ data: profiles }, { data: publications }, { data: access }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, is_courier_office, created_at").order("created_at"),
    supabase.from("publications").select("id, code, name").eq("active", true).order("name"),
    supabase.from("user_publication_access").select("user_id, publication_id"),
  ]);

  const admin = createAdminClient();
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(authUsers?.users.map((u) => [u.id, u.email ?? ""]));

  const usersForClient: ManagedUser[] = (profiles ?? []).map((profile) => ({
    id: profile.id,
    email: emailById.get(profile.id) ?? "(unknown)",
    fullName: profile.full_name,
    isCourierOffice: profile.is_courier_office,
    publicationIds: (access ?? [])
      .filter((row) => row.user_id === profile.id)
      .map((row) => row.publication_id),
  }));

  return (
    <UsersWorkspace
      currentUserId={user.id}
      users={usersForClient}
      publications={publications ?? []}
    />
  );
}
