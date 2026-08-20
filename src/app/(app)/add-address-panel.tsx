"use client";

import { useState } from "react";
import { createStopFromHome } from "./actions";
import { parseAddressQuery } from "@/lib/address-search";

type Zone = { id: string; number: number; label: string };
type Publication = { id: string; code: string; name: string };

export function AddAddressPanel({
  zones,
  publications,
  suggestedZoneNumber,
  prefill,
  startOpen,
}: {
  zones: Zone[];
  publications: Publication[];
  suggestedZoneNumber: number | null;
  prefill: string;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);

  // What the CSR already typed into the search box is almost always the address
  // they are about to add, so don't make them type it twice.
  const parsed = parseAddressQuery(prefill);
  const suggested = zones.find((zone) => zone.number === suggestedZoneNumber);
  const defaultZoneId = suggested?.id ?? (zones.length === 1 ? zones[0].id : "");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 rounded-lg border border-black/15 px-3 py-2 text-sm font-medium dark:border-white/20"
      >
        Add a new address
      </button>
    );
  }

  return (
    <form
      action={createStopFromHome}
      className="mt-5 space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/15"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-medium">Add a new address</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm underline underline-offset-2"
        >
          Cancel
        </button>
      </div>

      <label className="block text-sm">
        <span className="text-black/60 dark:text-white/60">Route</span>
        <select
          name="zoneId"
          required
          defaultValue={defaultZoneId}
          className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-base dark:border-white/20 dark:bg-black"
        >
          <option value="">Pick a route…</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.label}
            </option>
          ))}
        </select>
      </label>

      {suggested ? (
        <p className="text-xs text-black/60 dark:text-white/60">
          That street is already on {suggested.label}, so it&apos;s pre-selected — change it
          if this address belongs somewhere else.
        </p>
      ) : (
        <p className="text-xs text-black/60 dark:text-white/60">
          Nothing on that street is on a route yet, so pick the right one.
        </p>
      )}

      <div className="flex gap-2">
        <input
          name="houseNumber"
          required
          defaultValue={parsed?.houseNumber ?? ""}
          placeholder="House #"
          aria-label="House number"
          className="w-28 rounded-lg border border-black/15 px-3 py-2 text-base dark:border-white/20 dark:bg-black"
        />
        <input
          name="street"
          required
          // Only when a house number was parsed too, so a search for a surname
          // does not quietly land in the street field.
          defaultValue={parsed?.houseNumber ? parsed.text : ""}
          placeholder="Street"
          aria-label="Street"
          className="flex-1 rounded-lg border border-black/15 px-3 py-2 text-base dark:border-white/20 dark:bg-black"
        />
      </div>

      <input
        name="recipientName"
        placeholder="Name (optional)"
        aria-label="Recipient name"
        className="w-full rounded-lg border border-black/15 px-3 py-2 text-base dark:border-white/20 dark:bg-black"
      />
      <input
        name="floorSide"
        placeholder="Upstairs / Basement / Apt # (optional)"
        aria-label="Floor or side"
        className="w-full rounded-lg border border-black/15 px-3 py-2 text-base dark:border-white/20 dark:bg-black"
      />
      <input
        name="specialInstructions"
        placeholder="Delivery instructions (optional)"
        aria-label="Special instructions"
        className="w-full rounded-lg border border-black/15 px-3 py-2 text-base dark:border-white/20 dark:bg-black"
      />

      <fieldset>
        <legend className="text-sm text-black/60 dark:text-white/60">Receives</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {publications.map((pub) => (
            <label key={pub.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="publicationIds"
                value={pub.id}
                defaultChecked={publications.length === 1}
              />
              {pub.name}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        Add address
      </button>
    </form>
  );
}
