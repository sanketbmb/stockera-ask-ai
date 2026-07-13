## Root cause (confirmed)
`stock-picker-daily-cron` Phase 3 (`fetchLiquidityForUniverse`) walks every surviving universe member strictly sequentially — 20-item chunks, but inside each chunk it `await`s one symbol at a time with a 200ms sleep. There is no concurrency cap and no burst limiter. Under load the shared `dhan-fetch` proxy trips its upstream rate limit; a symbol exhausts its 5 retries with `status='rate_limited'`, and the outcome bubbles up as a hard error before write-audit runs. Result: pg_cron dispatch succeeds nightly, but no batch has been written since 2026-07-06.

## File + range
`supabase/functions/stock-picker-daily-cron/index.ts` — inside `fetchLiquidityForUniverse` (lines 452–480). Add module-level constant `LIQUIDITY_CONCURRENCY = 4` just above the function.

## Unified diff
```diff
--- a/supabase/functions/stock-picker-daily-cron/index.ts
+++ b/supabase/functions/stock-picker-daily-cron/index.ts
@@ -449,6 +449,10 @@
+// Cap concurrent in-flight dhan-fetch calls during liquidity fan-out to avoid
+// tripping the upstream rate limit (root cause of missed batches since 2026-07-06).
+const LIQUIDITY_CONCURRENCY = 4;
+
 async function fetchLiquidityForUniverse(args: {
   members: Array<{ symbol: string; exchange: Exchange; dhan_security_id: string | null }>;
   fromDateIso: string;
   toDateIso: string;
   dhanFetchUrl: string;
   serviceKey: string;
 }): Promise<LiquidityFetchOutcome[]> {
-  const out: LiquidityFetchOutcome[] = [];
-  const CHUNK_SIZE = 20;
-  const INTRA_CALL_DELAY_MS = 200;
-  for (let i = 0; i < args.members.length; i += CHUNK_SIZE) {
-    const chunk = args.members.slice(i, i + CHUNK_SIZE);
-    for (const m of chunk) {
-      const outcome = await fetchLiquidityForSymbol({
-        symbol: m.symbol,
-        exchange: m.exchange,
-        dhanSecurityId: m.dhan_security_id,
-        fromDateIso: args.fromDateIso,
-        toDateIso: args.toDateIso,
-        dhanFetchUrl: args.dhanFetchUrl,
-        serviceKey: args.serviceKey,
-        maxRetries: 5,
-      });
-      out.push(outcome);
-      await sleep(INTRA_CALL_DELAY_MS);
-    }
-  }
-  return out;
+  const INTER_CHUNK_DELAY_MS = 200;
+  const out: LiquidityFetchOutcome[] = new Array(args.members.length);
+  for (let i = 0; i < args.members.length; i += LIQUIDITY_CONCURRENCY) {
+    const slice = args.members.slice(i, i + LIQUIDITY_CONCURRENCY);
+    const results = await Promise.all(
+      slice.map((m) =>
+        fetchLiquidityForSymbol({
+          symbol: m.symbol,
+          exchange: m.exchange,
+          dhanSecurityId: m.dhan_security_id,
+          fromDateIso: args.fromDateIso,
+          toDateIso: args.toDateIso,
+          dhanFetchUrl: args.dhanFetchUrl,
+          serviceKey: args.serviceKey,
+          maxRetries: 5,
+        })
+      )
+    );
+    for (let j = 0; j < results.length; j++) out[i + j] = results[j];
+    if (i + LIQUIDITY_CONCURRENCY < args.members.length) await sleep(INTER_CHUNK_DELAY_MS);
+  }
+  return out;
 }
```

Note: I inlined the `Promise.all` chunk loop instead of calling `runInChunks` so I can keep the existing 200ms pacing between bursts (preserves throttling character). Same shape as `runInChunks`, no new helper.

## Confirmation — nothing else touched
- `fetchLiquidityForSymbol` retry/backoff: **unchanged**
- `runInChunks`: **unchanged**
- Write-audit chunking + order (picks first, rejection last): **unchanged**
- Tenure RPC parallelization: **unchanged**
- Hysteresis math, sector filter, replay-hash, `writeResults` shape: **unchanged**
- All other functions (LTP, fundamentals, news sync): **unchanged**

## Deploy + verify plan
Since the diff is exactly the single narrow concurrency-limiter change requested:
1. Apply edit to `supabase/functions/stock-picker-daily-cron/index.ts`.
2. Deploy `stock-picker-daily-cron` via `supabase--deploy_edge_functions`.
3. Invoke it (`supabase--curl_edge_functions` POST, `invoked_by: 'manual_verify_liquidity_fix'`).
4. Verify: read `cron_run_log` latest row (status, batch_id, phase timings) and confirm a new row exists in `stock_picker_batches` after 2026-07-06. Report both back.
