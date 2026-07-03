# PHASE CRON.WINDOW.FIX — Plan

## Goal
Stop the WallClockTime kill in `stock-picker-daily-cron` by widening the liquidity cache window from 30 days to 60 days, turning ~376 false cache misses into cache hits.

## Scope Lock
- **Only one file changes:** `supabase/functions/stock-picker-daily-cron/index.ts`
- **Only one line changes:** line 983
- No DB migration
- No config change
- No schedule change
- No change to `minRecordDateIso`, `MIN_OK_ROWS_FOR_CACHE_HIT`, `FRESH_RECORD_LOOKBACK_DAYS`, or the bootstrap branch internals

## Confirmed Current State
- Git working tree: clean
- Target line exists at `supabase/functions/stock-picker-daily-cron/index.ts:983`
- `MIN_OK_ROWS_FOR_CACHE_HIT = 15` at line 1069 — untouched
- `FRESH_RECORD_LOOKBACK_DAYS = 5` at line 1068 — untouched
- `minRecordDateIso` derived at lines 1071-1072 — untouched

## Diff

```diff
--- a/supabase/functions/stock-picker-daily-cron/index.ts
+++ b/supabase/functions/stock-picker-daily-cron/index.ts
@@ -980,7 +980,7 @@
     const today = new Date();
     const toDateIso = today.toISOString().slice(0, 10);
     const fromDate = new Date(today);
-    fromDate.setDate(fromDate.getDate() - 30);
+    fromDate.setDate(fromDate.getDate() - 60);
     const fromDateIso = fromDate.toISOString().slice(0, 10);
```

## Why This Is Safe
- `fromDateIso` is used consistently for the warehouse cache read and for the Dhan live-fetch fallback in the same phase.
- Widening the date window only increases the chance of finding ≥15 rows; it does not change the cache-hit acceptance criteria (`MIN_OK_ROWS_FOR_CACHE_HIT` stays 15, and freshness still requires the most recent row within 5 days).
- The line sits before the `mode === 'bootstrap'` branch, so the change also widens the bootstrap fetch window; per your confirmation, this is acceptable.

## STOP-Gate
Awaiting explicit approval before applying the change. No files will be edited and no function will be deployed until you approve.