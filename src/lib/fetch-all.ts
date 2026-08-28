/**
 * Reading a whole table through PostgREST.
 *
 * PostgREST caps a select with no explicit range at 1,000 rows and reports the
 * cap nowhere in the response body -- the caller just gets a short array. That
 * is not a hypothetical: measured against production on 2026-08-28, the weekly
 * import was planning against the first 1,000 of 2,427 active addresses, and
 * the shape of the damage is worth recording because nothing about it looked
 * like a failure on screen:
 *
 *   * 698 addresses we already deliver to were reported as "not on our routes"
 *   * "already correct" read 392 when the true figure was 881
 *   * 14 rows were offered as new addresses; 12 of them already existed, and 8
 *     of those were houses already receiving the publication -- so an Apply
 *     would have put a second copy of the paper, and a second booklet line, on
 *     eight doors
 *
 * So: never select a table that can exceed 1,000 rows without paging, and never
 * swallow the error. A short read here silently becomes a wrong booklet.
 */

/** PostgREST's default cap. Pages are requested at exactly this size. */
export const PAGE_SIZE = 1000;

/** Refuses to loop forever if a range request ever stops advancing. */
const MAX_ROWS = 200_000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Calls `page` with successive ranges until it returns a short page.
 *
 * `label` names the data in the error message, because these surface to office
 * staff. The `page` callback must apply a stable `.order(...)`: without one
 * PostgREST may return rows in a different order per request, and pages then
 * overlap and skip.
 *
 * Throws rather than returning partial data. Every caller here would otherwise
 * treat a truncated read as the whole truth.
 */
export async function fetchAllPages<T>(label: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const all: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not read ${label}: ${error.message}`);

    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) return all;

    if (all.length >= MAX_ROWS) {
      throw new Error(`Refusing to read more than ${MAX_ROWS.toLocaleString()} ${label} rows.`);
    }
  }
}
