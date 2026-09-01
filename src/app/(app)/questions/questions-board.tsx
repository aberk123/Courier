"use client";

import { useActionState, useState } from "react";
import { answerQuestion, deleteQuestion, type AnswerState } from "./actions";

export type QuestionRow = {
  id: string;
  publication_id: string;
  kind: string;
  street: string;
  house_number: string | null;
  prompt: string;
  evidence: {
    fileRows?: { summary: string; floorSide: string | null }[];
    candidates?: { houseNumber: string; street: string; floorSide: string | null }[];
    otherLinesWithheld?: number;
  } | null;
  audience: "voice_office" | "courier_office" | "amrom";
  status: "open" | "answered" | "superseded";
  answer: { choice?: string; note?: string | null } | null;
  answered_at: string | null;
  last_seen_plan_at: string;
};

/**
 * The answers offered per question kind. Every answer is a recorded fact —
 * what to DO about it stays with the courier office at import time. Kinds not
 * listed fall back to the generic pair, so a new kind degrades to "answer in
 * the note" rather than an unanswerable card.
 */
const CHOICES: Record<string, { value: string; label: string }[]> = {
  out_of_stretch: [
    { value: "pass_to_amrom", label: "The address is correct — pass to the Lakewood Courier to place" },
    { value: "typo_will_fix", label: "A mistake in our list — we will correct it" },
    { value: "not_a_subscriber", label: "Not a live subscription" },
  ],
  near_miss_street: [
    { value: "different_street", label: "It really is that street — not a misspelling" },
    { value: "our_street_misspelled", label: "It is the delivery street misspelled — note which" },
  ],
  street_identity: [
    { value: "file_street_is_ours", label: "Our list's spelling — same street" },
    { value: "different_road", label: "A different road" },
  ],
  unit_letter: [
    { value: "same_door", label: "Same door" },
    { value: "separate_unit", label: "A separate unit — a real second household" },
  ],
  duplicate_lines: [
    { value: "one_paper", label: "Listed twice — one paper" },
    { value: "two_papers", label: "Two real subscriptions — two papers" },
  ],
  unreadable_cell: [{ value: "fixed_in_master_list", label: "Fixed in our system for next week's list" }],
};

const GENERIC_CHOICES = [{ value: "checked_see_note", label: "Checked — the answer is in the note" }];

const AUDIENCE_LABEL: Record<QuestionRow["audience"], string> = {
  voice_office: "For the publication's office",
  courier_office: "For the courier office",
  amrom: "For the Lakewood Courier (routes)",
};

function QuestionCard({
  question,
  publicationName,
  isCourierOffice,
}: {
  question: QuestionRow;
  publicationName: string;
  isCourierOffice: boolean;
}) {
  const [state, action, pending] = useActionState<AnswerState, FormData>(answerQuestion, {
    error: null,
    answered: null,
  });
  const [deleteState, deleteAction] = useActionState<AnswerState, FormData>(deleteQuestion, {
    error: null,
    answered: null,
  });
  const [choice, setChoice] = useState("");
  const evidence = question.evidence ?? {};
  const canAnswer =
    question.status === "open" && (isCourierOffice || question.audience === "voice_office");
  const choices = [
    ...(CHOICES[question.kind] ?? GENERIC_CHOICES),
    // Passing a question on is always available and is not an answer: the
    // question stays open, addressed to the Lakewood Courier instead.
    ...(question.audience === "amrom" ? [] : [{ value: "pass_to_amrom", label: "This is a route question — pass to the Lakewood Courier" }]),
  ];

  return (
    <li className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {question.house_number ? `${question.house_number} ` : ""}
          {question.street.toUpperCase()}
        </span>
        <span className="text-xs text-black/50 dark:text-white/50">{publicationName}</span>
      </div>
      <p className="mt-1 text-sm">{question.prompt}</p>

      {evidence.fileRows?.length ? (
        <p className="mt-2 text-xs text-black/60 dark:text-white/60">
          On the master list: {evidence.fileRows.map((row) => row.summary).join(" · ")}
        </p>
      ) : null}
      {evidence.candidates?.length ? (
        <p className="mt-1 text-xs text-black/60 dark:text-white/60">
          We deliver to:{" "}
          {evidence.candidates
            .map((c) => `${c.houseNumber} ${c.street}${c.floorSide ? ` (${c.floorSide})` : ""}`)
            .join(" · ")}
          {evidence.otherLinesWithheld
            ? ` · plus ${evidence.otherLinesWithheld} line(s) for other publications`
            : ""}
        </p>
      ) : evidence.otherLinesWithheld ? (
        <p className="mt-1 text-xs text-black/60 dark:text-white/60">
          We deliver {evidence.otherLinesWithheld} line(s) at this address for other publications.
        </p>
      ) : null}

      {question.status === "answered" && question.answer ? (
        <p className="mt-2 rounded-lg bg-emerald-600/10 px-2 py-1 text-sm text-emerald-800 dark:text-emerald-300">
          Answered: {question.answer.choice}
          {question.answer.note ? ` — ${question.answer.note}` : ""}
        </p>
      ) : null}
      {question.status === "open" && question.answer?.choice === "pass_to_amrom" && question.answer.note ? (
        <p className="mt-2 text-xs text-black/60 dark:text-white/60">
          Passed on with a note: {question.answer.note}
        </p>
      ) : null}

      {canAnswer ? (
        <form action={action} className="mt-3 flex flex-col gap-2 text-sm">
          <input type="hidden" name="questionId" value={question.id} />
          {choices.map((option) => (
            <label key={option.value} className="flex items-start gap-2">
              <input
                type="radio"
                name="choice"
                value={option.value}
                checked={choice === option.value}
                onChange={() => setChoice(option.value)}
                className="mt-1"
              />
              <span>{option.label}</span>
            </label>
          ))}
          <textarea
            name="note"
            rows={2}
            placeholder="Anything the courier office should know (optional)"
            className="rounded-lg border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-black"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending || !choice}
              className="w-fit rounded-lg border border-black/15 px-3 py-1 hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
            >
              Record answer
            </button>
            {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
          </div>
        </form>
      ) : null}

      {isCourierOffice ? (
        <form action={deleteAction} className="mt-2">
          <input type="hidden" name="questionId" value={question.id} />
          <button type="submit" className="text-xs text-black/40 underline underline-offset-2 dark:text-white/40">
            remove this question
          </button>
          {deleteState.error ? <span className="ml-2 text-xs text-red-600">{deleteState.error}</span> : null}
        </form>
      ) : null}
    </li>
  );
}

export function QuestionsBoard({
  questions,
  publicationNames,
  isCourierOffice,
}: {
  questions: QuestionRow[];
  publicationNames: Record<string, string>;
  isCourierOffice: boolean;
}) {
  const open = questions.filter((q) => q.status === "open");
  const answered = questions.filter((q) => q.status === "answered");
  const audiences: QuestionRow["audience"][] = ["voice_office", "amrom", "courier_office"];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold">Standing questions</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Questions the weekly list raised that a person has to settle. An answer here is recorded and
        remembered — the same question is not asked again unless the facts change. Nothing on this
        page changes any delivery; the courier office applies changes on the import screen.
      </p>

      {open.length === 0 ? (
        <p className="mt-6 rounded-xl border border-black/10 p-4 text-sm text-black/60 dark:border-white/10 dark:text-white/60">
          No open questions. Upload a weekly list on the Import screen to refresh them.
        </p>
      ) : null}

      {audiences.map((audience) => {
        const section = open.filter((q) => q.audience === audience);
        if (!section.length) return null;
        return (
          <section key={audience} className="mt-8">
            <h2 className="text-base font-semibold">
              {AUDIENCE_LABEL[audience]}
              <span className="ml-2 text-sm font-normal text-black/50 dark:text-white/50">
                {section.length}
              </span>
            </h2>
            {audience === "amrom" && isCourierOffice ? (
              <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                Route questions are answered by phone with the Lakewood Courier —{" "}
                <a href="/questions/amrom" className="underline underline-offset-2">
                  open the printable list
                </a>
                .
              </p>
            ) : null}
            <ul className="mt-3 flex flex-col gap-3">
              {section.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  publicationName={publicationNames[question.publication_id] ?? ""}
                  isCourierOffice={isCourierOffice}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {answered.length ? (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm text-black/60 dark:text-white/60">
            {answered.length} answered — kept until the next applied list retires them
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {answered.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                publicationName={publicationNames[question.publication_id] ?? ""}
                isCourierOffice={isCourierOffice}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
