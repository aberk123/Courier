"use client";

import { useMemo, useState } from "react";
import {
  createStop,
  deactivateStop,
  logComplaint,
  togglePublication,
  updateInstructions,
} from "./actions";

export type StopWithPublications = {
  id: string;
  recipientName: string | null;
  houseNumber: string;
  street: string;
  floorSide: string | null;
  specialInstructions: string | null;
  publicationIds: string[];
};

type Publication = { id: string; code: string; name: string };

function matches(stop: StopWithPublications, query: string) {
  if (!query) return true;
  const haystack = `${stop.recipientName ?? ""} ${stop.houseNumber} ${stop.street}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function ZoneWorkspace({
  zoneId,
  zoneNumber,
  zoneName,
  publications,
  initialStops,
}: {
  zoneId: string;
  zoneNumber: number;
  zoneName: string | null;
  publications: Publication[];
  initialStops: StopWithPublications[];
}) {
  const [query, setQuery] = useState("");
  const [openStopId, setOpenStopId] = useState<string | null>(null);
  const [addingStop, setAddingStop] = useState(false);

  const filtered = useMemo(
    () => initialStops.filter((stop) => matches(stop, query)),
    [initialStops, query],
  );

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <h1 className="text-2xl font-semibold">{zoneName ?? `Zone ${zoneNumber}`}</h1>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name or address…"
        autoFocus
        className="mt-4 w-full rounded-lg border border-black/15 px-4 py-3 text-base dark:border-white/20 dark:bg-black"
      />

      <button
        type="button"
        onClick={() => setAddingStop((value) => !value)}
        className="mt-3 w-full rounded-lg border border-black/15 px-4 py-3 text-base font-medium dark:border-white/20 sm:w-auto"
      >
        {addingStop ? "Cancel" : "+ Add address"}
      </button>

      {addingStop ? (
        <form
          action={async (formData) => {
            await createStop(formData);
            setAddingStop(false);
          }}
          className="mt-3 space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10"
        >
          <input type="hidden" name="zoneId" value={zoneId} />
          <input type="hidden" name="zoneNumber" value={zoneNumber} />
          <div className="grid grid-cols-2 gap-3">
            <input
              name="recipientName"
              placeholder="Name (optional)"
              className="col-span-2 rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-black"
            />
            <input
              name="houseNumber"
              placeholder="House #"
              required
              className="rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-black"
            />
            <input
              name="street"
              placeholder="Street"
              required
              className="rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-black"
            />
            <select
              name="floorSide"
              defaultValue=""
              className="rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-black"
            >
              <option value="">Floor / side (optional)</option>
              <option value="upstairs">Upstairs</option>
              <option value="basement">Basement</option>
            </select>
            <input
              name="specialInstructions"
              placeholder="Special instructions (optional)"
              className="rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-black"
            />
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-medium">Publications delivered here</legend>
            <div className="flex flex-wrap gap-2">
              {publications.map((pub) => (
                <label
                  key={pub.id}
                  className="flex items-center gap-2 rounded-full border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
                >
                  <input type="checkbox" name="publicationIds" value={pub.id} />
                  {pub.name}
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            className="rounded-lg bg-black px-4 py-2 font-medium text-white dark:bg-white dark:text-black"
          >
            Save address
          </button>
        </form>
      ) : null}

      <ul className="mt-4 divide-y divide-black/10 dark:divide-white/10">
        {filtered.map((stop) => (
          <li key={stop.id} className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {stop.houseNumber} {stop.street}
                  {stop.floorSide ? (
                    <span className="ml-2 text-sm font-normal text-black/60 dark:text-white/60">
                      {stop.floorSide}
                    </span>
                  ) : null}
                </p>
                {stop.recipientName ? (
                  <p className="text-sm text-black/60 dark:text-white/60">{stop.recipientName}</p>
                ) : null}
                {stop.specialInstructions ? (
                  <p className="mt-1 text-sm italic text-black/70 dark:text-white/70">
                    {stop.specialInstructions}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpenStopId(openStopId === stop.id ? null : stop.id)}
                className="shrink-0 rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
              >
                {openStopId === stop.id ? "Close" : "Manage"}
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {publications.map((pub) => {
                const on = stop.publicationIds.includes(pub.id);
                return (
                  <form key={pub.id} action={togglePublication}>
                    <input type="hidden" name="stopId" value={stop.id} />
                    <input type="hidden" name="publicationId" value={pub.id} />
                    <input type="hidden" name="zoneNumber" value={zoneNumber} />
                    <input type="hidden" name="eventType" value={on ? "removed" : "added"} />
                    <button
                      type="submit"
                      className={
                        "rounded-full border px-3 py-1 text-xs font-medium " +
                        (on
                          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                          : "border-black/20 text-black/50 dark:border-white/25 dark:text-white/50")
                      }
                    >
                      {pub.name}
                    </button>
                  </form>
                );
              })}
            </div>

            {openStopId === stop.id ? (
              <div className="mt-3 space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
                <form action={updateInstructions} className="flex gap-2">
                  <input type="hidden" name="stopId" value={stop.id} />
                  <input type="hidden" name="zoneNumber" value={zoneNumber} />
                  <input
                    type="hidden"
                    name="previousInstructions"
                    value={stop.specialInstructions ?? ""}
                  />
                  <input
                    name="specialInstructions"
                    defaultValue={stop.specialInstructions ?? ""}
                    placeholder="Special instructions"
                    className="flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium dark:border-white/20"
                  >
                    Save
                  </button>
                </form>

                <form action={logComplaint} className="flex gap-2">
                  <input type="hidden" name="stopId" value={stop.id} />
                  <input type="hidden" name="zoneNumber" value={zoneNumber} />
                  <input
                    name="description"
                    required
                    placeholder="Log a complaint about this address"
                    className="flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium dark:border-white/20"
                  >
                    Log
                  </button>
                </form>

                <form action={deactivateStop}>
                  <input type="hidden" name="stopId" value={stop.id} />
                  <input type="hidden" name="zoneNumber" value={zoneNumber} />
                  <button
                    type="submit"
                    className="text-sm text-red-600 underline underline-offset-2 dark:text-red-400"
                  >
                    Remove this address
                  </button>
                </form>
              </div>
            ) : null}
          </li>
        ))}

        {!filtered.length ? (
          <li className="py-8 text-center text-black/50 dark:text-white/50">
            {initialStops.length ? "No addresses match your search." : "No addresses in this zone yet."}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
