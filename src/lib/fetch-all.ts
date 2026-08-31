/**
 * Reading a whole table through PostgREST, and proving it read all of it.
 *
 * PostgREST caps a select with no explicit range at 1,000 rows and reports the
 * cap nowhere -- the caller just gets a short array. Measured against production
 * on 2026-08-28, that had the weekly import planning against the first 1,000 of
 * 2,427 active addresses: 698 addresses we already deliver to were reported as
 * "not on our routes", and of 14 rows offered as new addresses 12 already
 * existed -- 8 of them houses already receiving the publication. An Apply would
 * have put a second paper and a second booklet line on eight doors.
 *
 * The first version of this function paged, but still decided it was finished
 * when a page came back shorter than PAGE_SIZE -- which is the same mistake one
 * layer down. The server's own db-max-rows can be lower than our page size
 * (Supabase's client docs actively recommend keeping it low), and then EVERY
 * page looks short and the loop stops after one. Measured on a simulated
 * 1,991-row read with the cap at 999: 999 rows returned, no error, no way for
 * the caller to know.
 *
 * So completeness is not inferred from page length any more. The caller passes
 * `{ count: "exact" }` and we page until the assembled array reaches that count.
 *
 * Two things make this work, both measured against a live server rather than
 * assumed:
 *
 *   * `count` is the TOTAL matching the filter, not the size of the window --
 *     `content-range: 0-9/236` for a 10-row page of a 236-row table. It is also
 *     correct alongside an embedded `!inner` filter (`0-4/9`).
 *   * The offset advances by rows RECEIVED, never by PAGE_SIZE, and we stop the
 *     moment the count is reached. That closes the gap when the server hands
 *     back fewer rows than asked for, and -- critically -- it means we never
 *     request an offset at or past the end. That request is harmless without a
 *     count (`200 []`) and FATAL with one (`416 PGRST103`, "Requested range not
 *     satisfiable"), so a loop that advanced by a constant would throw on any
 *     table whose size is an exact multiple of the page size. Zone 2 is 735
 *     route entries and growing; stops are 2,427.
 *
 * The `page` callback must apply a stable, UNIQUE `.order(...)`. Without one,
 * pages overlap and skip. `created_at` is not unique in this schema -- pair it
 * with `.order("id")` before paging anything ordered by it.
 *
 * Known limit, stated so nobody trusts this further than it goes: this is
 * offset paging. A row deleted by someone else mid-read shifts the pages under
 * us and can lose a live row while the totals still reconcile. Keyset paging is
 * the fix if that ever shows up in a real import diff; both callers already
 * order on a unique column, so the change would be mechanical. The count check
 * does not cover it.
 */

/** The page size we ask for. Deliberately NOT a completeness signal -- see above. */
export const PAGE_SIZE = 1000;

/** Refuses to pull an implausible table into memory. Checked against the count. */
const MAX_ROWS = 200_000;

type Page<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
}>;

/**
 * Calls `page` with successive ranges until the assembled array reaches the
 * server's own count of matching rows.
 *
 * Throws rather than returning partial data, in every failure it can detect.
 * Every caller here would otherwise treat a truncated read as the whole truth,
 * and on the import path a partial list makes every address the roster did not
 * mention look like a cancellation. `label` names the data in the message,
 * because these reach office staff.
 */
export async function fetchAllPages<T>(label: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const all: T[] = [];

  for (;;) {
    const from = all.length;
    const { data, error, count } = await page(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Could not read ${label}: ${error.message}`);
    if (data === null) {
      throw new Error(`Could not read ${label}: the server returned no rows and no error.`);
    }
    if (count === null || Number.isNaN(count)) {
      // The caller forgot `{ count: "exact" }`, or something stripped the
      // content-range header. Either way completeness cannot be established,
      // and a short read here becomes a cancelled subscriber.
      throw new Error(`Could not read ${label}: the server did not say how many rows there are.`);
    }
    if (count > MAX_ROWS) {
      throw new Error(`Refusing to read ${count.toLocaleString()} ${label} rows.`);
    }

    all.push(...data);

    if (all.length >= count) {
      if (all.length > count) {
        throw new Error(
          `Could not read ${label}: ${all.length.toLocaleString()} rows arrived but the server ` +
            `counted ${count.toLocaleString()}. ` +
            `Nothing was changed — try again.`,
        );
      }
      return all;
    }

    if (data.length === 0) {
      throw new Error(
        `Could not read ${label}: only ${all.length.toLocaleString()} of ${count.toLocaleString()} ` +
          `rows arrived. ` +
          `Nothing was changed — try again.`,
      );
    }
  }
}
