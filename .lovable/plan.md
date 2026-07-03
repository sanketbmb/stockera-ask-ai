# PHASE LTP.ROUNDROBIN.MARKET.HOURS — Plan (single-file)

**Scope:** ONLY `supabase/functions/sync-ltp-dhan/index.ts`. No migration, no other files.

**Recommended chunk size: 50** — matches existing `FULL_RUN_CHUNK`. With ~788 members and a 5-minute cadence, wrap time ≈ 788/50 × 5 min ≈ 79 minutes (≈ every ticker refreshed ~5×/day during 09:15–15:30 IST). Small enough to keep well under Dhan gateway per-call bursts (previous full runs at ~788/invocation triggered upstream throttling; 50/invocation is safely below observed failure thresholds), large enough that wrap-around latency stays under a trading session slice. Filtered inline refresh continues to run all supplied (≤10) symbols in one invocation.

---

## Diff 1 — Runtime cursor read (extend the `.in([...])` config fetch)

**Before (lines 161–171):**
```ts
const { data: cfgRows } = await supabase
  .from("stock_picker_runtime_config")
  .select("config_key, config_value")
  .in("config_key", [
    "dhan_api_enabled",
    "active_universe_snapshot_id",
    "universe_override_symbols",
    "universe_override_enabled",
  ]);
const cfg = new Map<string, unknown>();
for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value);
```

**After:**
```ts
const { data: cfgRows } = await supabase
  .from("stock_picker_runtime_config")
  .select("config_key, config_value")
  .in("config_key", [
    "dhan_api_enabled",
    "active_universe_snapshot_id",
    "universe_override_symbols",
    "universe_override_enabled",
    "sync_ltp_dhan_cursor",
  ]);
const cfg = new Map<string, unknown>();
for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value);

// Cursor: last processed composite pair-key `${symbol}|${exchange}`.
// Rolling scope applies only to unfiltered scheduled runs.
const cursorRaw = cfg.get("sync_ltp_dhan_cursor");
const cursorKey: string | null =
  cursorRaw && typeof cursorRaw === "object" && typeof (cursorRaw as { last_key?: unknown }).last_key === "string"
    ? (cursorRaw as { last_key: string }).last_key
    : null;
```

---

## Diff 2 — Rolling-chunk selection + filtered-inline bypass

Replace the chunk-loop initialization (lines 261–266) with a rolling-cursor slice for unfiltered runs. Filtered runs (`filterSymbols`) still process every supplied symbol in one invocation and do NOT advance the cursor.

**Before (lines 261–266):**
```ts
    // -------- Chunked one-call-per-symbol loop --------
    // Manual filtered runs (<=10 symbols) execute inline without chunk pauses.
    const chunkSize = filterSymbols ? members.length : FULL_RUN_CHUNK;
    let abortedAuth = false;

    outer: for (let i = 0; i < members.length; i += chunkSize) {
```

**After:**
```ts
    // -------- Rolling-cursor scope (unfiltered) OR filtered inline --------
    // Filtered inline runs: process all supplied symbols in one shot, no cursor advance.
    // Unfiltered scheduled runs: deterministic order by `${symbol}|${exchange}`, pick
    // exactly ONE FULL_RUN_CHUNK-sized window starting after the persisted cursor,
    // wrapping to the beginning at end-of-universe.
    const universeMode: "rolling_full_run" | "filtered_inline" =
      filterSymbols ? "filtered_inline" : "rolling_full_run";

    let wrappedToStart = false;
    let cursorStartKey: string | null = null;
    let cursorEndKey: string | null = null;

    if (universeMode === "rolling_full_run") {
      // Deterministic ordering by composite key.
      members.sort((a, b) =>
        `${a.symbol}|${a.exchange}`.localeCompare(`${b.symbol}|${b.exchange}`)
      );
      let startIdx = 0;
      if (cursorKey) {
        // First member with pair-key > cursorKey.
        const found = members.findIndex((m) => `${m.symbol}|${m.exchange}` > cursorKey);
        if (found === -1) {
          wrappedToStart = true;
          startIdx = 0;
        } else {
          startIdx = found;
        }
      }
      const endIdx = Math.min(startIdx + FULL_RUN_CHUNK, members.length);
      cursorStartKey = members[startIdx] ? `${members[startIdx].symbol}|${members[startIdx].exchange}` : null;
      cursorEndKey = members[endIdx - 1] ? `${members[endIdx - 1].symbol}|${members[endIdx - 1].exchange}` : null;
      members = members.slice(startIdx, endIdx);
    }

    const chunkSize = universeMode === "filtered_inline" ? members.length : FULL_RUN_CHUNK;
    let abortedAuth = false;

    outer: for (let i = 0; i < members.length; i += chunkSize) {
```

(Body of the `outer` loop is unchanged.)

---

## Diff 3 — Persist advanced cursor after loop (unfiltered runs only)

Insert immediately BEFORE the existing `if (!filterSymbols) { ... last_sync_ltp_dhan upsert ... }` block at line 361.

**Before (line 359–361):**
```ts
    // Telemetry — only for full-universe runs; partial inline refreshes
    // (filter_applied) must not overwrite the daily summary.
    if (!filterSymbols) {
```

**After:**
```ts
    // Persist rolling cursor for the next unfiltered invocation. On wrap or
    // an empty slice, reset to null so the next run starts from the top.
    if (universeMode === "rolling_full_run") {
      const nextCursorValue = wrappedToStart || !cursorEndKey
        ? { last_key: null, wrapped_at: new Date().toISOString() }
        : { last_key: cursorEndKey, updated_at: new Date().toISOString() };
      await supabase.from("stock_picker_runtime_config").upsert(
        {
          config_key: "sync_ltp_dhan_cursor",
          kind: "operational",
          config_value: nextCursorValue,
          description: "Rolling cursor for sync-ltp-dhan full-universe pacing",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "config_key" },
      );
    }

    // Telemetry — only for full-universe runs; partial inline refreshes
    // (filter_applied) must not overwrite the daily summary.
    if (!filterSymbols) {
```

---

## Diff 4 — Telemetry additions

Extend `counters` initializer (lines 243–259) and both telemetry sinks.

**Before (counters block, lines 243–259):** as-is with keys ending at `fetch_error_by_status`.

**After — append two counters:**
```ts
      chunk_count: 0,
      fetch_error_by_status: {} as Record<string, number>,
      rate_limit_like_count: 0,
      processed_member_count: 0,
    };
```

Inside the error branch (line 314–319), after existing status bookkeeping, add:
```ts
          // status 0 = network/timeout; 429 = classic rate-limit; treat both as
          // upstream-throttle signal (dhan-fetch surfaces RateLimitError as status=0).
          const st = (r as { status?: number }).status ?? 0;
          if (st === 0 || st === 429) counters.rate_limit_like_count++;
```

Inside the OK branch (after `counters.updated_count++`, ~line 346), also bump processed:
```ts
        counters.processed_member_count++;
```
And in the error branch (before `continue`), likewise bump:
```ts
        counters.processed_member_count++;
```
(Every member that was actually attempted counts as processed; skips for missing_id already increment `missing_id_count` and should NOT bump processed_member_count.)

Extend the `last_sync_ltp_dhan` upsert `config_value` (line 366–375):
```ts
          config_value: {
            ok: !abortedAuth,
            symbols_updated: updated,
            errors_count: errors.length,
            ran_at: ranAt,
            counters,
            http_400_samples,
            universe_source: universeSource,
            universe_mode: universeMode,
            cursor_start: cursorStartKey,
            cursor_end: cursorEndKey,
            wrapped_to_start: wrappedToStart,
            aborted_systemic_auth: abortedAuth,
          },
```

Extend `logTelemetry` details (line 387–394):
```ts
      details: {
        filter_applied: filterSymbols != null,
        universe_mode: universeMode,
        cursor_start: cursorStartKey,
        cursor_end: cursorEndKey,
        wrapped_to_start: wrappedToStart,
        counters,
        http_400_samples,
        universe_source: universeSource,
        aborted_systemic_auth: abortedAuth,
        errors_sample: errors.slice(0, 10),
      },
```

Extend the final `return json({...})` (line 396–406) with the same four new fields (`universe_mode`, `cursor_start`, `cursor_end`, `wrapped_to_start`).

---

## Preserved (unchanged)

- Active snapshot as primary universe; override fallback only if snapshot empty
- Exact member-row exchange/segment/dhan_security_id
- `stock_master` fallback only for exact `(symbol, segment)`
- `ltp_cache` upsert `onConflict: "symbol,exchange"`
- Filter cap of 10, auth abort at 3 consecutive auth errors
- `Retry-After` handling via `fetchLtpWithRetry`
- Existing `INTER_CHUNK_PAUSE_MS = 800` pacing (relevant only if a single rolling slice ever exceeds FULL_RUN_CHUNK — kept as safety net; not tuned up)
- No cron schedule change, no UI change

## Confirmations

1. **Only one file changes:** `supabase/functions/sync-ltp-dhan/index.ts`
2. **No migration.** Cursor is a new *row* in existing `stock_picker_runtime_config` (`config_key = 'sync_ltp_dhan_cursor'`), written via existing upsert path.

STOP — awaiting approval before build/deploy.
