## PLAN (corrected)

Same scope as before — only the cache-read block is fixed to match the currently deployed code byte-for-byte. All other edits are unchanged.

**Anchors left untouched (identifying lines):**
- Line 70–80: `DailyCronRequest` (already has `resume_from`).
- Line 83: `BOOTSTRAP_CHUNK_SIZE = 100`.
- Line 502–531: `fetchLiquidityForUniverse` body (only the concurrency constant changes).
- `logCronRun`, `dhanFetchUrl`, `fromDateIso`, `toDateIso` derivation.
- Entire BOOTSTRAP branch (lines 1064–1137).
- **LIVE branch cache section (lines 1140–1225): byte-for-byte identical to today** — `cacheByKeyDate`, `cacheMaxRecord`, composite `${symbol}|${exchange}` key, `MIN_OK_ROWS_FOR_CACHE_HIT = 15`, `minRecordDateIso`, and the exact guard `rows && rows.length >= MIN_OK_ROWS_FOR_CACHE_HIT && maxRec && maxRec >= minRecordDateIso`.
- `fetchOutcomes = [...cachedOutcomes, ...liveOutcomes]` line and the final `phase_liquidity_fetch` / `phase_liquidity` diagnostic logs (they still run on the final chunk).
- Phase 4–8 (exclusion → abort → hash → write-audit → cron_run_log).

**Edits:**
1. Line 83 area — add `const LIVE_CHUNK_SIZE = 50;`.
2. Line 500 — `LIQUIDITY_CONCURRENCY` `1` → `4`.
3. Line 1209 — `const missMembers` → `let missMembers` (**this is the ONLY line that changes inside the cache block**).
4. Lines 1227–1243 — replace the unconditional live fetch + trailing `appendLiquidity(liveOutcomes)` with the chunked-resume block: sort `missMembers` by `${symbol}|${exchange}`, apply `body.resume_from` filter, slice `LIVE_CHUNK_SIZE`, fetch the chunk, `appendLiquidity` immediately, then if `!isFinalChunk` write `cron_run_log(phase='live_liquidity_chunk')`, self-continue via `pg_net.http_post`, and return `chunk_finished` HTTP 200. On the final chunk fall through so the existing `fetchOutcomes` line and diagnostic logs run unchanged.

BUG-1 and BUG-2 fixes: the cache-hit loop stays as deployed (`cacheByKey`, composite key, `rows.length >= MIN_OK_ROWS_FOR_CACHE_HIT && maxRec && maxRec >= minRecordDateIso`). No `cachedRowsBySymbol`, no `rows.length > 0`, no bare-`symbol` keying.

## UNIFIED DIFF

```diff
--- a/supabase/functions/stock-picker-daily-cron/index.ts
+++ b/supabase/functions/stock-picker-daily-cron/index.ts
@@ -80,8 +80,9 @@ interface DailyCronRequest {
 }
 
 // --- CHUNKED BOOTSTRAP HELPERS ---
 const BOOTSTRAP_CHUNK_SIZE = 100;
+const LIVE_CHUNK_SIZE = 50;
 
 // REPAIR 3: direct SELECT against the _latest view; no RPC dependency.
 async function getBootstrapFreshness(
   supabase: SupabaseClient
@@ -497,7 +498,7 @@ async function fetchLiquidityForSymbol(args: {
 
 // Cap concurrent in-flight dhan-fetch calls during liquidity fan-out to avoid
 // tripping the upstream rate limit (root cause of missed batches since 2026-07-06).
-const LIQUIDITY_CONCURRENCY = 1;
+const LIQUIDITY_CONCURRENCY = 4;
 
 async function fetchLiquidityForUniverse(args: {
   members: Array<{ symbol: string; exchange: Exchange; dhan_security_id: string | null }>;
@@ -1206,26 +1207,88 @@ Deno.serve(async (req: Request) => {
     }
     const cachedOutcomes: LiquidityFetchOutcome[] = [];
-    const missMembers: typeof canonicalMembers = [];
+    let missMembers: typeof canonicalMembers = [];
     for (const m of canonicalMembers) {
       const key = `${m.symbol}|${m.exchange}`;
       const rows = cacheByKey.get(key);
       const maxRec = cacheMaxRecord.get(key);
       if (rows && rows.length >= MIN_OK_ROWS_FOR_CACHE_HIT && maxRec && maxRec >= minRecordDateIso) {
         cachedOutcomes.push({ symbol: m.symbol, exchange: m.exchange as Exchange, status: 'ok', rows });
       } else {
         missMembers.push(m);
       }
     }
     const cacheElapsedMs = Date.now() - tCache;
     console.log(
       `phase_liquidity_cache: total=${canonicalMembers.length} ` +
       `hits=${cachedOutcomes.length} misses=${missMembers.length} ` +
       `elapsed_ms=${cacheElapsedMs}`
     );
 
-    const liveOutcomes: LiquidityFetchOutcome[] = missMembers.length > 0
+    // --- Phase 2S.4: chunked-resume for live liquidity misses ---
+    // Sort deterministically so resume_from cursor advances monotonically.
+    missMembers.sort((a, b) =>
+      `${a.symbol}|${a.exchange}`.localeCompare(`${b.symbol}|${b.exchange}`)
+    );
+    if (body.resume_from) {
+      missMembers = missMembers.filter((m) => m.symbol > body.resume_from!);
+    }
+    const chunkMisses = missMembers.slice(0, LIVE_CHUNK_SIZE);
+    const isFinalChunk = chunkMisses.length === missMembers.length;
+
+    const liveOutcomes: LiquidityFetchOutcome[] = chunkMisses.length > 0
       ? await fetchLiquidityForUniverse({
-          members: missMembers.map((m) => ({ symbol: m.symbol, exchange: m.exchange, dhan_security_id: m.dhan_security_id })),
+          members: chunkMisses.map((m) => ({ symbol: m.symbol, exchange: m.exchange, dhan_security_id: m.dhan_security_id })),
           fromDateIso,
           toDateIso,
           dhanFetchUrl,
           serviceKey: SUPABASE_SERVICE_ROLE_KEY,
         })
       : [];
+    if (liveOutcomes.length > 0) await appendLiquidity(supabase, liveOutcomes);
+
+    if (!isFinalChunk) {
+      const next_resume_symbol = chunkMisses[chunkMisses.length - 1].symbol;
+      await logCronRun(supabase, {
+        batch_id: batchId,
+        mode: body.mode,
+        status: 'chunk_finished',
+        started_at: startedAt,
+        finished_at: new Date().toISOString(),
+        metrics: {
+          phase: 'live_liquidity_chunk',
+          live_chunk_size: LIVE_CHUNK_SIZE,
+          chunk_misses_processed: chunkMisses.length,
+          cache_hits: cachedOutcomes.length,
+          live_ok_this_chunk: liveOutcomes.filter((o) => o.status === 'ok').length,
+          next_resume_symbol,
+          universe_size: canonicalMembers.length,
+        },
+      });
+
+      // Self-continue via pg_net (survives parent worker teardown).
+      const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3aWN3bW51dHlhaHNjYnJlcXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzE0NjcsImV4cCI6MjA5NDUwNzQ2N30.aUu2WKdHWnlvFbnBxynFJaGLYq_tlpptkPf5CiwSQZA';
+      const continueBody: DailyCronRequest = {
+        mode:         body.mode,
+        invoked_by:   body.invoked_by,
+        seed_version: body.seed_version,
+        run_date_ist: runDateIst,
+        resume_from:  next_resume_symbol,
+        risk_profile: body.risk_profile,
+      };
+      await supabase
+        .schema('net' as any)
+        .rpc('http_post', {
+          url:                  `${SUPABASE_URL}/functions/v1/stock-picker-daily-cron`,
+          body:                 continueBody as unknown as Record<string, unknown>,
+          params:               {},
+          headers:              {
+            'Content-Type':  'application/json',
+            'apikey':        ANON_KEY,
+            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
+          },
+          timeout_milliseconds: 180000,
+        });
+
+      return new Response(JSON.stringify({
+        ok: true,
+        batch_id:               batchId,
+        mode:                   body.mode,
+        status:                 'chunk_finished',
+        next_resume_symbol,
+        chunk_misses_processed: chunkMisses.length,
+        cache_hits:             cachedOutcomes.length,
+      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
+    }
+
     const fetchOutcomes: LiquidityFetchOutcome[] = [...cachedOutcomes, ...liveOutcomes];
     logDiagnosticPhase(batchId, 'phase_liquidity_fetch', 'done', tLiquidity, {
       outcomes: fetchOutcomes.length,
       cache_hits: cachedOutcomes.length,
       live_fetches: liveOutcomes.length,
     });
-
-    if (liveOutcomes.length > 0) await appendLiquidity(supabase, liveOutcomes);
```

Cache-hit loop is byte-identical to the currently deployed code except for `const` → `let` on `missMembers`. `cacheByKey` and `cacheMaxRecord` (built at lines 1184–1207) are untouched; the composite `${symbol}|${exchange}` key and the `MIN_OK_ROWS_FOR_CACHE_HIT`/`minRecordDateIso` guard are preserved verbatim. On the final chunk, the trailing `appendLiquidity(liveOutcomes)` behavior is equivalent to today's single-shot path because prior-chunk rows are already in `stock_picker_liquidity_20d` and re-enter as `cachedOutcomes` on the resumed invocation.

STOP. Awaiting your `APPROVED` before deploying.