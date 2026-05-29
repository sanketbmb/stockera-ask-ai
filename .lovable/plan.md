
## Goal

Fix Beta collapse (TCS 0.23 → expected 0.85–1.15) by filtering Sunday/Saturday rows out of Dhan IDX_I benchmark candles. No alignByDate changes, no math changes, no source switch. Two clean commits afterward: this fix, then the deferred sector-ID corrections.

## Step 1 — Weekend filter in `fetchBenchmarkFromDhan()`

File: `supabase/functions/compute-risk/index.ts`.

Inside the loop that walks the Dhan historical response (where `ts[i]`, `close[i]`, etc. are read into the row array), insert at the top of the loop body, before pushing the row:

```ts
const wd = new Date(ts[i] * 1000).getUTCDay(); // 0=Sun, 6=Sat
if (wd === 0 || wd === 6) continue;
```

That's it for the production path. No changes to `alignByDate()`, `dailyReturns()`, `covariance()`, or any divisor. Intersection-by-date is left to do its job — once Sundays are gone from the bench side, the intersection will naturally include every shared NSE trading day (Diwali, Holi, long weekends included).

## Step 2 — Permanent guardrail (post-filter assertion)

Immediately after the row array is fully built in `fetchBenchmarkFromDhan()`, before returning / caching:

```ts
const sundayCount = filteredRows.filter(
  (r) => new Date(r.date).getUTCDay() === 0,
).length;
const saturdayCount = filteredRows.filter(
  (r) => new Date(r.date).getUTCDay() === 6,
).length;
if (sundayCount > 0 || saturdayCount > 0) {
  console.error(
    `BENCHMARK_CALENDAR_BUG: ${sundayCount} Sun, ${saturdayCount} Sat survived filter for benchmark=${benchmarkSymbol}`,
  );
}
```

(Variable names adapted to whatever the actual row array + benchmark symbol are called in scope — I'll match them when implementing.)

## Step 3 — Calendar-drift visibility (no row dropping)

In `alignByDate()`, after building the intersection, compute the symmetric difference between the stock-date set and the bench-date set (already trivially available from the existing code). For each date present on one side but not the other, log:

```ts
console.warn(
  `CALENDAR_DRIFT: date=${d} present_in=${side} missing_in=${other} symbol=${symbol} benchmark=${benchmark}`,
);
```

Cap at 20 lines per call to avoid log spam. **No rows are dropped, no pairs filtered.** This is observability only — per the user's SEBI-defensibility requirement, we surface drift rather than hide it.

## Step 4 — Purge `benchmark_cache`

Run a one-shot SQL via the insert tool:

```sql
DELETE FROM public.benchmark_cache;
```

(Confirming the table name from the codebase before executing — if it's named differently, the actual cache table gets truncated.)

## Step 5 — Deploy + re-run all 5 stocks

1. `supabase--deploy_edge_functions` for `compute-risk`.
2. Call `compute-risk` with `force_beta_refresh: true` for each of the 5 stocks against its primary benchmark:
   - TCS vs NIFTYIT
   - INFY vs NIFTYIT
   - HDFCBANK vs BANKNIFTY
   - ICICIBANK vs BANKNIFTY
   - RELIANCE vs NIFTY
3. For TCS, also pull `?debug=true` once to confirm `bench_days` jumped from 676 → ~700+ and `intersection_days` from 506 → ~660+.

## Step 6 — Deliverable

Single summary table:

| Stock | Benchmark | Beta (old) | Beta (new) | Correlation (new) | bench_days | intersection_days | Pass? |
|---|---|---|---|---|---|---|---|

Pass criteria:
- TCS / INFY vs NIFTYIT: 0.85–1.15
- HDFCBANK / ICICIBANK vs BANKNIFTY: 0.85–1.15
- RELIANCE vs NIFTY: 0.9–1.2
- Correlations: 0.6–0.85
- `BENCHMARK_CALENDAR_BUG` log: must be silent

Plus a count of `CALENDAR_DRIFT` warnings observed per benchmark (for the SEBI audit log — informational only, not a failure condition).

If any stock misses its band, escalate before touching code further.

## Deferred (separate PR, after this lands green)

Sector-index ID corrections (single commit):
- `NIFTY100`: 24 → 17
- `NIFTYAUTO`: 27 → 14
- `NIFTYPHARMA`: 33 → 32

## Logged tech debt (not in this PR)

`nse_trading_calendar` table seeded from NSE's official holiday list — Phase 3 task. Becomes the source of truth for "was date X a trading day in India" across Beta, momentum, sentiment windowing, and SEBI reporting.

## Files touched

- `supabase/functions/compute-risk/index.ts` — weekend filter + guardrail in `fetchBenchmarkFromDhan()`, calendar-drift warnings in `alignByDate()`.
- One SQL execution to truncate `benchmark_cache`.

Approve to switch to build mode and execute.
