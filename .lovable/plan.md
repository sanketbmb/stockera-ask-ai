## Goal

Land the root-cause fix for the Beta collapse: align Dhan bench candles by **IST date** instead of UTC date, purge the corrupted `benchmark_cache`, audit the rest of the codebase for the same bug pattern, and re-verify all 5 stocks meet the success bands.

## Step 1 — Surgical fix in `fetchBenchmarkFromDhan()` (`supabase/functions/compute-risk/index.ts`)

Replace the current UTC-derived date key + weekend filter with IST conversion:

```ts
// Dhan timestamps are midnight IST expressed as Unix seconds.
// Convert to IST date string by adding 5h30m (19800 s) before slicing.
const date = new Date((ts[i] + 19800) * 1000).toISOString().slice(0, 10);
// (delete the getUTCDay() weekend filter — IST dates of weekend trading don't exist)
```

Reframe the `BENCHMARK_CALENDAR_BUG` assertion:
- **Old:** weekend rows present → flag.
- **New:** (a) no duplicate date keys, and (b) `bench_days / years ≥ 220` average. Either failure raises `BENCHMARK_CALENDAR_BUG` with the offending stat.

Leave `CALENDAR_DRIFT` (intersection-gap) check unchanged.

## Step 2 — Purge `benchmark_cache`

Apply the previously-staged migration: `DELETE FROM benchmark_cache;` (all indices, all rows). Forces every Beta recompute to refetch from Dhan with the corrected alignment.

## Step 3 — Cross-module audit (read-only grep)

Grep the **entire repo** (not just `supabase/functions/`) for these three patterns:

1. `new Date(... * 1000)` — any Unix-seconds → Date conversion
2. `.getUTCDay(` — any UTC weekday check
3. `.toISOString().slice(0, 10)` and `.toISOString().substring(0, 10)` — any UTC date-string derivation

For each hit, classify:

| Classification | Meaning |
|---|---|
| **SAFE** | Source timestamp is already UTC-noon (FinEdge `quote_date` is a date string, not a unix ts — these never appear together) OR the code is intentionally UTC (logs, cache TTLs). |
| **BUG-HIGH** | Same pattern as the bench bug, in a path that affects user-facing scores (technicals, fundamentals, momentum, risk, AI report). |
| **BUG-MEDIUM** | Same pattern but only affects internal telemetry / admin views. |

Report per-file findings. Do **not** fix any non-bench occurrences in this round — log them as tech debt per the user's instruction. The bench fix in Step 1 is the only code change.

Files to scrutinize most carefully (touch Dhan timestamps):
- `supabase/functions/compute-risk/index.ts` (other uses besides bench)
- `supabase/functions/compute-technicals/index.ts`
- `supabase/functions/compute-fundamentals/index.ts`
- `supabase/functions/fetch-stock-data/index.ts`
- `supabase/functions/get-price-data/index.ts`
- `supabase/functions/dhan-fetch/index.ts` (passthrough only, but verify)

## Step 4 — Deploy & re-run

1. Deploy `compute-risk`.
2. Run the cache purge.
3. Invoke `compute-risk` with `force_beta_refresh: true` for all 5 stocks: TCS, INFY, HDFCBANK, ICICIBANK, RELIANCE.
4. Also run the TCS debug probe (`debug: true`) for the full diagnostic table.

## Step 5 — Validate against success bands

Emit one summary table with the columns:

`stock | benchmark | bench_days | intersection_days | beta | correlation | r² | pass/fail`

**Pass criteria (all must hit):**
- `bench_days ≥ 650`
- `intersection_days ≥ 640`
- TCS Beta vs NIFTYIT: 0.85–1.15
- INFY Beta vs NIFTYIT: 0.85–1.15
- HDFCBANK Beta vs BANKNIFTY: 0.85–1.15
- ICICIBANK Beta vs BANKNIFTY: 0.85–1.15
- RELIANCE Beta vs NIFTY: 0.9–1.2
- All correlations: 0.6–0.85
- `BENCHMARK_CALENDAR_BUG` silent on all 5 runs

If any band misses, **stop and report** — do not proceed to Commit 2.

## Step 6 — Commit boundaries (SEBI audit trail)

- **Commit 1 (this round):** IST conversion in `fetchBenchmarkFromDhan()` + assertion reframe + `benchmark_cache` purge migration.
- **Commit 2 (next round, only after Commit 1 is green):** Deferred sector index ID corrections — NIFTY100: 24→17, NIFTYAUTO: 27→14, NIFTYPHARMA: 33→32. Re-run affected stocks after.

## Tech debt logged (not fixed this round)

1. **`toISTDateString(unixSeconds)` shared helper** — single canonical conversion used by every future Unix-ts handler. Add under `supabase/functions/_shared/`.
2. **FinEdge ISIN/series exposure** — vendor-pressure item; ask FinEdge to add to `daily-quotes` for SEBI traceability.
3. **`nse_trading_calendar` table** — still useful for momentum/sentiment windowing.
4. Any additional **BUG-HIGH / BUG-MEDIUM** hits found in Step 3 grep — log with file:line + severity.

## Explicit non-actions

- No switch to NSE bhavcopy. Vendors are clean.
- No "data validation layer" scaffolding (Phase 2.8 territory).
- No edits to `compute-technicals` / `compute-fundamentals` / other modules in this round, even if Step 3 surfaces same-pattern bugs — those become Commit 3+ items.
- No new schema beyond the cache purge.

## Files touched (Commit 1)

- `supabase/functions/compute-risk/index.ts` — IST conversion in `fetchBenchmarkFromDhan()`, assertion reframe.
- One new migration: `DELETE FROM benchmark_cache;`
- `.lovable/plan.md` — updated to reflect closeout.

Approve to switch to build mode and execute Steps 1–5.
