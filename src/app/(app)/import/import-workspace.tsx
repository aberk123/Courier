"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { PlanRow } from "@/lib/import/match";
import {
  applyImport,
  planImport,
  undoImport,
  type ApplyState,
  type PlanState,
  type UndoState,
} from "./actions";

type Zone = { id: string; number: number; label: string };
type Publication = { id: string; code: string; name: string };
type ImportRun = {
  id: string;
  createdAt: string;
  fileName: string | null;
  appliedCount: number;
  undoneAt: string | null;
  publicationName: string | null;
};

const initialPlanState: PlanState = { error: null, rows: null, fileName: null, summary: null };
const initialApplyState: ApplyState = { error: null, applied: null, skipped: null };
const initialUndoState: UndoState = { error: null, message: null };

const ACTION_LABEL: Record<PlanRow["action"], string> = {
  add: "Add",
  remove: "Remove",
  change: "Change",
  unknown: "?",
};

// Mirrors the server-side check in actions.ts, and next.config.ts raises the
// Server Action body limit above it. Checked here too because the framework
// rejects an oversized body before the action runs, which surfaces as a bare
// 500 with nothing rendered -- the office would just see the button do nothing.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function ImportWorkspace({
  zones,
  publications,
  runs,
}: {
  zones: Zone[];
  publications: Publication[];
  runs: ImportRun[];
}) {
  const [planState, planAction, planPending] = useActionState(planImport, initialPlanState);
  const [applyState, applyAction, applyPending] = useActionState(applyImport, initialApplyState);
  const [undoState, undoAction, undoPending] = useActionState(undoImport, initialUndoState);

  const [rows, setRows] = useState<PlanRow[]>([]);
  // A publication's roster covers the whole town while we hold five routes, so
  // most of any upload is addresses we simply do not deliver to -- 19,191 of
  // 19,625 on the real Voice file. Showing them all buried the 434 rows that
  // actually needed the office under thousands that needed nothing, which made
  // correct behaviour look like broken behaviour. Default to the rows that need
  // a person; the rest are one click away.
  const [showSettled, setShowSettled] = useState(false);
  // Remembered from the upload form so the apply can record which publication
  // the run was for.
  const [rosterPublicationId, setRosterPublicationId] = useState("");
  const [excluded, setExcluded] = useState<number[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

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
  // "Settled" = nothing for the office to do: an address we do not deliver to,
  // or one that already has the publication. Correct outcomes, but noise.
  const settled = (row: PlanRow) => row.status === "blocked" || row.status === "no_change";
  const visibleRows = useMemo(
    () => (showSettled ? rows : rows.filter((row) => !settled(row))),
    [rows, showSettled],
  );
  const readyCount = included.filter((row) => row.status === "ready").length;
  // Serialised once per change rather than once per render. Unmemoised this ran
  // on every keystroke and every checkbox tick, and React then rewrote the whole
  // string onto the DOM node each time.
  const planJson = useMemo(() => JSON.stringify(included), [included]);
  // From the server's summary: the browser is only sent actionable rows plus a
  // small sample, so counting what is on screen would understate the file.
  const summary = planState.summary;
  const choiceCount = summary?.needsChoice ?? 0;
  const noChangeCount = summary?.noChange ?? 0;
  const blockedCount = summary?.blocked ?? 0;
  const unreadableCount = summary?.unreadable ?? 0;

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

      {/* Every applied import can be taken back. Shown before the upload form
          rather than after the results, because the moment you need it is when
          you have just realised the last run was wrong. */}
      {runs.length ? (
        <section className="mt-5 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <h2 className="text-sm font-medium">Recent imports</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {runs.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-2 text-sm last:border-b-0 last:pb-0 dark:border-white/10"
              >
                <span>
                  <span className="font-medium">{run.fileName ?? "Untitled file"}</span>
                  {run.publicationName ? (
                    <span className="text-black/60 dark:text-white/60"> · {run.publicationName}</span>
                  ) : null}
                  <span className="text-black/60 dark:text-white/60">
                    {" · "}
                    {run.appliedCount} change{run.appliedCount === 1 ? "" : "s"}
                    {" · "}
                    {new Date(run.createdAt).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "America/New_York",
                    })}
                  </span>
                </span>
                {run.undoneAt ? (
                  <span className="text-xs text-black/50 dark:text-white/50">
                    Undone{" "}
                    {new Date(run.undoneAt).toLocaleDateString("en-US", {
                      dateStyle: "medium",
                      timeZone: "America/New_York",
                    } as Intl.DateTimeFormatOptions)}
                  </span>
                ) : (
                  <form action={undoAction}>
                    <input type="hidden" name="runId" value={run.id} />
                    <button
                      type="submit"
                      disabled={undoPending}
                      className="rounded-lg border border-black/20 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/25"
                    >
                      {undoPending ? "Undoing…" : "Undo this import"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {undoState.error ? (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {undoState.error}
            </p>
          ) : null}
          {undoState.message ? (
            <p className="mt-3 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/15">
              {undoState.message}
            </p>
          ) : null}
        </section>
      ) : null}

      <form
        action={planAction}
        className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-black/10 p-4 dark:border-white/10"
      >
        <input
          type="file"
          name="file"
          accept=".csv,.txt,.xlsx,.xlsm"
          required
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setFileError(
              file && file.size > MAX_FILE_BYTES
                ? `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the 5 MB limit. Split it into two files and import them one after the other.`
                : null,
            );
          }}
          // The native "Choose file" control renders as bare text, which Ari
          // reported does not read as something you can click. The file:
          // modifiers style the browser's own button, so it stays a real file
          // input -- keyboard and screen-reader behaviour unchanged -- while
          // looking like the secondary button it is. Deliberately outlined
          // rather than filled, so "Review file" stays the primary action.
          className="text-sm text-black/60 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-black/20 file:bg-black/[.04] file:px-4 file:py-2 file:text-sm file:font-medium file:text-black hover:file:bg-black/[.08] dark:text-white/60 dark:file:border-white/25 dark:file:bg-white/10 dark:file:text-white dark:hover:file:bg-white/20"
        />
        {/*
          A publication's own export is a plain roster: no action column and no
          publication column, so neither can be read off the row. Picking one
          here turns the whole file into "these addresses should be getting this
          publication". Left blank, the file must carry its own columns.
        */}
        <label className="flex items-center gap-2 text-sm text-black/70 dark:text-white/70">
          <span className="whitespace-nowrap">Whole file is a list for</span>
          <select
            name="rosterPublication"
            value={rosterPublicationId}
            onChange={(event) => setRosterPublicationId(event.currentTarget.value)}
            className="rounded-lg border border-black/20 bg-transparent px-2 py-1.5 text-sm dark:border-white/25"
          >
            <option value="">— the file says which —</option>
            {publications.map((pub) => (
              <option key={pub.id} value={pub.id}>
                {pub.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={planPending || Boolean(fileError)}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {planPending ? "Reading…" : "Review file"}
        </button>
        {fileError ? (
          <p className="w-full rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {fileError}
          </p>
        ) : null}
        <p className="w-full text-xs text-black/60 dark:text-white/60">
          CSV, .xlsx or .xlsm, up to 5 MB. Columns: action, name, house number, street,
          publication, floor/side, instructions — header names are matched loosely, and a
          whole address in one cell is split for you. For a publication&rsquo;s own list, which
          has none of those columns, pick the publication above instead. Nothing is removed
          from a list on the strength of an address being missing from it.
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
              {(summary?.total ?? rows.length).toLocaleString()} rows · {readyCount} to apply
              {choiceCount ? ` · ${choiceCount} need a choice` : ""}
              {unreadableCount ? ` · ${unreadableCount} we could not read` : ""}
            </span>
          </div>

          {/* The counts that need nothing doing live here rather than in the line
              above, so they do not compete with the ones that need the office.
              "Already correct" stays visible because it is the tripwire: while
              the importer was silently reading 1,000 of 2,427 addresses it read
              392 instead of 881, and nothing else on the screen looked wrong. */}
          {blockedCount || noChangeCount || unreadableCount ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-black/55 dark:text-white/55">
              <span>
                {noChangeCount ? (
                  <>
                    {noChangeCount.toLocaleString()} already have this publication and need nothing
                    doing.{" "}
                  </>
                ) : null}
                {blockedCount ? (
                  <>
                    {blockedCount.toLocaleString()} are on streets outside your five routes — the
                    list covers all of Lakewood and you hold five of about thirty rounds.{" "}
                  </>
                ) : null}
                {unreadableCount ? (
                  <>
                    {unreadableCount} have an address this importer cannot read — a house number at
                    the end rather than the start, or none at all. Those are worth fixing in the
                    master list; they are counted separately above because unlike the rest, they
                    are not a fact about geography.
                  </>
                ) : null}
              </span>
              {summary?.sampled ? (
                <button
                  type="button"
                  onClick={() => setShowSettled((current) => !current)}
                  className="underline underline-offset-2"
                >
                  {showSettled
                    ? "Hide the examples"
                    : `Show ${summary.sampled} examples`}
                </button>
              ) : null}
            </p>
          ) : null}

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
                {visibleRows.map((row) => {
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

                        {/* A row that needs a choice must always offer one. It
                            used to render this only for two or more candidates,
                            so the 28 rows reading "the street is spelled
                            differently" showed an amber "Needs a choice", no
                            dropdown, and a disabled checkbox -- a dead end the
                            office could only scroll past. A single candidate is
                            still a decision: is this our street or not? */}
                        {row.candidates.length > 1 ||
                        (row.candidates.length > 0 &&
                          (row.newStop || row.status === "needs_choice")) ? (
                          <select
                            value={
                              row.status === "needs_choice"
                                ? ""
                                : (row.stopId ?? "new")
                            }
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
            <input type="hidden" name="plan" value={planJson} />
            {/* Carried through so the run is identifiable on the undo list --
                "roster.xlsm · The Voice · 111 changes" rather than a bare id. */}
            <input type="hidden" name="fileName" value={planState.fileName ?? ""} />
            <input type="hidden" name="rosterPublication" value={rosterPublicationId} />
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
    no_change: "border-black/15 text-black/45 dark:border-white/20 dark:text-white/45",
    blocked: "border-black/20 text-black/50 dark:border-white/25 dark:text-white/50",
  };
  const label: Record<PlanRow["status"], string> = {
    ready: "Ready",
    needs_choice: "Needs a choice",
    no_change: "Already correct",
    blocked: "Not on our routes",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {label[status]}
    </span>
  );
}
