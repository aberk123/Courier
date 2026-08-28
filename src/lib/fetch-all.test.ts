/**
 * Regression tests for paged reads.
 *
 * The bug these exist for: PostgREST caps an unpaged select at 1,000 rows and
 * returns a short array with no error, so the weekly import spent a fortnight
 * planning against the first 1,000 of 2,427 real addresses. See
 * src/lib/fetch-all.ts for what that did to the numbers.
 *
 * Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAllPages, PAGE_SIZE } from "./fetch-all.ts";

/** A fake table of `total` rows that honours a range the way PostgREST does. */
const table = (total: number) => {
  const calls: [number, number][] = [];
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  return { page, calls, rows };
};

test("a table larger than one page is read whole", async () => {
  // 2,427 is the real active-stop count on the day the truncation was found.
  const t = table(2427);
  const got = await fetchAllPages("addresses", t.page);
  assert.equal(got.length, 2427);
  assert.deepEqual(
    got.map((r) => r.id),
    t.rows.map((r) => r.id),
  );
  assert.equal(t.calls.length, 3);
  assert.deepEqual(t.calls[0], [0, PAGE_SIZE - 1]);
});

test("a table smaller than one page costs a single request", async () => {
  const t = table(12);
  assert.equal((await fetchAllPages("addresses", t.page)).length, 12);
  assert.equal(t.calls.length, 1);
});

test("an empty table is not an error", async () => {
  const t = table(0);
  assert.deepEqual(await fetchAllPages("addresses", t.page), []);
  assert.equal(t.calls.length, 1);
});

test("a table that is an exact multiple of the page size is read whole", async () => {
  // The off-by-one that would reintroduce the bug: stopping because a page came
  // back "full" would drop everything after it, and stopping only on an empty
  // page needs the extra request this asserts.
  const t = table(PAGE_SIZE * 2);
  assert.equal((await fetchAllPages("addresses", t.page)).length, PAGE_SIZE * 2);
  assert.equal(t.calls.length, 3);
});

test("a failed read throws instead of returning what arrived", async () => {
  // The whole point. Returning a partial list makes every address the roster
  // did not mention look like a cancellation.
  let call = 0;
  await assert.rejects(
    () =>
      fetchAllPages("addresses", () => {
        call++;
        return call === 1
          ? Promise.resolve({ data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })), error: null })
          : Promise.resolve({ data: null, error: { message: "canceling statement due to statement timeout" } });
      }),
    /Could not read addresses: canceling statement/,
  );
});

test("an error on the very first page throws", async () => {
  await assert.rejects(
    () => fetchAllPages("the route", () => Promise.resolve({ data: null, error: { message: "boom" } })),
    /Could not read the route: boom/,
  );
});
