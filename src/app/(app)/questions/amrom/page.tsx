import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/fetch-all";

/**
 * The printable route-questions list for Amrom. He has no login and works by
 * phone and paper, so this page is the whole "portal": the office prints it or
 * reads it down the phone, and records his answers on /questions (or as route
 * edits) as the courier office. Courier office only — it is the office's job
 * to run this conversation, and the page carries route detail beyond a scoped
 * staffer's publication.
 */
export default async function AmromQuestionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_courier_office")
    .eq("id", user.id)
    .single();
  if (!profile?.is_courier_office) redirect("/");

  const [questions, { data: publications }] = await Promise.all([
    fetchAllPages("route questions", (from, to) =>
      supabase
        .from("import_questions")
        .select("id, publication_id, street, house_number, prompt, answer", { count: "exact" })
        .eq("audience", "amrom")
        .eq("status", "open")
        .order("street")
        .order("house_number")
        .range(from, to),
    ),
    supabase.from("publications").select("id, name"),
  ]);
  const names = Object.fromEntries((publications ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 print:max-w-none print:px-0">
      <div className="flex items-baseline justify-between print:hidden">
        <h1 className="text-xl font-semibold">Route questions for the Lakewood Courier</h1>
        <a href="/questions" className="text-sm underline underline-offset-2">
          back to all questions
        </a>
      </div>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60 print:hidden">
        Print this page (Ctrl/Cmd-P) or read it down the phone. Record what Amrom says on the
        questions page, and place confirmed addresses through the route screens.
      </p>
      <h1 className="hidden text-lg font-semibold print:block">
        Route questions — The Lakewood Courier · {new Date().toLocaleDateString("en-US")}
      </h1>

      {questions.length === 0 ? (
        <p className="mt-6 text-sm text-black/60 dark:text-white/60">No open route questions.</p>
      ) : (
        <ol className="mt-6 flex list-decimal flex-col gap-3 pl-6 text-sm">
          {questions.map((q) => (
            <li key={q.id}>
              <span className="font-medium">
                {q.house_number ? `${q.house_number} ` : ""}
                {q.street.toUpperCase()}
              </span>{" "}
              <span className="text-black/50 dark:text-white/50">({names[q.publication_id] ?? ""})</span>
              <br />
              {q.prompt}
              {(q.answer as { note?: string | null } | null)?.note ? (
                <>
                  <br />
                  <span className="text-black/60 dark:text-white/60">
                    Office note: {(q.answer as { note?: string | null }).note}
                  </span>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
