
## Goal

Determine whether the TCS Beta collapse is caused by a FinEdge stock-data issue. Run a read-only diff probe comparing FinEdge `daily-quotes` vs Dhan `historical EQUITY` close series for **TCS + 2 controls (RELIANCE, HDFCBANK)**. Return diagnosis + recommendation only. **No code changes to `compute-risk` or any feed switch in this round.**

## Step 1 — Build a one-shot probe script

A throwaway Deno script (run via `deno run` against the deployed `finedge-fetch` and `dhan-fetch` edge functions, authenticated with the same JWT the app uses) that, for each of `{TCS, RELIANCE, HDFCBANK}`:

1. Calls `finedge-fetch daily-quotes` for the full overlap range (2023-09-04 → 2026-05-28).
2. Calls `dhan-fetch historical` with `instrument: "EQUITY"`, `exchangeSegment: "NSE_EQ"` and the correct security IDs:
   - TCS: 11536
   - RELIANCE: 2885
   - HDFCBANK: 1333
3. Aligns by date (intersection only; no weekend filtering needed — both are daily closes).
4. Builds a diff row per date: `date | finedge_close | dhan_close | abs_diff | pct_diff`.

## Step 2 — Sampled diff table (per stock)

For each stock, print:

- First 10 overlapping trading days (Sept 2023)
- 10 random days from mid-2024
- 10 random days from mid-2025
- Last 10 trading days (May 2026)

Plus aggregates over the **full** series: `mean_pct_diff`, `max_abs_pct_diff`, `count(pct_diff > 0.1%)`, `count(pct_diff > 1%)`.

## Step 3 — TCS raw-payload dump (May 11–19, 2026)

Print the **raw FinEdge JSON** for TCS over 2026-05-11 → 2026-05-19, untrimmed. Goal: see the exact close FinEdge reports for the −3.94% NIFTYIT day, side by side with Dhan's close for the same dates.

## Step 4 — ISIN / identifier drift check

For each stock's FinEdge response, extract whatever instrument-identifier fields are present (`symbol`, `isin`, `exchange`, `series` — whatever the payload carries) at the **first**, **middle**, and **last** observations. Assert constant. Expected:

- TCS ISIN: `INE467B01029`
- RELIANCE ISIN: `INE002A01018`
- HDFCBANK ISIN: `INE040A01034`

Flag any mid-series drift as `INSTRUMENT_DRIFT`.

## Step 5 — Corporate-action sanity check (TCS only)

Known TCS dividends in the window:
- 2024: ₹76 special + ₹10 final
- 2025: ₹66 special

For each, check the FinEdge close on the trading day **before** vs **on** the ex-date. Compute the implied jump and compare to Dhan's same-day pair. If FinEdge shows continuous (back-adjusted) prices and Dhan shows the dividend-sized gap, that's an **adjustment-policy difference**, not a bug — and likely the entire explanation for the Beta collapse.

## Step 6 — Decision matrix (report-only)

Apply the user's decision matrix and emit one of `{CASE_1, CASE_2_TCS_ONLY, CASE_3_SYSTEMIC, CASE_4_BOTH_WRONG}` with the supporting evidence:

| Case | Signature | Recommendation surfaced |
|---|---|---|
| 1 | All 3 stocks: pct_diff < 0.1% always | FinEdge OK. Re-investigate `dailyReturns()` / array-truncation in compute-risk. Do not switch feeds. |
| 2 | Only TCS has large divergence | TCS-specific FinEdge issue. Propose per-stock `data_source` column in `stock_master`. |
| 3 | All 3 stocks systematically diverge | Adjustment-policy mismatch. **Cross-check vs NSE bhavcopy for 2026-05-27 before any feed switch.** |
| 4 | FinEdge ≈ Dhan, both ≠ bhavcopy | Escalate to Super Agent. |

For Case 1 specifically, also surface the **next** debug step we'd take inside `compute-risk` (instrumenting `dailyReturns()` to log array lengths + first/last 5 values per leg for TCS), but do **not** implement it yet.

## Step 7 — Cross-module risk flag

Regardless of case, explicitly state in the report whether the finding implicates `compute-technicals` and `compute-fundamentals` (they both consume FinEdge `daily-quotes` / `financials`). If Case 2/3/4 fires, flag that prior scores may need re-validation. If Case 1, state explicitly that other modules are unaffected.

## Deliverable

Single report containing:

1. Per-stock sampled diff tables (40 rows × 3 stocks).
2. Per-stock full-series aggregate stats.
3. Raw FinEdge TCS payload for 2026-05-11 → 2026-05-19, plus matching Dhan slice.
4. ISIN-drift assertion result per stock.
5. TCS corporate-action adjustment comparison.
6. Case verdict + evidence.
7. Cross-module risk statement.
8. Recommended next action — **no code changes applied**.

## Explicit non-actions this round

- No edits to `supabase/functions/compute-risk/index.ts`.
- No changes to any feed selection or `stock_master` schema.
- No new migrations. (The previously-staged `DELETE FROM benchmark_cache` migration stays unapplied until weekend-filter follow-up is closed out separately.)
- No changes to `compute-technicals` or `compute-fundamentals`.
- Deferred sector-ID corrections (NIFTY100/AUTO/PHARMA) remain queued.

## Files touched

- One throwaway probe script (not committed; run from sandbox against deployed edge functions).
- No project source files.

Approve to switch to build mode and run the probe.
