## Root cause (unchanged)

Single fat `stock-picker-write-audit` POST (1 rejection + ~490 picks) exceeds child edge wall-clock → EarlyDrop → `writeResults` undefined → cron 500 at `if (!writeResults.ok)`. No live batch since 2026-07-06.

## File changed (only)

`supabase/functions/stock-picker-daily-cron/index.ts` — nothing else.

## Line ranges changed

1. Widen `WriteAuditResponse.results` element type at L567–L571 so the aggregated array preserves the full per-op shape (`op, ok, id?, deduped?, error?`).
2. Insert `runInChunks` helper after L249.
3. Replace serial tenure loop at L1454–L1470 with 10-wide parallel + tenure short-circuit when `hMinTenure <= 0`.
4. Replace single write-audit POST at L1554–L1569 with **pick chunks first (100 ops each), rejection last**, aggregating full per-op results.

No other lines touched.

## Full unified diff — `supabase/functions/stock-picker-daily-cron/index.ts`

```diff
@@ -565,10 +565,17 @@
 }
 
 interface WriteAuditResponse {
   ok: boolean;
-  results?: Array<{ op: string; id: string }>;
+  // Per-op results from stock-picker-write-audit. Kept structurally identical
+  // to what the child function returns (op, ok, id?, deduped?, error?) so the
+  // aggregated shape after chunked fan-out matches the pre-hotfix response.
+  results?: Array<{
+    op: string;
+    ok: boolean;
+    id?: string;
+    deduped?: boolean;
+    error?: string;
+  }>;
   error?: string;
 }
@@ -247,6 +254,22 @@ async function invokeFunction<T>(
   }
   return parsed as T;
 }
+
+// ---------------------------------------------------------------------------
+// Small concurrency helper — run async tasks in fixed-size waves.
+// Preserves input order in the returned array.
+// ---------------------------------------------------------------------------
+async function runInChunks<TIn, TOut>(
+  items: TIn[],
+  chunkSize: number,
+  worker: (item: TIn, index: number) => Promise<TOut>,
+): Promise<TOut[]> {
+  const out: TOut[] = new Array(items.length);
+  for (let i = 0; i < items.length; i += chunkSize) {
+    const slice = items.slice(i, i + chunkSize);
+    const results = await Promise.all(slice.map((it, j) => worker(it, i + j)));
+    for (let j = 0; j < results.length; j++) out[i + j] = results[j];
+  }
+  return out;
+}
@@ -1451,21 +1474,37 @@
     // 5. Evaluate dropped incumbents for reinstatement
     const droppedIncumbents = [...yesterdayIncumbents].filter((k) => !cohort.has(k));
     type Candidate = { key: string; surv: Surv | null; score: number; margin: number; hardExcluded: boolean; tenure: number };
-    const evalCand: Candidate[] = [];
-    for (const k of droppedIncumbents) {
-      const [sym, exch] = k.split('|');
-      const surv = includedSurvivors.find((s) => s.symbol === sym && s.exchange === exch) ?? null;
-      const hardExcluded = !surv;
-      const sc = surv ? (scoreByKey.get(k) ?? -Infinity) : -Infinity;
-      let tenure = 0;
-      if (!hardExcluded) {
-        try {
-          const { data: tenureVal } = await supabase.rpc('sp_pick_tenure_days', {
-            p_symbol: sym, p_exchange: exch, p_before_batch: batchId, p_max_lookback: 20,
-          });
-          tenure = Number(tenureVal ?? 0);
-        } catch { tenure = 0; }
-      }
-      evalCand.push({ key: k, surv, score: sc, margin: sc - cutoff, hardExcluded, tenure });
-    }
+    // Short-circuit: when the tenure gate is disabled (hMinTenure <= 0) the
+    // `c.tenure < hMinTenure` predicate below cannot be satisfied by any
+    // non-negative tenure, so we skip the RPC hop entirely and treat tenure
+    // as effectively infinite. Band / churn / trim semantics unchanged.
+    const tenureGateActive = hMinTenure > 0;
+    const evalCand: Candidate[] = await runInChunks(droppedIncumbents, 10, async (k) => {
+      const [sym, exch] = k.split('|');
+      const surv = includedSurvivors.find((s) => s.symbol === sym && s.exchange === exch) ?? null;
+      const hardExcluded = !surv;
+      const sc = surv ? (scoreByKey.get(k) ?? -Infinity) : -Infinity;
+      let tenure = 0;
+      if (!hardExcluded && tenureGateActive) {
+        try {
+          const { data: tenureVal } = await supabase.rpc('sp_pick_tenure_days', {
+            p_symbol: sym, p_exchange: exch, p_before_batch: batchId, p_max_lookback: 20,
+          });
+          tenure = Number(tenureVal ?? 0);
+        } catch { tenure = 0; }
+      } else if (!hardExcluded && !tenureGateActive) {
+        // Gate disabled — force `tenure < hMinTenure` to be false so the
+        // tenure-hold reinstate branch is never taken.
+        tenure = Number.POSITIVE_INFINITY;
+      }
+      return { key: k, surv, score: sc, margin: sc - cutoff, hardExcluded, tenure };
+    });
@@ -1551,19 +1590,80 @@
       writeAuditHeaders['x-sp1-internal-secret'] = internalSecret;
     }
 
-    const writeResults = await invokeFunction<WriteAuditResponse>(
-      SUPABASE_URL,
-      SUPABASE_SERVICE_ROLE_KEY,
-      'stock-picker-write-audit',
-      {
-        invoked_by: body.invoked_by,
-        operations: [
-          { op: 'write_batch_rejection', params: rejectionParams },
-          ...pickAuditOps,
-        ],
-      },
-      writeAuditHeaders
-    );
-    if (!writeResults.ok) {
-      throw new Error(`cron: write-audit failed: ${writeResults.error}`);
+    // SP-1 hotfix: chunk the write-audit fan-out to stay inside the child
+    // function's wall-clock.
+    //
+    // ORDER MATTERS: pick_audit chunks are sent FIRST (sequentially, 100 ops
+    // per call). The single write_batch_rejection call is sent LAST, and only
+    // after every pick chunk has succeeded. stock-recommendation-query uses
+    // stock_picker_batch_rejection to discover the latest completed live
+    // batch; writing the rejection first would risk exposing a batch_id with
+    // zero or partial pick rows if a later pick chunk failed. Writing picks
+    // first + rejection last ensures the batch only becomes visible after
+    // all pick rows are safely persisted.
+    //
+    // All calls share the same batchId (baked into rejectionParams.p_batch_id
+    // and each pickAuditOps[i].params.p_batch_id) and the same
+    // x-sp1-internal-secret header. write-audit treats 23505 unique_violation
+    // as ok+deduped, so any chunk retry is idempotent.
+    const WRITE_AUDIT_CHUNK_SIZE = 100;
+    const aggregatedResults: NonNullable<WriteAuditResponse['results']> = [];
+
+    // Calls 1..N — pick audit ops in fixed-size chunks, sequential.
+    const totalPickChunks = Math.ceil(pickAuditOps.length / WRITE_AUDIT_CHUNK_SIZE);
+    for (let ci = 0; ci < totalPickChunks; ci++) {
+      const start = ci * WRITE_AUDIT_CHUNK_SIZE;
+      const slice = pickAuditOps.slice(start, start + WRITE_AUDIT_CHUNK_SIZE);
+      const chunkResp = await invokeFunction<WriteAuditResponse>(
+        SUPABASE_URL,
+        SUPABASE_SERVICE_ROLE_KEY,
+        'stock-picker-write-audit',
+        {
+          invoked_by: body.invoked_by,
+          operations: slice,
+        },
+        writeAuditHeaders
+      );
+      if (!chunkResp || chunkResp.ok !== true) {
+        const errMsg = chunkResp?.error ?? 'no response (undefined)';
+        throw new Error(
+          `cron: write-audit pick chunk ${ci + 1}/${totalPickChunks} failed ` +
+            `(ops ${start + 1}..${start + slice.length} of ${pickAuditOps.length}, batch_id=${batchId}): ${errMsg}`
+        );
+      }
+      if (Array.isArray(chunkResp.results)) aggregatedResults.push(...chunkResp.results);
+    }
+
+    // Final call — write_batch_rejection (header row). Only runs if every
+    // pick chunk above succeeded.
+    const rejectionResp = await invokeFunction<WriteAuditResponse>(
+      SUPABASE_URL,
+      SUPABASE_SERVICE_ROLE_KEY,
+      'stock-picker-write-audit',
+      {
+        invoked_by: body.invoked_by,
+        operations: [{ op: 'write_batch_rejection', params: rejectionParams }],
+      },
+      writeAuditHeaders
+    );
+    if (!rejectionResp || rejectionResp.ok !== true) {
+      const errMsg = rejectionResp?.error ?? 'no response (undefined)';
+      throw new Error(
+        `cron: write-audit rejection (final) failed after ${totalPickChunks} pick chunks (batch_id=${batchId}): ${errMsg}`
+      );
+    }
+    if (Array.isArray(rejectionResp.results)) aggregatedResults.push(...rejectionResp.results);
+
+    // Aggregate into a single WriteAuditResponse-shaped object so downstream
+    // consumers (if-check + cron_run_log.write_results) see the pre-fix shape.
+    // Full per-op fields (op, ok, id?, deduped?, error?) are preserved.
+    const writeResults: WriteAuditResponse = {
+      ok: true,
+      results: aggregatedResults,
+    };
+    // Defensive — if any future refactor lets writeResults become undefined,
+    // fail with a descriptive message instead of a bare TypeError.
+    if (!writeResults || writeResults.ok !== true) {
+      const errMsg = (writeResults && writeResults.error) ? writeResults.error : 'writeResults undefined or not ok after chunk aggregation';
+      throw new Error(`cron: write-audit failed: ${errMsg}`);
     }
     markPhase('phase_write_ms', tWrite);
```

## Invariants (explicit)

- **`stock-picker-write-audit` UNCHANGED.** No edits to its source; behavior (idempotent 23505 handling, schema-version gate, internal-secret gate, matrix enforcement, per-profile composite gate) is preserved.
- **Replay-hash, Task 1 hysteresis math, Task 2 sector filter UNCHANGED.** `computedReplayHash` composition, `is_top_pick` / `was_incumbent` / `persistence_reason` derivations, and `stock-recommendation-query` sector mapping not touched. Tenure short-circuit only substitutes `+Infinity` for an RPC call whose value would otherwise be gated out by `hMinTenure <= 0`.
- **`writeResults` shape preserved AND widened to full fidelity.** Aggregated object is `{ ok: true, results: Array<{ op, ok, id?, deduped?, error? }> }` — identical field set to what `stock-picker-write-audit` returns in a single call. Consumers at `if (!writeResults.ok)` and `write_results: writeResults` (cron_run_log) see the same shape as before.
- **Chunk count for ~490 pick ops:** `ceil(490 / 100) = 5` pick chunks + 1 final rejection call = **6 total HTTP POSTs**, in order: pick chunk 1 → 2 → 3 → 4 → 5 → rejection. All 6 reuse the same `batchId` and the same `x-sp1-internal-secret` header.
- **Failure semantics:** If any pick chunk fails, the rejection call is NEVER sent, so `stock_picker_batch_rejection` has no row for this `batchId` and `stock-recommendation-query` will not treat the failed batch as the latest completed live batch. This is the visibility guarantee requested.

## STOP — awaiting `APPROVED — DEPLOY`.