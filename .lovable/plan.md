
## Goal

Diagnose why TCS Beta vs NIFTYIT collapses to 0.23. Run a single extended debug probe that tests Hypotheses A–D explicitly, return the diagnosis, and propose a one-line fix. **Do not apply the fix yet.** Defer the 3 sector-index ID fixes (NIFTY100, NIFTYAUTO, NIFTYPHARMA) for a clean post-Beta-fix commit.

## Pre-existing code smells I already spotted (will be confirmed/refuted by the probe)

1. `dailyReturns()` at line 85 silently **drops any row where `prev <= 0`** instead of pushing `NaN`. Called independently on `aligned.a` and `aligned.b` (lines 536–537), so a single dropped row on one side desynchronizes every subsequent return on that side from the other — a textbook Hypothesis A trigger.
2. `covariance()` at line 71 uses `Math.min(x.length, y.length)` and `.slice(-n)` on both arrays. If `sR.length !== bR.length`, it silently aligns to the *tail* — which masks (1) above and makes the misalignment invisible to logs.
3. `dailyReturns(aligned.a.slice(-253))` and `dailyReturns(aligned.b.slice(-253))` are recomputed *again* in the debug-fill at lines 601–602 — same bug, but at least it gives us the length to compare.

The probe will measure both side-lengths and dump enough data to confirm whether 1+2 is the actual cause.

## Step 1 — Extend the debug payload (additive, gated by `?debug=true`)

In `supabase/functions/compute-risk/index.ts`, inside the existing `if (debugMode) { ... }` block, **add** these fields without removing what's already there. Use the aligned arrays already in scope.

```ts
// --- Hypothesis A: explicit per-row return computation, both sides, with manual formula
const hypoA: Array<{
  i: number; date: string;
  stock_close_t: number; stock_close_prev: number; stock_return_formula: number;
  bench_close_t: number; bench_close_prev: number; bench_return_formula: number;
  same_prev_date: string;  // both should reference this exact date
}> = [];
// Build from alignedTuples (already has dates + closes)
for (let i = 1; i < alignedTuples.length; i++) {
  const prev = alignedTuples[i - 1];
  const cur  = alignedTuples[i];
  hypoA.push({
    i, date: cur.date,
    stock_close_t: cur.stock_close, stock_close_prev: prev.stock_close,
    stock_return_formula: (cur.stock_close - prev.stock_close) / prev.stock_close,
    bench_close_t: cur.bench_close, bench_close_prev: prev.bench_close,
    bench_return_formula: (cur.bench_close - prev.bench_close) / prev.bench_close,
    same_prev_date: prev.date,
  });
}

// --- Hypothesis B: scattered stale/forward-fill counters
let bench_zero = 0, stock_zero = 0, both_near_zero = 0, returns_equal = 0;
for (const r of hypoA) {
  if (r.bench_return_formula === 0) bench_zero++;
  if (r.stock_return_formula === 0) stock_zero++;
  if (Math.abs(r.stock_return_formula) < 1e-6 && Math.abs(r.bench_return_formula) < 1e-6) both_near_zero++;
  if (Math.abs(r.stock_return_formula - r.bench_return_formula) < 1e-9) returns_equal++;
}

// --- Hypothesis C: extreme stock returns (split/dividend artifacts)
const hypoC = hypoA
  .filter((r) => Math.abs(r.stock_return_formula) > 0.15)
  .map((r) => ({ date: r.date, prev: r.stock_close_prev, cur: r.stock_close_t, return: r.stock_return_formula }));

// --- Hypothesis D: literal beta numerator/denominator using the SAME arrays the code uses
const sR_dbg = dailyReturns(aligned.a.slice(-TRADING_DAYS_PER_YEAR - 1));
const bR_dbg = dailyReturns(aligned.b.slice(-TRADING_DAYS_PER_YEAR - 1));
const mB = mean(bR_dbg);
let cov_num = 0, var_num = 0;
const n = Math.min(sR_dbg.length, bR_dbg.length);
const sOff = sR_dbg.length - n, bOff = bR_dbg.length - n;
const mS_tail = mean(sR_dbg.slice(-n));
const mB_tail = mean(bR_dbg.slice(-n));
for (let i = 0; i < n; i++) {
  cov_num += (sR_dbg[sOff + i] - mS_tail) * (bR_dbg[bOff + i] - mB_tail);
  var_num += (bR_dbg[bOff + i] - mB_tail) ** 2;
}
const cov_div = n - 1, var_div = n - 1;
const beta_manual = (cov_num / cov_div) / (var_num / var_div);

// --- Side-length sanity (will expose drift caused by dailyReturns()'s prev>0 filter)
const length_audit = {
  aligned_a_len: aligned.a.length,           // stock closes after date intersection
  aligned_b_len: aligned.b.length,           // bench closes after date intersection
  hypoA_pairs: hypoA.length,                 // (intersection - 1)
  sR_len: sR_dbg.length,                     // returns from dailyReturns(aligned.a tail)
  bR_len: bR_dbg.length,                     // returns from dailyReturns(aligned.b tail)
  length_mismatch: sR_dbg.length !== bR_dbg.length,
  cov_uses_n: n,
  stock_slice_offset: sOff,                  // if >0, returns silently shifted in cov calc
  bench_slice_offset: bOff,
};

// Attach
(debugPayload as Record<string, unknown>).hypothesis_a_first_10 = hypoA.slice(0, 10);
(debugPayload as Record<string, unknown>).hypothesis_a_last_10  = hypoA.slice(-10);
(debugPayload as Record<string, unknown>).hypothesis_b_counts = {
  total_pairs: hypoA.length,
  bench_return_exactly_zero: bench_zero,
  stock_return_exactly_zero: stock_zero,
  both_near_zero_lt_1e6: both_near_zero,
  returns_exactly_equal: returns_equal,
  healthy_expectation: "fewer than 5 zero-return days out of ~660",
};
(debugPayload as Record<string, unknown>).hypothesis_c_extreme_stock_moves = hypoC;
(debugPayload as Record<string, unknown>).hypothesis_d_beta_math = {
  cov_numerator: cov_num, cov_divisor: cov_div, cov_value: cov_num / cov_div,
  var_numerator: var_num, var_divisor: var_div, var_value: var_num / var_div,
  beta_manual, beta_from_code: betaVal,
  beta_matches_code: Math.abs(beta_manual - betaVal) < 1e-9,
};
(debugPayload as Record<string, unknown>).length_audit = length_audit;
```

Total addition: ~70 lines, all inside the existing debug branch. No production-path changes.

## Step 2 — Deploy + invoke

1. `supabase--deploy_edge_functions` for `compute-risk`.
2. `supabase--curl_edge_functions` POST to `/compute-risk?debug=true` with `{ "symbol": "TCS", "benchmark": "NIFTYIT", "force_beta_refresh": true }`.

## Step 3 — Decision matrix on the returned payload

Evaluate in this order; first one that fires wins:

| Test | Fires when | Diagnosis | Proposed one-line fix |
|---|---|---|---|
| **Length audit** | `length_mismatch === true` OR `stock_slice_offset !== bench_slice_offset` OR either offset > 0 | Hypothesis A confirmed via the `dailyReturns()` `prev>0` filter desynchronizing arrays | Replace `dailyReturns` for the beta path with a paired version that walks both arrays together and emits returns only when both `prev > 0` |
| **Hypothesis A row-by-row** | `hypoA[i].same_prev_date` is consistent AND lengths match but `correlation` still ~0.3 | Off-by-one not at the indexing layer — recheck date join | Investigate `alignByDate` for duplicate-date handling |
| **Hypothesis B counts** | `bench_return_exactly_zero > 20` OR `stock_return_exactly_zero > 20` OR `both_near_zero > 20` | Forward-filled stale rows crushing variance/covariance | Drop rows where either return is < 1e-6 from the beta calc |
| **Hypothesis C** | Any single-day TCS `|return| > 0.15` not matching a known earnings/news date | FinEdge adjusted vs Dhan unadjusted mismatch (but TCS has no recent splits → unlikely) | Source closes from a single adjusted feed |
| **Hypothesis D** | `beta_manual !== betaVal` OR cov/var divisors differ | Math error in beta() / variance() / covariance() | Fix the offending divisor |
| **None fire** | All four clean but beta still 0.23 | Unknown — return the full 660-row aligned series as a CSV artifact and escalate to Super Agent | (n/a) |

## Step 4 — Deliverable to user

A single report containing:
1. Which hypothesis fired (one of A/B/C/D, or "none → escalate").
2. The 5–10 specific rows from the debug payload that prove it.
3. The proposed one-line fix.
4. **No code changes** — wait for approval.

If none fire: write `/mnt/documents/tcs_aligned_series.csv` with the full 660-row aligned tuples and emit a `<presentation-artifact>` tag for download, then escalate.

## Files touched

- `supabase/functions/compute-risk/index.ts` — additive debug-only block.

Approve to execute.
