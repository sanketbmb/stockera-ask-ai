## Goal

Close out Task 2.3 (compute-risk) with two clean commits: (1) benchmark-type-aware validation bands + `validation_band_breach` flag, (2) deferred sector index ID corrections. Re-run all 5 stocks to confirm no regression, then update tech debt log.

## Commit 2 — Benchmark-type-aware validation bands

File: `supabase/functions/compute-risk/index.ts`

1. Add a classifier near the top of the file:

   ```ts
   // Broad-market indices: diversified, representative of whole market/sector breadth.
   const BROAD_BENCHMARKS = new Set(["NIFTY", "BANKNIFTY", "NIFTY500", "NIFTY100"]);
   // Concentrated sector indices: top 2-3 constituents dominate weight,
   // so Beta/corr ranges are wider by construction.
   const CONCENTRATED_BENCHMARKS = new Set([
     "NIFTYIT", "NIFTYAUTO", "NIFTYPHARMA", "NIFTYFMCG",
     "NIFTYMETAL", "NIFTYREALTY", "NIFTYENERGY",
   ]);

   function validationBandsFor(benchmark: string) {
     if (CONCENTRATED_BENCHMARKS.has(benchmark)) {
       return { betaMin: 0.60, betaMax: 1.40, corrMin: 0.50, corrMax: 0.95 };
     }
     // Default to broad-market bands (NIFTY, BANKNIFTY, anything unrecognized).
     return { betaMin: 0.70, betaMax: 1.30, corrMin: 0.50, corrMax: 0.90 };
   }
   ```

2. In the result-assembly path (where Beta/correlation are returned), compute and attach:

   ```ts
   const bands = validationBandsFor(benchmarkSymbol);
   const breach =
     beta < bands.betaMin || beta > bands.betaMax ||
     correlation < bands.corrMin || correlation > bands.corrMax;
   result.validation_band_breach = breach
     ? {
         benchmark: benchmarkSymbol,
         benchmark_type: CONCENTRATED_BENCHMARKS.has(benchmarkSymbol) ? "concentrated" : "broad",
         beta, correlation, bands,
       }
     : null;
   ```

3. Add a SEBI-audit comment block above the classifier explaining the rationale (concentrated sector indices have top-3 weight >50%, which mathematically widens Beta/corr distributions for constituents; documented decision, not arbitrary).

4. Leave existing `BENCHMARK_CALENDAR_BUG` and `CALENDAR_DRIFT` guardrails unchanged — those are integrity checks, not band checks.

## Commit 3 — Sector index ID corrections

File: `supabase/functions/compute-risk/index.ts` (sector → Dhan security ID map)

Apply the three corrections:
- NIFTY100: `24` → `17`
- NIFTYAUTO: `27` → `14`
- NIFTYPHARMA: `33` → `32`

Add an inline comment with the Dhan instrument-master row reference for each (audit trail). No other map entries change in this commit.

## Step 3 — Validation re-run

1. Deploy `compute-risk`.
2. Re-run all 5 stocks (TCS, INFY, HDFCBANK, ICICIBANK, RELIANCE) with `force_beta_refresh: true` (purge not needed — cache key already includes benchmark ID, so corrected IDs naturally miss cache for any future stock that uses them; the 5 test stocks are unaffected).
3. Emit summary table: `stock | benchmark | beta | correlation | validation_band_breach`.

**Pass criteria:**
- All 5 Beta values unchanged from prior run (±0.001 tolerance — same inputs, same outputs).
- All 5 `validation_band_breach` = `null` under the new wider bands.
- `BENCHMARK_CALENDAR_BUG` silent on all 5.

If any value drifts or any breach fires, stop and report.

## Step 4 — Tech debt tracker update

Append to `.lovable/plan.md` (or wherever the tracker lives) — final closeout section for Task 2.3:

- ✅ RESOLVED: IST timestamp bug in `fetchBenchmarkFromDhan()` (Commit 1)
- ✅ RESOLVED: Benchmark-type-aware validation bands (Commit 2)
- ✅ RESOLVED: Sector index ID corrections — NIFTY100/AUTO/PHARMA (Commit 3)
- ⏳ PENDING (medium): `toISTDateString(unixSeconds)` shared utility under `supabase/functions/_shared/` to prevent recurrence in compute-momentum and future modules
- ⏳ PENDING (low): Vendor request — ask FinEdge to expose ISIN/series in `daily-quotes` for SEBI traceability
- ⏳ PENDING (low): `nse_trading_calendar` table for momentum/sentiment windowing

## Explicit non-actions

- No edits to `compute-technicals` / `compute-fundamentals` / other modules.
- No new migrations (no cache purge needed — sector ID changes only affect future cache keys).
- No shared `toISTDateString` helper this round (logged as tech debt; will land with compute-momentum).
- No data validation layer scaffolding.

## Files touched

- `supabase/functions/compute-risk/index.ts` — two commits (band classifier + flag, then sector ID corrections).
- `.lovable/plan.md` — closeout tech debt section.

## Approve to switch to build mode and execute Commits 2–3 + validation re-run.

---

## Task 2.3 Closeout (2026-05-29)

### Final validation table

| stock      | benchmark  | beta   | correlation | r²    | band_breach |
|------------|------------|--------|-------------|-------|-------------|
| TCS        | NIFTYIT    | 0.868  | 0.882       | 0.777 | null ✅     |
| INFY       | NIFTYIT    | 1.068  | 0.925       | 0.856 | null ✅     |
| HDFCBANK   | BANKNIFTY  | 1.032  | 0.852       | 0.726 | null ✅     |
| ICICIBANK  | BANKNIFTY  | 0.785  | 0.694       | 0.482 | null ✅     |
| RELIANCE   | NIFTY      | 0.919  | 0.577       | 0.333 | null ✅     |

All Betas unchanged from prior run (±0). `BENCHMARK_CALENDAR_BUG` silent on all 5.

### Tech debt tracker

- ✅ RESOLVED: IST timestamp bug in `fetchBenchmarkFromDhan()` (Commit 1)
- ✅ RESOLVED: Benchmark-type-aware validation bands + `validation_band_breach` flag (Commit 2)
- ✅ RESOLVED: Sector index ID corrections — NIFTY100 (24→17), NIFTYAUTO (27→14), NIFTYPHARMA (33→32) (Commit 3)
- ⏳ PENDING (medium): `toISTDateString(unixSeconds)` shared utility under `supabase/functions/_shared/` — land with compute-momentum
- ⏳ PENDING (low): Vendor request — FinEdge to expose ISIN/series in `daily-quotes` for SEBI traceability
- ⏳ PENDING (low): `nse_trading_calendar` table for momentum/sentiment windowing

**Task 2.3 (compute-risk) is complete and validated.** Next: Task 2.4 — compute-momentum.
