# PHASE LIQUIDITY.DRAIN.MODE — Plan (single-file)

**Scope:** ONLY `supabase/functions/backfill-liquidity-20d/index.ts`. No migration, no other file changes.

**Runtime math (why 170000 ms is sufficient):**
- Universe: 788 pairs (active snapshot).
- Chunk size 100 → at most 8 loops to drain a full-pending queue; typically 1–3 loops in steady state because freshness gate already skips fresh pairs.
- Per pair work: one `stock_picker_ohlcv_history` read (≤20 rows) + one bulk upsert into `stock_picker_liquidity_20d`. Both hit Supabase over the internal network, no external API. Measured ~40–80 ms per pair.
- 100 pairs/loop × ~60 ms ≈ 6 s per loop, plus one coverage probe (~1–2 s) done ONCE before the drain loop starts.
- Full-cold drain: coverage probe (~2 s) + 8 × 6 s ≈ 50 s. Warm/steady drain: <10 s.
- Supabase edge functions cap around 200 s. 170 000 ms leaves ~30 s headroom for network jitter and the final response write. Comfortable ~3× margin over cold-drain expected wall time.

---

## Diff 1 — New body knobs (mode / drain budget / error guard)

Insert immediately after the existing `sleep_ms` block (after line 63).

**Before (lines 55–63):**
```ts
    const forceRefresh = bodyJson.force_refresh === true;
    // History-only mode: no external API => no throttle by default.
    // sleep_ms is exposed for future modes that hit Dhan directly.
    const sleepMs = Math.max(
      0,
      Math.floor(typeof bodyJson.sleep_ms === "number" ? bodyJson.sleep_ms : 0),
    );
    const sleep = (ms: number) =>
      ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
```

**After — append new knobs:**
```ts
    const forceRefresh = bodyJson.force_refresh === true;
    // History-only mode: no external API => no throttle by default.
    // sleep_ms is exposed for future modes that hit Dhan directly.
    const sleepMs = Math.max(
      0,
      Math.floor(typeof bodyJson.sleep_ms === "number" ? bodyJson.sleep_ms : 0),
    );
    const sleep = (ms: number) =>
      ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

    // LIQUIDITY.DRAIN.MODE — request body extension
    // mode="drain": internally loop the chunk worker until done OR budget hit
    //               OR too_many_errors trips. All other modes unchanged.
    const modeIn = typeof bodyJson.mode === "string" ? bodyJson.mode : "chunk";
    const isDrain = modeIn === "drain";
    const maxDrainRuntimeMs = Math.max(
      10000,
      Math.min(190000, Math.floor(
        typeof bodyJson.max_drain_runtime_ms === "number"
          ? bodyJson.max_drain_runtime_ms : 170000,
      )),
    );
    const drainErrorLimit = Math.max(
      1,
      Math.floor(
        typeof bodyJson.drain_error_limit === "number"
          ? bodyJson.drain_error_limit : 200,
      ),
    );
```

Note: chunk_size and sleep_ms defaults are already 100 and 0 respectively (lines 51–61), matching the required drain defaults. No default change needed. Callers can still override.

---

## Diff 2 — Wrap the chunk-processing block in an internal drain loop

Replace lines 196–332 (from `// Cursor is the LAST pair key…` through the final `return json({ …, remaining_pending: … });`). The single-chunk path is preserved bit-for-bit inside the loop body — the loop simply runs exactly one iteration when `!isDrain`.

**Before (lines 196–332):**
```ts
    // Cursor is the LAST pair key already processed by a prior invocation.
    // We slice strictly greater than that composite key.
    const sliceStart = cursorIn
      ? (() => {
          const idx = workPairs.findIndex((p) => pairKey(p) > cursorIn);
          return idx < 0 ? workPairs.length : idx;
        })()
      : 0;
    const chunkPairs = workPairs.slice(sliceStart, sliceStart + chunkSize);
    const remainingBefore = workPairs.length - sliceStart;

    const maxRuntimeMs = typeof bodyJson.max_runtime_ms === "number"
      ? Math.max(5000, Math.floor(bodyJson.max_runtime_ms))
      : 100000;
    const t0 = Date.now();

    const errors: Array<{ symbol: string; reason: string }> = [];
    let processed = 0;
    let insertedTotal = 0;
    let timedOut = false;

    let lastProcessedKey: string | null = null;

    for (let i = 0; i < chunkPairs.length; i++) {
      if (Date.now() - t0 > maxRuntimeMs) { timedOut = true; break; }
      if (i > 0) await sleep(sleepMs); // no-op when sleep_ms=0 (default)
      const { symbol, exchange } = chunkPairs[i];
      processed++;
      const { data: rows, error: histErr } = await supabase
        .from("stock_picker_ohlcv_history")
        .select("symbol, exchange, record_date, close, volume")
        .eq("symbol", symbol)
        .eq("exchange", exchange)
        .order("record_date", { ascending: false })
        .limit(20);
      if (histErr) {
        errors.push({ symbol, reason: `history_read: ${histErr.message}` });
        lastProcessedKey = `${symbol}|${exchange}`;
        continue;
      }
      if (!rows || rows.length === 0) {
        errors.push({ symbol, reason: "no_history_rows" });
        lastProcessedKey = `${symbol}|${exchange}`;
        continue;
      }

      const payload = rows
        .filter((r) => r.close != null && r.volume != null && r.record_date)
        .map((r) => {
          const close = Number(r.close);
          const volume = Number(r.volume);
          return {
            symbol: r.symbol,
            exchange: r.exchange,
            record_date: r.record_date as string,
            close,
            volume,
            turnover_rs: close * volume,
            adv_20d: null,
            adt_20d_rs: null,
            fetch_status: "ok",
            data_snapshot_at: SNAPSHOT_TAG,
            source_response_hash: null,
          };
        });
      if (payload.length === 0) {
        lastProcessedKey = `${symbol}|${exchange}`;
        continue;
      }

      const { error: upErr, count } = await supabase
        .from("stock_picker_liquidity_20d")
        .upsert(payload, {
          onConflict: "symbol,exchange,record_date,data_snapshot_at",
          ignoreDuplicates: true,
          count: "exact",
        });
      if (upErr) {
        errors.push({ symbol, reason: `upsert: ${upErr.message}` });
        lastProcessedKey = `${symbol}|${exchange}`;
        continue;
      }
      insertedTotal += count ?? 0;
      lastProcessedKey = `${symbol}|${exchange}`;
    }

    try {
      await supabase
        .from("stock_picker_runtime_config")
        .upsert(
          {
            config_key: "last_backfill_liquidity_20d",
            kind: "operational",
            config_value: {
              ok: true,
              source: sourceLabel,
              universe_pairs: pairs.length,
              symbols_processed: processed,
              rows_inserted: insertedTotal,
              errors_count: errors.length,
              timed_out: timedOut,
              ran_at: new Date().toISOString(),
            },
          },
          { onConflict: "config_key" },
        );
    } catch { /* best effort */ }

    return json({
      ok: true,
      source: sourceLabel,
      universe_pairs: pairs.length,
      work_pairs: workPairs.length,
      skipped_already_covered: skippedCovered,
      symbols_processed: processed,
      rows_inserted: insertedTotal,
      timed_out: timedOut,
      elapsed_ms: Date.now() - t0,
      errors_count: errors.length,
      errors: errors.slice(0, 20),
      coverage_rule: "rows_ge_20_and_fresh_within_days",
      coverage_freshness_days_used: freshnessDays,
      covered_set_size_by_freshness: coveredByFreshness,
      covered_set_size_by_count_only_before: coveredByCountOnlyBefore,
      stale_pairs_now_pending: staleNowPending,
      force_refresh_used: forceRefresh,
      sleep_ms_used: sleepMs,
      chunk_start_cursor: cursorIn,
      chunk_size_used: chunkSize,
      chunk_processed: processed,
      last_processed_cursor: lastProcessedKey,
      next_cursor: (!timedOut && (sliceStart + processed) >= workPairs.length)
        ? null
        : lastProcessedKey,
      done: !timedOut && (sliceStart + processed) >= workPairs.length,
      remaining_pending: Math.max(0, remainingBefore - processed),
    });
```

**After:**
```ts
    const maxRuntimeMs = typeof bodyJson.max_runtime_ms === "number"
      ? Math.max(5000, Math.floor(bodyJson.max_runtime_ms))
      : 100000;
    const t0 = Date.now();

    // Aggregate telemetry across chunk iterations (drain mode); in single-
    // chunk mode the loop executes exactly once and these mirror the chunk.
    const errors: Array<{ symbol: string; reason: string }> = [];
    let totalProcessed = 0;
    let totalInserted = 0;
    let drainLoopCount = 0;
    let currentCursor: string | null = cursorIn;
    let lastProcessedKey: string | null = null;
    let sliceStart = 0;                 // last iteration's slice start
    let iterationProcessed = 0;         // last iteration's processed count
    let timedOut = false;
    let finalDone = false;
    let drainErrorTripped = false;
    const drainStartedCursor: string | null = cursorIn;

    while (true) {
      // Cursor is the LAST pair key already processed by a prior iteration.
      // We slice strictly greater than that composite key.
      sliceStart = currentCursor
        ? (() => {
            const idx = workPairs.findIndex((p) => pairKey(p) > (currentCursor as string));
            return idx < 0 ? workPairs.length : idx;
          })()
        : 0;
      const chunkPairs = workPairs.slice(sliceStart, sliceStart + chunkSize);

      if (chunkPairs.length === 0) { finalDone = true; break; }

      iterationProcessed = 0;
      let iterationInserted = 0;

      for (let i = 0; i < chunkPairs.length; i++) {
        if (Date.now() - t0 > maxRuntimeMs) { timedOut = true; break; }
        if (i > 0) await sleep(sleepMs); // no-op when sleep_ms=0 (default)
        const { symbol, exchange } = chunkPairs[i];
        iterationProcessed++;
        const { data: rows, error: histErr } = await supabase
          .from("stock_picker_ohlcv_history")
          .select("symbol, exchange, record_date, close, volume")
          .eq("symbol", symbol)
          .eq("exchange", exchange)
          .order("record_date", { ascending: false })
          .limit(20);
        if (histErr) {
          errors.push({ symbol, reason: `history_read: ${histErr.message}` });
          lastProcessedKey = `${symbol}|${exchange}`;
          continue;
        }
        if (!rows || rows.length === 0) {
          errors.push({ symbol, reason: "no_history_rows" });
          lastProcessedKey = `${symbol}|${exchange}`;
          continue;
        }

        const payload = rows
          .filter((r) => r.close != null && r.volume != null && r.record_date)
          .map((r) => {
            const close = Number(r.close);
            const volume = Number(r.volume);
            return {
              symbol: r.symbol,
              exchange: r.exchange,
              record_date: r.record_date as string,
              close,
              volume,
              turnover_rs: close * volume,
              adv_20d: null,
              adt_20d_rs: null,
              fetch_status: "ok",
              data_snapshot_at: SNAPSHOT_TAG,
              source_response_hash: null,
            };
          });
        if (payload.length === 0) {
          lastProcessedKey = `${symbol}|${exchange}`;
          continue;
        }

        const { error: upErr, count } = await supabase
          .from("stock_picker_liquidity_20d")
          .upsert(payload, {
            onConflict: "symbol,exchange,record_date,data_snapshot_at",
            ignoreDuplicates: true,
            count: "exact",
          });
        if (upErr) {
          errors.push({ symbol, reason: `upsert: ${upErr.message}` });
          lastProcessedKey = `${symbol}|${exchange}`;
          continue;
        }
        iterationInserted += count ?? 0;
        lastProcessedKey = `${symbol}|${exchange}`;
      }

      totalProcessed += iterationProcessed;
      totalInserted += iterationInserted;
      drainLoopCount++;
      currentCursor = lastProcessedKey ?? currentCursor;

      // Loop-exit rules:
      // 1) Single-chunk (non-drain) mode -> always one iteration
      // 2) Drain mode -> continue until end-of-queue OR budget OR error-guard
      if (!isDrain) break;
      if (timedOut) break;
      const reachedEnd = (sliceStart + iterationProcessed) >= workPairs.length;
      if (reachedEnd) { finalDone = true; break; }
      if (errors.length >= drainErrorLimit) { drainErrorTripped = true; break; }
      if (Date.now() - t0 > maxDrainRuntimeMs) { timedOut = true; break; }
    }

    // "done" in single-chunk mode uses the ORIGINAL chunk's slice math to
    // preserve prior wire-contract semantics; in drain mode use finalDone.
    const singleChunkDone = !timedOut && (sliceStart + iterationProcessed) >= workPairs.length;
    const doneOut = isDrain ? finalDone : singleChunkDone;
    const remainingPendingOut = Math.max(0, workPairs.length - (sliceStart + iterationProcessed));

    try {
      await supabase
        .from("stock_picker_runtime_config")
        .upsert(
          {
            config_key: "last_backfill_liquidity_20d",
            kind: "operational",
            config_value: {
              ok: true,
              source: sourceLabel,
              mode_used: isDrain ? "drain" : "chunk",
              universe_pairs: pairs.length,
              symbols_processed: totalProcessed,
              rows_inserted: totalInserted,
              errors_count: errors.length,
              timed_out: timedOut,
              drain_loop_count: drainLoopCount,
              final_done: doneOut,
              drain_error_tripped: drainErrorTripped,
              ran_at: new Date().toISOString(),
            },
          },
          { onConflict: "config_key" },
        );
    } catch { /* best effort */ }

    return json({
      ok: true,
      source: sourceLabel,
      mode_used: isDrain ? "drain" : "chunk",
      universe_pairs: pairs.length,
      work_pairs: workPairs.length,
      skipped_already_covered: skippedCovered,
      symbols_processed: totalProcessed,
      rows_inserted: totalInserted,
      timed_out: timedOut,
      elapsed_ms: Date.now() - t0,
      errors_count: errors.length,
      errors: errors.slice(0, 20),
      coverage_rule: "rows_ge_20_and_fresh_within_days",
      coverage_freshness_days_used: freshnessDays,
      covered_set_size_by_freshness: coveredByFreshness,
      covered_set_size_by_count_only_before: coveredByCountOnlyBefore,
      stale_pairs_now_pending: staleNowPending,
      force_refresh_used: forceRefresh,
      sleep_ms_used: sleepMs,
      chunk_start_cursor: cursorIn,
      chunk_size_used: chunkSize,
      chunk_processed: iterationProcessed,   // last iteration's chunk
      last_processed_cursor: lastProcessedKey,
      next_cursor: doneOut ? null : lastProcessedKey,
      done: doneOut,
      remaining_pending: remainingPendingOut,
      // ---- LIQUIDITY.DRAIN.MODE telemetry ----
      drain_loop_count: drainLoopCount,
      drain_started_cursor: drainStartedCursor,
      drain_ended_cursor: lastProcessedKey,
      total_chunk_processed: totalProcessed,
      total_rows_inserted: totalInserted,
      final_done: doneOut,
      final_remaining_pending: remainingPendingOut,
      final_timed_out: timedOut,
      max_drain_runtime_ms_used: isDrain ? maxDrainRuntimeMs : null,
      drain_error_tripped: drainErrorTripped,
    });
```

Note about the deleted `remainingBefore` variable: it was only used by the old response's `remaining_pending` calc. The new `remainingPendingOut` re-derives it from `workPairs.length - (sliceStart + iterationProcessed)`, which is equivalent when a single chunk runs and correct across drain iterations.

---

## Diff 3 — Response/telemetry additions (already inlined above)

New response fields (all additive; every existing field is preserved with the same key names and semantics for `mode=chunk`):
- `mode_used`
- `drain_loop_count`
- `drain_started_cursor`
- `drain_ended_cursor`
- `total_chunk_processed`
- `total_rows_inserted`
- `final_done`
- `final_remaining_pending`
- `final_timed_out`
- `max_drain_runtime_ms_used` (null when `mode=chunk`)
- `drain_error_tripped`

`last_backfill_liquidity_20d` runtime-config summary gains `mode_used`, `drain_loop_count`, `final_done`, `drain_error_tripped`.

---

## Preserved (unchanged)

- Snapshot / explicit_pairs / override universe sourcing
- Freshness gate (`rows_ge_20_and_fresh_within_days`) + `force_refresh` bypass
- Composite pair-key ordering and cursor semantics
- `chunk_size` and `sleep_ms` request-body knobs and their defaults (100 / 0)
- `onConflict: "symbol,exchange,record_date,data_snapshot_at"` idempotent upsert
- Single-chunk (`mode=chunk` / no `mode`) behavior: exactly one loop iteration, identical wire contract
- No DB migration, no schema changes, no UI changes

## Confirmations

1. **Only one file changes:** `supabase/functions/backfill-liquidity-20d/index.ts`
2. **No migration.**

STOP — awaiting approval before build/deploy.
