import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/fetch-all";
import { QuestionsBoard, type QuestionRow } from "./questions-board";

/**
 * The standing-questions portal. Questions the weekly import raises live here
 * so they can be answered OUTSIDE the import cycle — by the publication's own
 * office for master-list questions, with the route questions collected for
 * Amrom. Answers are recorded facts; nothing on this page writes to the
 * address list.
 *
 * Deliberately open to publication-scoped staff: RLS shows them only their own
 * publication's questions, and answer_import_question() is their only write
 * path. The courier office sees everything.
 */
export default async function QuestionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: publications }, questions] = await Promise.all([
    supabase.from("profiles").select("is_courier_office").eq("id", user.id).single(),
    supabase.from("publications").select("id, name").order("name"),
    // Paged as a matter of policy: PostgREST's silent 1,000-row cap is exactly
    // how "the office sees the first 1,000 questions" would ship unnoticed.
    fetchAllPages("questions", (from, to) =>
      supabase
        .from("import_questions")
        .select(
          "id, publication_id, kind, street, house_number, prompt, evidence, audience, status, answer, answered_at, last_seen_plan_at",
          { count: "exact" },
        )
        .order("street")
        .order("house_number")
        .order("id")
        .range(from, to),
    ),
  ]);

  const publicationNames = Object.fromEntries((publications ?? []).map((p) => [p.id, p.name]));

  return (
    <QuestionsBoard
      questions={questions as QuestionRow[]}
      publicationNames={publicationNames}
      isCourierOffice={Boolean(profile?.is_courier_office)}
    />
  );
}
