## Findings

`supabase/functions/marketaux-fetch/index.ts` is a thin passthrough wrapper. It does NOT hardcode `limit: 3` anywhere — `limit` is forwarded via the caller's `params` object (lines 57–62). There are also no tier-related comments referencing "free tier 100 calls" in the file. So functionally the wrapper already supports any `limit` value the Basic plan allows.

The only meaningful update on the wrapper side is documentation, so future callers (compute-sentiment, future scoring modules) know the new ceiling.

## Changes

### 1. `supabase/functions/marketaux-fetch/index.ts`
Replace the top header comment with explicit tier documentation:

```ts
// Marketaux news API wrapper (thin passthrough)
// Plan: Basic ($24/mo) — 2,500 calls/day, up to 20 articles per call.
// Callers control `limit` via params (default recommendation: 20).
// Endpoints: news/all, news/by-symbol
```

No logic change. No hardcoded limit exists to remove. `limit` continues to be forwarded verbatim through `params`.

### 2. Deploy
Deploy `marketaux-fetch` so the (doc-only) change is live and we can confirm the function is healthy under the new `MARKETAUX_API_TOKEN` you'll rotate manually.

### 3. Record budget constants for Task 2.5 (not implemented yet)
Stash the new thresholds in `.lovable/plan.md` (or a short note in this turn's response) so they're locked in before Task 2.5:

- `MARKETAUX_DAILY_LIMIT = 2500`
- `ALERT_THRESHOLD = 2000` (was 80)
- `CONSERVATION_MODE_THRESHOLD = 2300` (was 95)
- Default `limit` per call = `20` (was 3)
- `sentiment_cache.ttl_hours` stays at `6`

These will be applied inside `compute-sentiment/index.ts` when you green-light Task 2.5 — not now.

## Out of scope (per your instruction)
- No work on `compute-sentiment/index.ts`.
- No DB migration for `sentiment_cache` / `marketaux_usage_log` yet (those land with Task 2.5).
- You handle the Marketaux subscription + secret rotation manually.

## Verification
After deploy, a single sanity curl to `marketaux-fetch` with `endpoint: "news/by-symbol"`, `symbols: "RELIANCE.NS"`, `params: { limit: 20 }` should return 20 articles (proving the Basic plan key is live and the wrapper forwards `limit` correctly). I'll run that check and report the article count back before standing down.
