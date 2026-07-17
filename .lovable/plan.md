## PLAN

File: `supabase/functions/sync-ohlcv-history/index.ts` (only)

Anchor edits:

1. **Insert helper before `corsHeaders` (line 18)**: add `latestCompletedTradingDayIst(supabase)` that computes today's IST date, queries `stock_picker_trading_calendar` for latest `is_trading_day = true` where `calendar_date <= todayIst`, `.order desc`, `.limit(1)`, `.maybeSingle()`, falls back to `todayIst` on error/empty.
2. **Replace freshness cutoff block (lines 502–508)** inside `nifty500_chunk`:
  - default `3 → 1`, min `1 → 0`
  - anchor cutoff to `latestCompletedTradingDayIst(supabase)` minus `freshnessDays` (via `setUTCDate`)
3. **Replace stop condition (lines 586–587)**:
  - `stopReached = exhausted`
  - `stopReason = stopReached ? 'target_exhausted' : null`
4. **Extend cursor telemetry config_value (line 601 area)**:
  - `coverage_rule` → `'rows_ge_20_and_fresh_within_days_ist'`
  - add `latest_trading_day_ist: latestTradingDayIso`
  - add `fresh_cutoff_iso: freshCutoffIso`
  - keep all existing fields

Also update the mirror `coverage_rule` in the response body (line 627) to the `_ist` variant so no `'rows_ge_20_and_fresh_within_days'` old string lingers (AC: no `coverage_500` remains; the `_ist` suffix requirement targets the telemetry — updating the response too avoids a stale mirror in the same file).

Untouched: default branch, `chunk` mode, Twelve Data fallback, `isCleanRow`, `universe_override`, `isoDate`, `jnum`, `jbool`, `force_refresh` behavior, config-key names, all other files, migrations, cron jobs.

---

## FULL DIFF

```diff
--- a/supabase/functions/sync-ohlcv-history/index.ts
+++ b/supabase/functions/sync-ohlcv-history/index.ts
@@ -15,6 +15,26 @@ const TD_URL = 'https://api.twelvedata.com/time_series';
 const MIN_USABLE_ROWS = 100;
 
+// Returns the latest completed IST trading day (YYYY-MM-DD) per
+// stock_picker_trading_calendar. Falls back to today-in-IST on any
+// error or empty result — never throws, never blocks the job.
+async function latestCompletedTradingDayIst(
+  supabase: ReturnType<typeof createClient>,
+): Promise<string> {
+  const nowIst = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
+  const todayIst = nowIst.toISOString().slice(0, 10);
+  try {
+    const { data, error } = await supabase
+      .from('stock_picker_trading_calendar')
+      .select('calendar_date')
+      .eq('is_trading_day', true)
+      .lte('calendar_date', todayIst)
+      .order('calendar_date', { ascending: false })
+      .limit(1)
+      .maybeSingle();
+    if (error || !data?.calendar_date) return todayIst;
+    return data.calendar_date as string;
+  } catch {
+    return todayIst;
+  }
+}
+
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
@@ -499,13 +519,15 @@
       // Stale symbols re-enter `pending` so chunk mode can refresh them.
       // `force_refresh: true` in the request body bypasses the coverage set entirely.
       const forceRefresh = jbool((body as Record<string, unknown>)?.force_refresh);
-      const freshnessDays = Math.max(
-        1,
-        Math.floor(jnum(cfg.get('ohlcv_coverage_freshness_days'), 3)),
-      );
-      const freshCutoff = new Date();
-      freshCutoff.setUTCDate(freshCutoff.getUTCDate() - freshnessDays);
-      const freshCutoffIso = isoDate(freshCutoff);
+      const freshnessDays = Math.max(
+        0,
+        Math.floor(jnum(cfg.get('ohlcv_coverage_freshness_days'), 1)),
+      );
+      const latestTradingDayIso = await latestCompletedTradingDayIst(supabase);
+      const cutoffDate = new Date(latestTradingDayIso + 'T00:00:00Z');
+      cutoffDate.setUTCDate(cutoffDate.getUTCDate() - freshnessDays);
+      const freshCutoffIso = isoDate(cutoffDate);
 
       const coveredSet = new Set<string>();
@@ -583,8 +605,8 @@
       const nextIdx = startIdx + attempted;
       const cumulative = skippedAlready + newlyCovered;
       const exhausted = nextIdx >= pending.length;
-      const stopReached = cumulative >= 500 || exhausted;
-      const stopReason = stopReached ? (cumulative >= 500 ? 'coverage_500' : 'target_exhausted') : null;
+      const stopReached = exhausted;
+      const stopReason = stopReached ? 'target_exhausted' : null;
 
       await supabase.from('stock_picker_runtime_config').upsert({
         config_key: 'ohlcv_n500_cursor',
@@ -598,10 +620,12 @@
           cumulative_symbols_20plus: cumulative,
           stop_reached: stopReached,
           stop_reason: stopReason,
-          coverage_rule: 'rows_ge_20_and_fresh_within_days',
+          coverage_rule: 'rows_ge_20_and_fresh_within_days_ist',
           coverage_freshness_days: freshnessDays,
           force_refresh: forceRefresh,
           stale_symbols_now_pending: staleNowPending.length,
+          latest_trading_day_ist: latestTradingDayIso,
+          fresh_cutoff_iso: freshCutoffIso,
         },
         description: 'Phase 2S.3-FIX-OHLCV-EXPANSION Nifty500 backfill cursor',
         updated_at: new Date().toISOString(),
@@ -624,7 +648,7 @@
         stop_reached: stopReached,
         stop_reason: stopReason,
         elapsed_ms: Date.now() - t0n,
-        coverage_rule: 'rows_ge_20_and_fresh_within_days',
+        coverage_rule: 'rows_ge_20_and_fresh_within_days_ist',
         coverage_freshness_days: freshnessDays,
         force_refresh: forceRefresh,
         symbols_covered_by_count_only: coveredByCountOnly.size,
```

  
note : *Approved. One optional refinement: compute todayIst using nowIst.getUTCFullYear/getUTCMonth/getUTCDate rather than toISOString().slice(0,10), to avoid a UTC-boundary off-by-one. Apply it if trivial, otherwise proceed.*

STOP — awaiting `APPROVED` before deploying.