"use client";

import { useMemo, useState } from "react";
import {
  createStop,
  deactivateStop,
  logComplaint,
  togglePublication,
  updateStopDetails,
} from "./actions";

export type RouteItem =
  | { kind: "direction"; id: string; text: string }
  | {
      kind: "stop";
      id: string;
      stopId: string;
      recipientName: string | null;
      houseNumber: string;
      street: string;
      floorSide: string | null;
      specialInstructions: string | null;
      specialInstructions2: string | null;
      publicationIds: string[];
    };

type Publication = { id: string; code: string; name: string };
type StopItem = Extract<RouteItem, { kind: "stop" }>;

function matches(stop: StopItem, query: string) {
  const haystack = [
    stop.recipientName,
    stop.houseNumber,
    stop.street,
    stop.floorSide,
    stop.specialInstructions,
    stop.specialInstructions2,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function ZoneWorkspace({
  zoneId,
  zoneNumber,
  zoneName,
  publications,
  items,
  truncated,
}: {
  zoneId: string;
  zoneNumber: number;
  zoneName: string | null;
  publications: Publication[];
  items: RouteItem[];
  truncated: boolean;
}) {
  const [query, setQuery] = useState("");
  const [openStopId, setOpenStopId] = useState<string | null>(null);
  const [addingStop, setAddingStop] = useState(false);

  const pubName = useMemo(
    () => new Map(publications.map((pub) => [pub.id, pub.name])),
    [publications],
  );

  // Searching hides the driving directions -- they're navigation between
  // stops, so they're noise once the list is a filtered subset. Route order is
  // preserved either way, so a search hit still shows where it falls in the run.
  const visible = useMemo(() => {
    if (!query) return items;
    return items.filter((item) => item.kind === "stop" && matches(item, query));
  }, [items, query]);

  const stopCount = useMemo(
    () => visible.filter((item) => item.kind === "stop").length,
    [visible],
  );

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <h1 className="text-2xl font-semibold">{zoneName ?? `Zone ${zoneNumber}`}</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        In delivery order. {stopCount} {stopCount === 1 ? "address" : "addresses"}
        {query ? " matching" : ""}.
      </p>

      {truncated ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          This route is longer than the server will return in one request, so it is being
          shown incomplete. Pagination needs to be added before this zone can be relied on.
        </p>
      ) : null}

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name, address or instructions…"
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

          <p className="text-xs text-black/60 dark:text-white/60">
            New addresses are added to the end of the route. The courier office can move them
            into the right position in the driving order.
          </p>

          <button
            type="submit"
            className="rounded-lg bg-black px-4 py-2 font-medium text-white dark:bg-white dark:text-black"
          >
            Save address
          </button>
        </form>
      ) : null}

      <ol className="mt-4 divide-y divide-black/10 dark:divide-white/10">
        {visible.map((item) =>
          item.kind === "direction" ? (
            <li
              key={item.id}
              className="bg-black/[.03] px-3 py-2 text-sm font-medium uppercase tracking-wide text-black/70 dark:bg-white/[.06] dark:text-white/70"
            >
              {item.text}
            </li>
          ) : (
            <StopRow
              key={item.id}
              stop={item}
              zoneNumber={zoneNumber}
              publications={publications}
              pubName={pubName}
              isOpen={openStopId === item.stopId}
              onToggleOpen={() =>
                setOpenStopId(openStopId === item.stopId ? null : item.stopId)
              }
            />
          ),
        )}

        {!visible.length ? (
          <li className="py-8 text-center text-black/50 dark:text-white/50">
            {items.length ? "No addresses match your search." : "No addresses in this zone yet."}
          </li>
        ) : null}
      </ol>
    </div>
  );
}

function StopRow({
  stop,
  zoneNumber,
  publications,
  pubName,
  isOpen,
  onToggleOpen,
}: {
  stop: StopItem;
  zoneNumber: number;
  publications: Publication[];
  pubName: Map<string, string>;
  isOpen: boolean;
  onToggleOpen: () => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // A compact text summary instead of a button per publication. Rendering the
  // full toggle row for every stop meant ~9,000 form elements on the largest
  // zone; the toggles now live in the expanded panel, so only the open stop
  // pays that cost.
  const receives = stop.publicationIds
    .map((id) => pubName.get(id))
    .filter(Boolean)
    .sort();

  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
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
          {stop.specialInstructions2 ? (
            <p className="text-sm italic text-black/70 dark:text-white/70">
              {stop.specialInstructions2}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
            {receives.length ? receives.join(" · ") : "No publications"}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={isOpen}
          className="shrink-0 rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
        >
          {isOpen ? "Close" : "Manage"}
        </button>
      </div>

      {isOpen ? (
        <div className="mt-3 space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Publications delivered here</legend>
            <div className="flex flex-wrap gap-2">
              {publications.map((pub) => {
                const on = stop.publicationIds.includes(pub.id);
                return (
                  <form key={pub.id} action={togglePublication}>
                    <input type="hidden" name="stopId" value={stop.stopId} />
                    <input type="hidden" name="publicationId" value={pub.id} />
                    <input type="hidden" name="zoneNumber" value={zoneNumber} />
                    <input type="hidden" name="eventType" value={on ? "removed" : "added"} />
                    <button
                      type="submit"
                      aria-pressed={on}
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
                  </form>
                );
              })}
            </div>
          </fieldset>

          <form action={updateStopDetails} className="space-y-2">
            <input type="hidden" name="stopId" value={stop.stopId} />
            <input type="hidden" name="zoneNumber" value={zoneNumber} />
            <input type="hidden" name="previousFloorSide" value={stop.floorSide ?? ""} />
            <input
              type="hidden"
              name="previousInstructions"
              value={stop.specialInstructions ?? ""}
            />
            <input
              type="hidden"
              name="previousInstructions2"
              value={stop.specialInstructions2 ?? ""}
            />
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Floor / side</span>
              <select
                name="floorSide"
                defaultValue={stop.floorSide ?? ""}
                className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black"
              >
                <option value="">—</option>
                <option value="upstairs">Upstairs</option>
                <option value="basement">Basement</option>
              </select>
            </label>
            <input
              name="specialInstructions"
              defaultValue={stop.specialInstructions ?? ""}
              placeholder="Special instructions"
              className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black"
            />
            <input
              name="specialInstructions2"
              defaultValue={stop.specialInstructions2 ?? ""}
              placeholder="Second note (optional)"
              className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black"
            />
            <button
              type="submit"
              className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium dark:border-white/20"
            >
              Save details
            </button>
          </form>

          <form action={logComplaint} className="flex gap-2">
            <input type="hidden" name="stopId" value={stop.stopId} />
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

          {confirmingRemove ? (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
              <p className="text-sm text-red-800 dark:text-red-200">
                Remove {stop.houseNumber} {stop.street} from this route? It stops being
                delivered and disappears from the list.
              </p>
              <div className="flex gap-2">
                <form action={deactivateStop}>
                  <input type="hidden" name="stopId" value={stop.stopId} />
                  <input type="hidden" name="zoneNumber" value={zoneNumber} />
                  <button
                    type="submit"
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white"
                  >
                    Yes, remove it
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium dark:border-white/20"
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="text-sm text-red-600 underline underline-offset-2 dark:text-red-400"
            >
              Remove this address
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}
