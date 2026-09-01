import type { ExistingStop, PlanRow, QuestionKind } from "./match.ts";
import { hashKey, normalizeHouseNumber, normalizeStreet } from "./match.ts";

/**
 * Turns a plan's open questions into rows for the import_questions table --
 * the standing-questions portal (Ari, 2026-09-01: "I want to send the
 * questions to the Voice office so they can answer them and the answers get
 * recorded so that the questions don't come up again").
 *
 * Everything here is a RECORDED FACT for a person to read; nothing in it is
 * ever applied to the list. The full design record is in docs/domain-notes.md.
 */

/** Who can settle a question of this kind. Ari's split, 2026-09-01: questions
 * about the master list go to the Voice office (they maintain that list);
 * questions about the routes go to Amrom. The courier office keeps the ones
 * that are answered by picking an address at import time. */
const AUDIENCE: Record<QuestionKind, "voice_office" | "courier_office" | "amrom"> = {
  out_of_stretch: "voice_office",
  street_identity: "voice_office",
  unit_letter: "voice_office",
  count_vs_capacity: "voice_office",
  no_current_delivery: "voice_office",
  crowded_address: "voice_office",
  door_conflict: "voice_office",
  unreadable_cell: "voice_office",
  gap_between_blocks: "amrom",
  route_position: "amrom",
  street_spans_zones: "amrom",
  near_miss_named: "courier_office",
  pick_line: "courier_office",
};

export type QuestionUpsert = {
  publicationId: string;
  kind: QuestionKind;
  street: string;
  houseNumber: string | null;
  questionKey: string;
  prompt: string;
  evidence: {
    /** The master list's own rows behind this question -- its data, so its
     * names are fine to show its own office. */
    fileRows: { summary: string; floorSide: string | null }[];
    /** Our lines at the address. NEVER recipient names, NEVER letters of other
     * publications, NEVER special_instructions (they name other publications).
     * A line that does not carry THIS question's publication appears only in
     * the withheld count: RLS hides such stops from a scoped user, and this
     * table must not become a way around that. */
    candidates: { houseNumber: string; street: string; floorSide: string | null }[];
    otherLinesWithheld: number;
  };
  fingerprint: string;
  audience: "voice_office" | "courier_office" | "amrom";
};

/**
 * One question per (kind, address): several file rows at one address share one
 * key on purpose -- the office settles the address once. The first row's prompt
 * speaks for the group; every row's file data lands in the evidence.
 *
 * The fingerprint hashes the prompt and the sanitized evidence -- the volatile
 * facts (counts, ranges, doors, candidate lines). Same facts next week leaves
 * an answered question answered; changed facts reopen it. A wording change in
 * the code also reopens answered questions -- accepted and documented, the
 * answer itself stays attached and visible.
 */
export function buildQuestions(
  rows: PlanRow[],
  publicationId: string,
  existing: ExistingStop[],
): QuestionUpsert[] {
  const byId = new Map(existing.map((stop) => [stop.id, stop]));
  const out = new Map<string, QuestionUpsert>();

  for (const row of rows) {
    if (!row.questionKind || !row.questionKey) continue;
    if (row.status !== "needs_choice" && !row.unreadable) continue;

    let question = out.get(row.questionKey);
    if (!question) {
      const candidates: QuestionUpsert["evidence"]["candidates"] = [];
      let withheld = 0;
      for (const candidate of row.candidates) {
        const stop = byId.get(candidate.stopId);
        if (!stop) continue;
        if (stop.publicationIds.includes(publicationId)) {
          candidates.push({
            houseNumber: stop.houseNumber,
            street: stop.street,
            floorSide: stop.floorSide,
          });
        } else {
          withheld += 1;
        }
      }
      question = {
        publicationId,
        kind: row.questionKind,
        street: normalizeStreet(row.street),
        houseNumber: row.unreadable ? null : normalizeHouseNumber(row.houseNumber),
        questionKey: row.questionKey,
        prompt: row.message,
        evidence: { fileRows: [], candidates, otherLinesWithheld: withheld },
        fingerprint: "",
        audience: AUDIENCE[row.questionKind],
      };
      out.set(row.questionKey, question);
    }
    question.evidence.fileRows.push({ summary: row.summary, floorSide: row.floorSide });
  }

  for (const question of out.values()) {
    question.fingerprint = hashKey(question.prompt + JSON.stringify(question.evidence));
  }
  return [...out.values()];
}
