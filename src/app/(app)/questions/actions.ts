"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AnswerState = { error: string | null; answered: string | null };

/**
 * Records an answer to a standing question. The answer is a FACT for the
 * courier office to act on — nothing here writes to the address list. All the
 * real checks live in the answer_import_question function itself (who may
 * answer what, only open questions, pass-to-Amrom retags instead of closing),
 * so a stale or hostile client cannot do more than this function allows.
 */
export async function answerQuestion(_prev: AnswerState, formData: FormData): Promise<AnswerState> {
  const questionId = String(formData.get("questionId") ?? "");
  const choice = String(formData.get("choice") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!questionId || !choice) {
    return { error: "Pick an answer first.", answered: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_import_question", {
    p_question_id: questionId,
    p_choice: choice,
    p_note: note || null,
  });
  if (error) {
    return { error: error.message, answered: null };
  }

  revalidatePath("/questions");
  return { error: null, answered: questionId };
}

/**
 * Courier office only (enforced by RLS — the delete policy). Removing a
 * question is for strays a junk upload created; a real question re-arises at
 * the next upload anyway.
 */
export async function deleteQuestion(_prev: AnswerState, formData: FormData): Promise<AnswerState> {
  const questionId = String(formData.get("questionId") ?? "");
  if (!questionId) return { error: "Nothing to remove.", answered: null };

  const supabase = await createClient();
  // .select() so RLS silently deleting nothing is visible: without it a scoped
  // user's click reported success while the question stayed put.
  const { data, error } = await supabase
    .from("import_questions")
    .delete()
    .eq("id", questionId)
    .select("id");
  if (error) return { error: error.message, answered: null };
  if (!data?.length) return { error: "Only the courier office can remove a question.", answered: null };

  revalidatePath("/questions");
  return { error: null, answered: questionId };
}
