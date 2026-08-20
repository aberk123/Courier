"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CoverRow } from "@/lib/booklet";
import { markPrinted } from "./actions";

type Publication = { id: string; code: string; name: string };

export function CoverWorkspace({
  zoneId,
  zoneNumber,
  zoneLabel,
  publications,
  sections,
  isCourierOffice,
}: {
  zoneId: string;
  zoneNumber: number;
  zoneLabel: string;
  publications: Publication[];
  sections: { additions: CoverRow[]; deletions: CoverRow[]; changes: CoverRow[]; complaints: CoverRow[] };
  isCourierOffice: boolean;
}) {
  // Starts empty on purpose: the publications in a booklet decide what gets
  // printed AND what "Mark as printed" stamps as delivered, so it has to be a
  // deliberate choice rather than a default the user can print straight past.
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const selectedCodes = useMemo(
    () => publications.filter((pub) => selected.includes(pub.id)).map((pub) => pub.code),
    [publications, selected],
  );

  const selectedNames = useMemo(
    () => publications.filter((pub) => selected.includes(pub.id)).map((pub) => pub.name),
    [publications, selected],
  );

  const allSelected = selected.length === publications.length;
  const pdfHref =
    `/zones/${zoneNumber}/booklet` + (allSelected ? "" : `?pubs=${selectedCodes.join(",")}`);

  const pendingTotal =
    sections.additions.length +
    sections.deletions.length +
    sections.changes.length +
    sections.complaints.length;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{zoneLabel} — cover sheet</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Everything not yet printed for this route. {pendingTotal} pending.
          </p>
        </div>
        <Link
          href={`/zones/${zoneNumber}`}
          className="shrink-0 rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
        >
          Route
        </Link>
      </div>

      <fieldset className="mt-5 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <legend className="px-1 text-sm font-medium">Publications in this booklet</legend>
        <div className="flex flex-wrap gap-2">
          {publications.map((pub) => {
            const on = selected.includes(pub.id);
            return (
              <button
                key={pub.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setSelected((current) =>
                    on ? current.filter((id) => id !== pub.id) : [...current, pub.id],
                  )
                }
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium " +
                  (on
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/20 text-black/50 dark:border-white/25 dark:text-white/50")
                }
              >
                {on ? "✓ " : ""}
                {pub.name}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-black/60 dark:text-white/60">
          A stop appears if it receives at least one selected publication — the courier visits it
          either way.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {selected.length ? (
            <a
              href={pdfHref}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Download booklet PDF
            </a>
          ) : (
            <span className="text-sm text-black/50 dark:text-white/50">
              Select at least one publication.
            </span>
          )}
        </div>
      </fieldset>

      <Section title="Additions" rows={sections.additions} />
      <Section title="Deletions" rows={sections.deletions} />
      <Section title="Changes" rows={sections.changes} />
      <Section title="Complaints" rows={sections.complaints} />

      {isCourierOffice ? (
        <div className="mt-8 rounded-xl border border-black/10 p-4 dark:border-white/10">
          {confirming ? (
            <div className="space-y-3">
              {/* Deliberately not a count: markPrinted stamps additions and
                  deletions only for the selected publications, while changes
                  and complaints are address-level and always stamped. With a
                  partial selection any single number here would overstate what
                  is about to happen. */}
              <p className="text-sm">
                Mark this route&rsquo;s pending items as printed for{" "}
                {allSelected ? "every publication" : selectedNames.join(" + ")}?
                {allSelected
                  ? " "
                  : " Additions and deletions for the other publications stay pending, and changes and complaints apply to the address, so those are marked either way. "}
                Printed items stop appearing on future cover sheets but stay in the record for
                reporting. Do this after the booklet is actually printed.
              </p>
              <div className="flex gap-2">
                <form action={markPrinted}>
                  <input type="hidden" name="zoneId" value={zoneId} />
                  <input type="hidden" name="zoneNumber" value={zoneNumber} />
                  {selected.map((id) => (
                    <input key={id} type="hidden" name="publicationIds" value={id} />
                  ))}
                  <button
                    type="submit"
                    className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
                  >
                    Yes, mark as printed
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/20"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!pendingTotal || !selected.length}
              onClick={() => setConfirming(true)}
              className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/20"
            >
              Mark as printed
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: CoverRow[] }) {
  return (
    <section className="mt-6">
      <h2 className="border-b border-black/15 pb-1 text-sm font-semibold uppercase tracking-wide dark:border-white/20">
        {title} ({rows.length})
      </h2>
      {rows.length ? (
        <ul className="mt-2 divide-y divide-black/10 dark:divide-white/10">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <span className="font-medium">{row.address}</span>
              <span className="text-black/70 dark:text-white/70">{row.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm italic text-black/50 dark:text-white/50">None this week.</p>
      )}
    </section>
  );
}
