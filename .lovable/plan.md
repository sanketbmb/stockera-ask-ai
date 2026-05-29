## Goal
Diagnose why constituent stocks show Beta 0.23–0.50 vs their own sector index (mathematically near-impossible). Return debug payload first, then propose a fix.

## Hypothesis (highest-likelihood bug)

`compute-risk/index.ts` line 192–194:
```ts
const d = new Date(ts[i] * 1000);
out.push({ date: isoDate(d), close });
```

Dhan returns epoch **seconds**. `isoDate()` calls `d.toISOString().slice(0,10)` which is **UTC**. If Dhan timestamps land at 00:00 IST (= 18:30 UTC previous day), every benchmark date shifts back by 1 calendar day vs FinEdge stock dates (which appear to be IST trading-day strings like `2026-05-28`).

Result: when `alignByDate` joins on `date`, Monday's stock close gets paired with Sunday's "benchmark close" — which is actually **Monday's** index close mis-labelled. Net effect: stock returns are correlated with the **next** day's index returns → correlation collapses from ~0.95 to ~0.3, beta shrinks toward 0.

This matches the observed pattern exactly: nonzero but heavily attenuated beta, low R², and the misalignment count discrepancy mentioned in the prior turn (676 aligned of 750 stock-days).

Secondary suspects to check in the dump:
- NIFTYIT security_id mismatch: `BENCHMARK_MAP.NIFTYIT = "29"` in code vs `"27"` in the seed migration — code wins (direct Dhan fetch ignores `stock_master`), but "29" may not actually be NIFTY IT.
- Returns computed from **aligned closes** that may not be consecutive trading days (gap-spanning returns still pair correctly but distort variance).

## Step 1 — Add debug payload (no behaviour change without `?debug=true`)

In `supabase/functions/compute-risk/index.ts`:

1. Parse `?debug=true` from the request URL.
2. In the benchmark-compute branch (after `alignByDate`), build a debug object:
   ```ts
   {
     return_type: "simple_arithmetic",
     date_join: "ISO YYYY-MM-DD string equality, UTC-derived from Dhan epoch_sec",
     stock_days: stockCandles.length,
     bench_days: bench.candles.length,
     intersection_days: aligned.a.length,
     dropped_stock_only: stockCandles.length - aligned.a.length,
     dropped_bench_only: bench.candles.length - aligned.a.length,
     stock_date_range: [stock[0].date, stock.at(-1).date],
     bench_date_range: [bench.candles[0].date, bench.candles.at(-1).date],
     first_10: <first 10 aligned tuples>,
     last_10:  <last 10 aligned tuples>,
   }
   ```
   Each tuple: `{ date, stock_close, stock_return, bench_close, bench_return }` (returns computed in-place from the aligned arrays).
3. Also include 5 sample raw Dhan rows: `{ raw_ts, ist_date, utc_date, close }` where `ist_date = isoDate(new Date(ts*1000 + 5.5*3600*1000))` so we can visually confirm the timezone shift.
4. Attach as `debug: {...}` on the JSON response **only** when `debug=true`. Production calls stay byte-identical.

## Step 2 — Run TCS vs NIFTYIT with debug

Single curl via `supabase--curl_edge_functions`:
```
POST /compute-risk?debug=true
{ "symbol": "TCS", "benchmark": "NIFTYIT", "force_beta_refresh": true }
```

Return the full `debug` block and the computed beta/correlation. Compare the first-10 / last-10 tuples — if `bench_date` is consistently 1 calendar day behind `stock_date` after alignment (or if many stock dates have no match), the timezone hypothesis is confirmed.

## Step 3 — Report findings, do NOT fix yet

Per the user's instruction, stop after the debug dump. Present:
- Which of the 5 candidate bugs the dump points to (timezone, string vs Date, forward-fill, off-by-one, holiday handling, or truncation).
- Proposed one-line fix (likely: shift Dhan ts to IST before `isoDate`, i.e. `new Date(ts*1000 + 19800000)`).
- Expected impact (TCS beta should jump from 0.23 → 0.9–1.1).

Wait for approval before applying the fix and re-running all 5 stocks.

## Files touched
- `supabase/functions/compute-risk/index.ts` — add debug branch only (additive, gated by query param).

## Deploy + invoke
- `supabase--deploy_edge_functions` for `compute-risk`.
- `supabase--curl_edge_functions` for the TCS probe.

Approve to execute.