
## Investigation findings

### Bug 1 — "All pillars show 0"

I cannot reproduce a code-level binding bug. The current UI is already wired correctly:

`src/components/analysis/StockAnalysisReport.tsx`
- L602  `ScoreRing score={final_verdict.overall_score}`
- L612  `const s = score_breakdown[m.key]; <ScoreBar value={s ?? null} ...>`
- L627  `<ScoreBar label="Sentiment" value={score_breakdown.sentiment_score ?? null} ...>`

`ScoreBar` (L181–234) and `ScoreRing` (L259–306) treat only `null/undefined` as missing, real `0` animates as `0`. These were the changes we shipped in the previous polish pass.

The mismatch you saw on screen ("summary text says technicals 35, momentum 29, risk 63, but bars show 0") points to the **orchestrator data layer**, not the component:

`supabase/functions/generate-stock-analysis/index.ts` L552–558

```ts
score_breakdown: {
  technical_score:   scores.technical   ?? 0,   // <- null collapses to 0
  fundamental_score: scores.fundamental ?? 0,
  risk_score:        scores.risk        ?? 0,
  momentum_score:    scores.momentum    ?? 0,
  sentiment_score:   scores.sentiment   ?? 0,
},
```

The `?? 0` was a legacy guard against `null` and is the only place that could turn legitimate scores into 0 on the wire. But the `summary_reason` builder (L435–452) reads the **same `scores` object** and clearly shows non-null numbers — so the data is alive at that point in the same request.

Most likely root cause is the screenshot is a stale cached response generated **before** the previous polish-pass deploy (when ScoreBar used `value || 0` and ScoreRing missed `?? null`). Two corroborating signals:
1. `useQuery` has `staleTime: 60_000` and the route key doesn't include report version.
2. No code change has been made to the orchestrator since the previous all-green test run that printed real pillar numbers in the curl output.

### Bug 2 — Wrong / stale LTP

Confirmed: there is **no LTP refresh cron**. The only cron in the project:

```
jobname                       schedule       active
refresh-stock-master-daily    30 1 * * *     true
```

LTP read path (`compute-technicals/index.ts` L231–247): pulls finedge **daily-quotes**, normalises into daily candles, takes the **last close** as `current_price`. There is no intraday tick, no Dhan fallback, no cache TTL — every report just re-reads finedge EOD. So during market hours the header shows yesterday's close (or today's last EOD-published close), which is exactly the ~₹1,321 vs live ~₹1,326 gap you saw.

The header also stringifies `as_of_date` (L536) through `fmtDateShort` which is date-only — no IST time component.

## Proposed fixes

### Fix A — Pillar binding hardening (defensive, low risk)

1. **Stop collapsing nulls in `score_breakdown`** (orchestrator):
   change `?? 0` → keep `null` for all five `*_score` fields so the UI can honour its "—" path.
2. **Cache-bust the client query** when payload contract changes: bump the query key (`["stock-analysis", symbol, horizon, includeNews, "v2"]`) and lower `staleTime` to `30_000`.
3. After deploy, verify on RELIANCE intraday that bars render 35 / 29 / 63 / fundamental / sentiment row.

### Fix B — LTP freshness

This needs a **product decision before I touch it** — see clarifying question below. Two viable shapes:

- **B1 (server-side cron, recommended):** new `refresh-ltp` edge function that calls Dhan `/quote` for a watchlist of recently-queried symbols every 1 min during market hours (09:15–15:30 IST, Mon–Fri), writes to a new `ltp_cache(symbol, ltp, fetched_at)` table; `compute-technicals` reads from `ltp_cache` if `fetched_at` is within 60s, else falls back to live Dhan call, else falls back to finedge close. Header renders `as of HH:MM IST` from `fetched_at`.
- **B2 (per-request live, cheaper to ship):** modify `compute-technicals` to call Dhan `/quote` directly inside the request; cache the result in-memory per-request only. Header renders the call time. Skips cron/table work but adds ~150–400ms latency to every report.

Both end with the same header change (time stamp + source pill: `Dhan live · 14:32 IST` or `finedge EOD · 31 May`).

## Clarifying question (need answer before I build)

**Which LTP strategy do you want me to implement?**
1. **B1 — Cron-refreshed `ltp_cache` table + Dhan fallback** (heavier, true 30–60s freshness, less Dhan quota usage)
2. **B2 — Per-request live Dhan call inside `compute-technicals`** (lighter, freshness == request time, more Dhan quota usage)
3. **Just add the timestamp now; defer the freshness fix** (header shows `finedge EOD · DD MMM` truthfully, no behaviour change, unblocks UI bug verification)

Once you pick, I'll do Fix A + the chosen Fix B in a single build pass and re-test RELIANCE intraday end-to-end.
