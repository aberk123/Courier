"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { PlanRow } from "@/lib/import/match";
import { applyImport, planImport, type ApplyState, type PlanState } from "./actions";

type Zone = { id: string; number: number; label: string };
type Publication = { id: string; code: string; name: string };

const initialPlanState: PlanState = { error: null, rows: null, fileName: null };
const initialApplyState: ApplyState = { error: null, applied: null, skipped: null };

const ACTION_LABEL: Record<PlanRow["action"], string> = {
  add: "Add",
  remove: "Remove",
  change: "Change",
  unknown: "?",
};

export function ImportWorkspace({
  zones,
  publications,
}: {
  zones: Zone[];
  publications: Publication[];
}) {
  const [planState, planAction, planPending] = useActionState(planImport, initialPlanState);
  const [applyState, applyAction, applyPending] = useActionState(applyImport, initialApplyState);

  const [rows, setRows] = useState<PlanRow[]>([]);
  const [excluded, setExcluded] = useState<number[]>([]);

  // Reset the review table during render rather than in an effect: a fresh plan
  // replaces whatever was on screen (including choices made against the
  // previous file), and a completed apply clears it so the same rows cannot be
  // submitted twice.
  const [seenPlan, setSeenPlan] = useState(planState);
  const [seenApply, setSeenApply] = useState(applyState);
  if (seenPlan !== planState || seenApply !== applyState) {
    const planIsNew = seenPlan !== planState;
    setSeenPlan(planState);
    setSeenApply(applyState);
    if (planIsNew) {
      setRows(planState.rows ?? []);
      setExcluded([]);
    } else if (applyState.applied !== null) {
      setRows([]);
      setExcluded([]);
    }
  }

  const included = useMemo(
    () => rows.filter((row) => !excluded.includes(row.rowNumber)),
    [rows, excluded],
  );
  const readyCount = included.filter((row) => row.status === "ready").length;
  const choiceCount = rows.filter((row) => row.status === "needs_choice").length;
  const blockedCount = rows.filter((row) => row.status === "blocked").length;

  function patchRow(rowNumber: number, patch: (row: PlanRow) => PlanRow) {
    setRows((current) =>
      current.map((row) => (row.rowNumber === rowNumber ? patch(row) : row)),
    );
  }

  function chooseTarget(row: PlanRow, value: string) {
    if (value === "") {
      patchRow(row.rowNumber, (r) => ({ ...r, stopId: null, status: "needs_choice" }));
      return;
    }
    if (value === "new") {
      patchRow(row.rowNumber, (r) => ({
        ...r,
        stopId: null,
        status: r.newStop?.zoneId ? "ready" : "needs_choice",
        message: r.newStop?.zoneId
          ? `new address in zone ${r.newStop.zoneNumber}`
          : "pick a zone for this new address",
      }));
      return;
    }
    const candidate = row.candidates.find((c) => c.stopId === value);
    patchRow(row.rowNumber, (r) => ({
      ...r,
      stopId: value,
      status: "ready",
      message: candidate ? `matched ${candidate.label}` : "",
    }));
  }

  function chooseZone(row: PlanRow, zoneId: string) {
    const zone = zones.find((z) => z.id === zoneId);
    patchRow(row.rowNumber, (r) =>
      r.newStop
        ? {
            ...r,
            stopId: null,
            status: zone ? "ready" : "needs_choice",
            message: zone ? `new address in ${zone.label}` : "pick a zone for this new address",
            newStop: {
              ...r.newStop,
              zoneId: zone?.id ?? null,
              zoneNumber: zone?.number ?? null,
            },
          }
        : r,
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Weekly import</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Upload the week&rsquo;s additions, deletions and changes. Nothing is saved until you
            review and confirm.
          </p>
        </div>
        <Link
          href="/import/template"
          className="shrink-0 rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
        >
          Download template
        </Link>
      </div>

      <form
        action={planAction}
        className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-black/10 p-4 dark:border-white/10"
      >
        <input
          type="file"
          name="file"
          accept=".csv,.txt,.xlsx"
          required
          className="text-sm"
        />
        <button
          type="submit"
          disabled={planPending}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {planPending ? "Reading…" : "Review file"}
        </button>
        <p className="w-full text-xs text-black/60 dark:text-white/60">
          CSV or .xlsx, up to 5 MB. Columns: action, name, house number, street, publication,
          floor/side, instructions — header names are matched loosely.
        </p>
      </form>

      {planState.error ? (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {planState.error}
        </p>
      ) : null}

      {applyState.error ? (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {applyState.error}
        </p>
      ) : null}

      {applyState.applied !== null && !applyState.error ? (
        <p className="mt-4 rounded-lg border border-green-600/30 bg-green-600/5 px-3 py-2 text-sm">
          Applied {applyState.applied} change{applyState.applied === 1 ? "" : "s"}
          {applyState.skipped ? `, skipped ${applyState.skipped}` : ""}. They will appear on the
          next cover sheet for their routes.
        </p>
      ) : null}

      {rows.length ? (
        <>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="font-medium">{planState.fileName}</span>
            <span className="text-black/60 dark:text-white/60">
              {rows.length} rows · {readyCount} ready
              {choiceCount ? ` · ${choiceCount} need a choice` : ""}
              {blockedCount ? ` · ${blockedCount} cannot be applied` : ""}
            </span>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/50 dark:border-white/10 dark:text-white/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium">Publication</th>
                  <th className="px-3 py-2 font-medium">What will happen</th>
                  <th className="px-3 py-2 font-medium">Include</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {rows.map((row) => {
                  const isExcluded = excluded.includes(row.rowNumber);
                  const needsZone = Boolean(row.newStop) && !row.stopId && !row.newStop?.zoneId;
                  return (
                    <tr
                      key={row.rowNumber}
                      className={isExcluded ? "opacity-40" : undefined}
                    >
                      <td className="px-3 py-2 align-top tabular-nums text-black/50 dark:text-white/50">
                        {row.rowNumber}
                      </td>
                      <td className="px-3 py-2 align-top font-medium">
                        {ACTION_LABEL[row.action]}
                      </td>
                      <td className="px-3 py-2 align-top">{row.summary}</td>
                      <td className="px-3 py-2 align-top text-black/70 dark:text-white/70">
                        {row.publicationName ?? "—"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <StatusPill status={row.status} />
                        <span className="ml-2">{row.message}</span>

                        {row.candidates.length > 1 ||
                        (row.candidates.length > 0 && row.newStop) ? (
                          <select
                            value={row.stopId ?? (row.status === "needs_choice" ? "" : "new")}
                            onChange={(event) => chooseTarget(row, event.target.value)}
                            className="mt-2 block w-full rounded-lg border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-black"
                          >
                            <option value="">Choose an address…</option>
                            {row.candidates.map((candidate) => (
                              <option key={candidate.stopId} value={candidate.stopId}>
                                {candidate.label}
                              </option>
                            ))}
                            {row.newStop ? (
                              <option value="new">Add as a new address</option>
                            ) : null}
                          </select>
                        ) : null}

                        {needsZone ? (
                          <select
                            value={row.newStop?.zoneId ?? ""}
                            onChange={(event) => chooseZone(row, event.target.value)}
                            className="mt-2 block w-full rounded-lg border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-black"
                          >
                            <option value="">Choose a route…</option>
                            {zones.map((zone) => {
                              // Routes that already cover this street are the
                              // likely answer, so they are called out, but any
                              // route can still be picked.
                              const likely = row.newStop?.zoneCandidates.some(
                                (candidate) => candidate.zoneId === zone.id,
                              );
                              return (
                                <option key={zone.id} value={zone.id}>
                                  {likely ? `${zone.label} — street already here` : zone.label}
                                </option>
                              );
                            })}
                          </select>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          disabled={row.status !== "ready"}
                          onChange={() =>
                            setExcluded((current) =>
                              isExcluded
                                ? current.filter((n) => n !== row.rowNumber)
                                : [...current, row.rowNumber],
                            )
                          }
                          aria-label={`Include row ${row.rowNumber}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form action={applyAction} className="mt-4 flex flex-wrap items-center gap-3">
            <input type="hidden" name="plan" value={JSON.stringify(included)} />
            <button
              type="submit"
              disabled={applyPending || !readyCount}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {applyPending ? "Applying…" : `Apply ${readyCount} change${readyCount === 1 ? "" : "s"}`}
            </button>
            <span className="text-xs text-black/60 dark:text-white/60">
              Rows that still need a choice, or that cannot be applied, are left alone.
            </span>
          </form>
        </>
      ) : null}

      {publications.length ? (
        <p className="mt-8 text-xs text-black/50 dark:text-white/50">
          Publication names recognised in the file: {publications.map((p) => p.name).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: PlanRow["status"] }) {
  const styles: Record<PlanRow["status"], string> = {
    ready: "border-green-600/40 text-green-700 dark:text-green-300",
    needs_choice: "border-amber-500/50 text-amber-700 dark:text-amber-300",
    blocked: "border-black/20 text-black/50 dark:border-white/25 dark:text-white/50",
  };
  const label: Record<PlanRow["status"], string> = {
    ready: "Ready",
    needs_choice: "Needs a choice",
    blocked: "Skipped",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {label[status]}
    </span>
  );
}
