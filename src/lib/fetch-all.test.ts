/**
 * Regression tests for paged reads.
 *
 * The bug these exist for: PostgREST caps an unpaged select at 1,000 rows and
 * returns a short array with no error, so the weekly import spent a fortnight
 * planning against the first 1,000 of 2,427 real addresses. The first fix
 * paged, but still decided it was finished when a page came back short -- the
 * same mistake one layer down. See src/lib/fetch-all.ts.
 *
 * The fake below models PostgREST as MEASURED against a live server, not as
 * imagined: `count` is the total matching the filter rather than the window,
 * and an offset at or past the end returns 416 when a count was requested
 * (`200 []` when one was not). `cap` simulates a server whose own db-max-rows
 * is lower than our page size.
 *
 * Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAllPages, PAGE_SIZE } from "./fetch-all.ts";

const table = (total: number, opts: { cap?: number } = {}) => {
  const calls: [number, number][] = [];
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    // Measured: `offset >= total` is 416 PGRST103 once a count is requested.
    // Offset 0 is always fine, including on an empty table.
    if (from > 0 && from >= total) {
      return Promise.resolve({
        data: null,
        error: { message: "Requested range not satisfiable" },
        count: null,
      });
    }
    const want = to - from + 1;
    const size = Math.min(want, opts.cap ?? want);
    return Promise.resolve({ data: rows.slice(from, from + size), error: null, count: total });
  };
  return { page, calls, rows };
};

test("a table larger than one page is read whole", async () => {
  // 2,427 is the real active-stop count on the day the truncation was found.
  const t = table(2427);
  const got = await fetchAllPages("addresses", t.page);
  assert.equal(got.length, 2427);
  assert.deepEqual(got.map((r) => r.id), t.rows.map((r) => r.id));
  assert.deepEqual(t.calls, [
    [0, PAGE_SIZE - 1],
    [PAGE_SIZE, 2 * PAGE_SIZE - 1],
    [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1],
  ]);
});

test("a table smaller than one page costs a single request", async () => {
  const t = table(12);
  assert.equal((await fetchAllPages("addresses", t.page)).length, 12);
  assert.equal(t.calls.length, 1);
});

test("an empty table is not an error", async () => {
  const t = table(0);
  assert.deepEqual(await fetchAllPages("addresses", t.page), []);
  assert.deepEqual(t.calls, [[0, PAGE_SIZE - 1]]);
});

test("an exact multiple of the page size never asks for the offset past the end", async () => {
  // This assertion is inverted from the first version of these tests, which
  // required the extra request. Measured against a live server: with
  // `count=exact`, `offset=total` returns 416 PGRST103, not `200 []`. So a loop
  // that advanced by a constant would throw on every table whose size happens
  // to be a multiple of 1,000 -- stops today are 2,427, and zone 2 is 735 route
  // entries and growing. Stopping on the count means the request is never made.
  const t = table(PAGE_SIZE * 2);
  assert.equal((await fetchAllPages("addresses", t.page)).length, PAGE_SIZE * 2);
  assert.deepEqual(t.calls, [
    [0, PAGE_SIZE - 1],
    [PAGE_SIZE, 2 * PAGE_SIZE - 1],
  ]);
});

test("a server whose own cap is below our page size is still read whole", async () => {
  // The defect in the first version: every page comes back short, so a
  // length-based loop stopped after one and returned 999 of 1,991 silently.
  // Supabase's own client docs recommend keeping db-max-rows low, so an admin
  // following that advice would have truncated every read in the app.
  const t = table(1991, { cap: 999 });
  const got = await fetchAllPages("addresses", t.page);
  assert.equal(got.length, 1991);
  assert.deepEqual(got.map((r) => r.id), t.rows.map((r) => r.id));
  assert.equal(t.calls[0][0], 0);
  assert.equal(t.calls[1][0], 999, "the offset must advance by rows received, not by PAGE_SIZE");
});

test("a failed read throws instead of returning what arrived", async () => {
  let call = 0;
  await assert.rejects(
    () =>
      fetchAllPages("addresses", () => {
        call++;
        return call === 1
          ? Promise.resolve({
              data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })),
              error: null,
              count: 2427,
            })
          : Promise.resolve({
              data: null,
              error: { message: "canceling statement due to statement timeout" },
              count: null,
            });
      }),
    /Could not read addresses: canceling statement/,
  );
});

test("an error on the very first page throws", async () => {
  await assert.rejects(
    () =>
      fetchAllPages("the route", () =>
        Promise.resolve({ data: null, error: { message: "boom" }, count: null }),
      ),
    /Could not read the route: boom/,
  );
});

test("no rows and no error throws rather than reporting an empty table", async () => {
  // The hole in the first version: `data ?? []` made this look like the end of
  // a short table. An intermediary returning 200 with an empty body, or a stub
  // client that does not model a table, would have silently shortened a route.
  await assert.rejects(
    () => fetchAllPages("addresses", () => Promise.resolve({ data: null, error: null, count: 2427 })),
    /the server returned no rows and no error/,
  );
});

test("a response with no count throws, because completeness cannot be established", async () => {
  // Guards against a caller forgetting `{ count: "exact" }`.
  await assert.rejects(
    () => fetchAllPages("addresses", () => Promise.resolve({ data: [{ id: 1 }], error: null, count: null })),
    /did not say how many rows there are/,
  );
});

test("a page that returns nothing while rows are still missing throws", async () => {
  let call = 0;
  await assert.rejects(
    () =>
      fetchAllPages("addresses", () => {
        call++;
        return Promise.resolve({
          data: call === 1 ? Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })) : [],
          error: null,
          count: 2427,
        });
      }),
    /only 1,000 of 2,427 rows arrived/,
  );
});

test("more rows than the server counted throws rather than being handed back", async () => {
  await assert.rejects(
    () =>
      fetchAllPages("addresses", () =>
        Promise.resolve({ data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null, count: 2 }),
      ),
    /3 rows arrived but the server counted 2/,
  );
});

test("a read of more than four pages is still read whole", async () => {
  // The suite's largest read was three pages, so an early return keyed on page
  // number >= 4 would have survived every other test here. stops sit at 2,427
  // of the 3,000 that would need a fourth page, so this is not far off.
  const t = table(PAGE_SIZE * 4 + 137);
  const got = await fetchAllPages("addresses", t.page);
  assert.equal(got.length, PAGE_SIZE * 4 + 137);
  assert.deepEqual(got.map((r) => r.id), t.rows.map((r) => r.id));
  assert.equal(t.calls.length, 5);
});

test("a range error is translated out of PostgREST's words", async () => {
  // Reachable only if another session shrinks the set between pages. Everything
  // else on the import screen is written for non-technical readers; a raw
  // "PGRST103 Requested range not satisfiable" should not be the exception.
  await assert.rejects(
    () =>
      fetchAllPages("addresses", () =>
        Promise.resolve({
          data: null,
          error: { message: "Requested range not satisfiable" },
          count: null,
        }),
      ),
    (err: Error) => {
      assert.match(err.message, /changed while it was being read/);
      assert.match(err.message, /Nothing was changed/);
      assert.doesNotMatch(err.message, /PGRST103|satisfiable/);
      return true;
    },
  );
});

test("a response with no count key at all throws, rather than dying on undefined", async () => {
  // `count === null` does not catch undefined, so a callback missing the key
  // walked past the guard and died on `.toLocaleString()` -- and planImport
  // hands that TypeError to the screen verbatim.
  await assert.rejects(
    () =>
      fetchAllPages("addresses", () =>
        Promise.resolve({ data: [{ id: 1 }], error: null } as unknown as {
          data: { id: number }[] | null;
          error: { message: string } | null;
          count: number | null;
        }),
      ),
    /did not say how many rows there are/,
  );
});
