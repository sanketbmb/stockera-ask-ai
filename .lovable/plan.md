
## Goal

Validate disputed Dhan index `security_id` mappings against the **live Dhan API** (not our own seed migration) before changing `BENCHMARK_MAP` in `compute-risk`. Then apply the verified fix, re-run all 5 stocks, and add a defensive daily sanity check so a future Dhan re-mapping cannot silently corrupt Beta in production.

## Step 1 — Verification probes (no code changes yet)

Use `supabase--curl_edge_functions` to call `dhan-fetch` seven times with a 5-day daily window ending today. Body for each call:

```json
{
  "endpoint": "historical",
  "securityId": "<ID>",
  "exchangeSegment": "IDX_I",
  "params": {
    "instrument": "INDEX",
    "fromDate": "<today-7>",
    "toDate":   "<today>",
    "interval": "1D"
  }
}
```

Probes:

| Index        | security_id | Expected close (May 2026) | Purpose |
|--------------|-------------|---------------------------|---------|
| NIFTYIT      | 27          | 38,000–39,000             | Verify proposed ID |
| NIFTYAUTO    | 35          | 23,000–24,000             | Verify proposed ID |
| NIFTYPHARMA  | 31          | 21,000–22,000             | Verify proposed ID |
| NIFTYFMCG    | 23          | 55,000–57,000             | Verify proposed ID |
| NIFTY100     | 17          | 24,000–25,000             | Verify proposed ID |
| NIFTY        | 13          | 24,000–25,000             | Confirm `interval:"1D"` removes weekend rows |
| BANKNIFTY    | 25          | 52,000–55,000             | Confirm `interval:"1D"` removes weekend rows |

For each: report latest close, candle count, and list any non-weekday dates.

## Step 2 — Decision tree (gate before fix)

- **All 7 close prices land in expected bands AND no Sunday/Saturday rows for NIFTY/BANKNIFTY** → proceed to Step 3.
- **Any ID returns a wrong-magnitude close** → STOP. Fetch `https://images.dhan.co/api-data/api-scrip-master.csv`, grep for the index name, report the matching row(s) back in chat. Do not change `BENCHMARK_MAP` until user picks the correct ID.
- **Daily candles still contain weekend rows even with `interval:"1D"`** → STOP. The interval param isn't the (full) fix. Dump the raw Dhan response for one probe and reassess.
- **Levels slightly off (1–3%)** → accepted, proceed.

Present the probe table + decision in chat and wait for user approval before any code edits.

## Step 3 — Apply fix (only after Step 2 passes)

Edit `supabase/functions/compute-risk/index.ts`:

1. Update `BENCHMARK_MAP` entries for `NIFTYIT`, `NIFTYAUTO`, `NIFTYPHARMA`, `NIFTYFMCG`, `NIFTY100` to the verified IDs (27, 35, 31, 23, 17 — assuming probes pass).
2. In `fetchBenchmarkFromDhan()` add `interval: "1D"` to the `params` object passed to `dhan-fetch`.
3. Keep the existing `?debug=true` instrumentation in place (don't revert it yet — still useful for post-fix verification).

Then:
4. Purge `benchmark_cache` rows for the affected indices via `supabase--migration` (DELETE WHERE id IN (...)).
5. Deploy `compute-risk` via `supabase--deploy_edge_functions`.

## Step 4 — Re-run all 5 stocks with `?force_beta_refresh=true`

Curl `compute-risk` for: RELIANCE/NIFTY, TCS/NIFTYIT, INFY/NIFTYIT, HDFCBANK/BANKNIFTY, ICICIBANK/BANKNIFTY.

Success bands (any miss → return debug payload, do not tune):
- TCS, INFY vs NIFTYIT: **0.85–1.15**
- HDFCBANK, ICICIBANK vs BANKNIFTY: **0.85–1.15**
- RELIANCE vs NIFTY: **0.9–1.2**
- `intersection_days` rises from ~506 → ~660 for all
- Zero weekend rows in any aligned tuple

Report the new summary table.

## Step 5 — Defensive sanity check (add in same deploy as Step 3)

In `compute-risk/index.ts`, add a once-per-day-per-benchmark check. When `fetchBenchmarkFromDhan` returns, compare the latest close against a configurable sane range and log a `BENCHMARK_DATA_SUSPECT` warning if outside. Implementation outline:

```ts
const BENCHMARK_SANE_RANGE: Record<string, [number, number]> = {
  NIFTY:       [20000, 30000],
  BANKNIFTY:   [45000, 60000],
  NIFTYIT:     [30000, 45000],
  NIFTYAUTO:   [18000, 28000],
  NIFTYPHARMA: [17000, 25000],
  NIFTYFMCG:   [45000, 65000],
  NIFTY100:    [20000, 28000],
};

function assertBenchmarkSane(symbol: string, latestClose: number) {
  const range = BENCHMARK_SANE_RANGE[symbol];
  if (!range) return;
  const [lo, hi] = range;
  if (latestClose < lo || latestClose > hi) {
    console.warn(
      `BENCHMARK_DATA_SUSPECT symbol=${symbol} latest_close=${latestClose} ` +
      `expected=[${lo},${hi}] — possible Dhan security_id remap or wrong instrument`,
    );
  }
}
```

Call it once per `fetchBenchmarkFromDhan` invocation after candles parse. Non-blocking — proceeds with the (possibly suspect) data so a transient mis-range doesn't take risk computation offline; the warning surfaces in `supabase--edge_function_logs` for monitoring.

Ranges are intentionally wide (±25%) so normal market moves don't trip them; only an order-of-magnitude wrong instrument or a re-mapped ID will fire.

## Files touched (Step 3 + 5 only)

- `supabase/functions/compute-risk/index.ts` — `BENCHMARK_MAP` IDs, `interval:"1D"`, sanity-check helper + call site.
- New migration: `DELETE FROM benchmark_cache WHERE symbol IN ('NIFTYIT','NIFTYAUTO','NIFTYPHARMA','NIFTYFMCG','NIFTY100','NIFTY','BANKNIFTY');` (or equivalent by `id`).

## Out of scope (deferred)

- Task 2.4 progression — still blocked until success bands hit.
- Removing `?debug=true` instrumentation — keep one more cycle, prune after Beta values are confirmed stable.

Approve to execute Step 1 probes.
