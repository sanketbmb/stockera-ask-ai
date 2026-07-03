## PHASE LIQUIDITY.FRESHNESS.GATE — REVISED PLAN (STOP-gate)

Single file: `supabase/functions/backfill-liquidity-20d/index.ts`. No migration. No other function touched. All four corrections applied.

---

### Diff 1 — Request-body parsing

**Before (lines 42-45):**
```ts
    let bodyJson: Record<string, unknown> = {};
    try {
      bodyJson = (await req.json()) as Record<string, unknown>;
    } catch { /* no body */ }
```

**After (append immediately below, before line 47):**
```ts
    let bodyJson: Record<string, unknown> = {};
    try {
      bodyJson = (await req.json()) as Record<string, unknown>;
    } catch { /* no body */ }

    // LIQUIDITY.FRESHNESS.GATE — new body knobs
    const cursorIn = typeof bodyJson.cursor === "string" ? bodyJson.cursor : null;
    const chunkSize = Math.max(
      1,
      Math.min(1000, Math.floor(
        typeof bodyJson.chunk_size === "number" ? bodyJson.chunk_size : 100,
      )),
    );
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

---

### Diff 2 — Coverage-decision block (freshness gate)

**Before (lines 106-137):**
```ts
    // FIX-I-PREWARM: skip pairs already at >=20 fresh liquidity rows.
    // Coverage probe paginated to avoid PostgREST 1000-row silent cap.
    const skipCovered = bodyJson.skip_covered !== false;
    let skippedCovered = 0;
    let workPairs = pairs;
    if (skipCovered) {
      const PAGE = 1000;
      let from = 0;
      const counts = new Map<string, number>();
      while (true) {
        const { data: page, error } = await supabase
          .from("stock_picker_liquidity_20d")
          .select("symbol,exchange")
          .eq("fetch_status", "ok")
          .order("symbol", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) return json({ ok: false, error: `coverage_probe: ${error.message}` }, 500);
        if (!page || page.length === 0) break;
        for (const r of page) {
          const k = `${r.symbol}|${r.exchange}`;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        if (page.length < PAGE) break;
        from += PAGE;
      }
      const covered = new Set<string>();
      for (const [k, c] of counts) if (c >= 20) covered.add(k);
      workPairs = pairs.filter((p) => {
        if (covered.has(`${p.symbol}|${p.exchange}`)) { skippedCovered++; return false; }
        return true;
      });
    }
```

**After:**
```ts
    // LIQUIDITY.FRESHNESS.GATE — a pair is covered iff
    //   rows_ok >= 20 AND MAX(record_date) >= today - N days
    // N = stock_picker_runtime_config.liquidity_coverage_freshness_days (int, default 3).
    // force_refresh=true bypasses the gate entirely.
    // Rollback: set knob to 999999 (every pair "fresh" -> count-only behavior).
    const skipCovered = bodyJson.skip_covered !== false;
    let skippedCovered = 0;
    let coveredByFreshness = 0;
    let coveredByCountOnlyBefore = 0;
    let staleNowPending = 0;
    let freshnessDays = 3;
    let workPairs = pairs;

    if (skipCovered && !forceRefresh) {
      const { data: fcfg } = await supabase
        .from("stock_picker_runtime_config")
        .select("config_value")
        .eq("config_key", "liquidity_coverage_freshness_days")
        .maybeSingle();
      const raw = fcfg?.config_value;
      const parsed = typeof raw === "number" ? raw
        : typeof raw === "string" ? Number(raw)
        : (raw && typeof raw === "object" && "value" in (raw as Record<string, unknown>))
          ? Number((raw as Record<string, unknown>).value) : NaN;
      if (Number.isFinite(parsed) && parsed >= 1) freshnessDays = Math.floor(parsed);

      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - freshnessDays);
      const cutoffIso = cutoff.toISOString().slice(0, 10);

      const PAGE = 1000;
      let from = 0;
      const counts = new Map<string, number>();
      const maxDate = new Map<string, string>();
      while (true) {
        const { data: page, error } = await supabase
          .from("stock_picker_liquidity_20d")
          .select("symbol,exchange,record_date")
          .eq("fetch_status", "ok")
          .order("symbol", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) return json({ ok: false, error: `coverage_probe: ${error.message}` }, 500);
        if (!page || page.length === 0) break;
        for (const r of page) {
          const k = `${r.symbol}|${r.exchange}`;
          counts.set(k, (counts.get(k) ?? 0) + 1);
          const d = r.record_date as string | null;
          if (d && (!maxDate.has(k) || d > (maxDate.get(k) as string))) maxDate.set(k, d);
        }
        if (page.length < PAGE) break;
        from += PAGE;
      }

      const covered = new Set<string>();
      for (const [k, c] of counts) {
        if (c >= 20) {
          coveredByCountOnlyBefore++;
          const md = maxDate.get(k);
          if (md && md >= cutoffIso) { covered.add(k); coveredByFreshness++; }
          else { staleNowPending++; }
        }
      }
      workPairs = pairs.filter((p) => {
        if (covered.has(`${p.symbol}|${p.exchange}`)) { skippedCovered++; return false; }
        return true;
      });
    }
```

---

### Diff 3 — Pair-key cursor logic

**Before (immediately after the block above, none exists today; inserted before the loop on line 151):**
```ts
    // (no cursor / chunking today; loop consumes all workPairs)
```

**After (insert before line 151):**
```ts
    // Deterministic order by composite pair key "SYMBOL|EXCHANGE".
    const pairKey = (p: { symbol: string; exchange: string }) => `${p.symbol}|${p.exchange}`;
    workPairs.sort((a, b) => pairKey(a).localeCompare(pairKey(b)));

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
```

---

### Diff 4 — Loop / timeout / response metrics (must reflect ACTUAL processed)

**Before (lines 151-203, loop over `workPairs`):**
```ts
    for (const { symbol, exchange } of workPairs) {
      if (Date.now() - t0 > maxRuntimeMs) { timedOut = true; break; }
      processed++;
      // ...history read, payload build, upsert...
      insertedTotal += count ?? 0;
    }
```

**After:**
```ts
    let lastProcessedKey: string | null = null;

    for (let i = 0; i < chunkPairs.length; i++) {
      if (Date.now() - t0 > maxRuntimeMs) { timedOut = true; break; }
      if (i > 0) await sleep(sleepMs); // no-op when sleep_ms=0 (default)
      const { symbol, exchange } = chunkPairs[i];
      processed++;
      // ...unchanged history read, payload build, upsert...
      insertedTotal += count ?? 0;
      lastProcessedKey = `${symbol}|${exchange}`;
    }
```

**Response JSON — append inside the existing return at line 227.** All chunk/cursor fields derive from `processed` and `lastProcessedKey`, never from `chunkPairs.length`:

```ts
      coverage_rule: "rows_ge_20_and_fresh_within_days",
      coverage_freshness_days_used: freshnessDays,
      covered_set_size_by_freshness: coveredByFreshness,
      covered_set_size_by_count_only_before: coveredByCountOnlyBefore,
      stale_pairs_now_pending: staleNowPending,
      force_refresh_used: forceRefresh,
      sleep_ms_used: sleepMs,
      chunk_start_cursor: cursorIn,
      chunk_size_used: chunkSize,
      chunk_processed: processed,                   // ACTUAL, not chunkPairs.length
      last_processed_cursor: lastProcessedKey,
      next_cursor: (!timedOut && (sliceStart + processed) >= workPairs.length)
        ? null                                       // fully drained
        : lastProcessedKey,                          // resume strictly after this key
      done: !timedOut && (sliceStart + processed) >= workPairs.length,
      remaining_pending: Math.max(0, remainingBefore - processed),
```

Semantics: when `timedOut` fires mid-chunk, `next_cursor` = last successfully processed pair key, so the next invocation resumes at the following pair. When the chunk completes and the whole universe is drained, `next_cursor=null` and `done=true`.

---

### Telemetry fields (final)
`coverage_rule`, `coverage_freshness_days_used`, `covered_set_size_by_freshness`, `covered_set_size_by_count_only_before`, `stale_pairs_now_pending`, `force_refresh_used`, `sleep_ms_used`, `chunk_start_cursor`, `chunk_size_used`, `chunk_processed`, `last_processed_cursor`, `next_cursor`, `done`, `remaining_pending` (+ existing `symbols_processed`, `rows_inserted`, `skipped_already_covered`, `timed_out`, `elapsed_ms`, `errors_count`, `errors`).

### Confirmations
- Files changed: **1** (`supabase/functions/backfill-liquidity-20d/index.ts`)
- Migrations: **0**

### Runtime math (chunk_size=100, sleep_ms=0)
Per-symbol wall time in history-only mode: 1 SELECT (~20 rows) + 1 upsert. Empirically ~50-150 ms round-trip inside the edge worker. 100 pairs ≈ 5-15 s per chunk. 490 pending → `ceil(490/100) = 5` invocations. Total wall clock across 5 back-to-back invocations: ~25-75 s. Well inside the 150 s edge limit and free of any 1 req/sec pacing.

---

### Operator playbook (active-universe scoped)

Set the knob:
```sql
insert into public.stock_picker_runtime_config (config_key, kind, config_value)
values ('liquidity_coverage_freshness_days', 'operational', to_jsonb(3))
on conflict (config_key) do update set config_value = excluded.config_value;
```

Loop-invoke (composite pair-key cursor):
```bash
CURSOR=null
while : ; do
  BODY=$(jq -nc --arg c "$CURSOR" \
    '{source:"snapshot", chunk_size:100, sleep_ms:0}
     + (if $c=="null" then {} else {cursor:$c} end)')
  RESP=$(curl -sS -X POST "$FN_URL/backfill-liquidity-20d" \
    -H "Authorization: Bearer $SERVICE_ROLE" \
    -H "content-type: application/json" -d "$BODY")
  echo "$RESP" | jq '{next_cursor, remaining_pending, chunk_processed,
                      rows_inserted, timed_out, done,
                      covered_set_size_by_freshness,
                      covered_set_size_by_count_only_before,
                      stale_pairs_now_pending}'
  DONE=$(echo "$RESP" | jq -r '.done')
  CURSOR=$(echo "$RESP" | jq -r '.next_cursor')
  [ "$DONE" = "true" ] && break
  [ "$CURSOR" = "null" ] && break
done
```

### Corrected verification SQL (ACTIVE-UNIVERSE SCOPED)

Scope to the active snapshot from `stock_picker_runtime_config.active_universe_snapshot_id` and its members — never the whole `stock_picker_liquidity_20d` table.

```sql
-- Coverage of the active universe only.
with active as (
  select (config_value #>> '{}')::uuid as snapshot_id
  from public.stock_picker_runtime_config
  where config_key = 'active_universe_snapshot_id'
),
universe as (
  select m.symbol, m.exchange
  from public.stock_picker_universe_snapshot_member m
  join active a on a.snapshot_id = m.universe_snapshot_id
),
agg as (
  select l.symbol, l.exchange,
         count(*)::int as n,
         max(l.record_date) as mx
  from public.stock_picker_liquidity_20d l
  join universe u using (symbol, exchange)
  where l.fetch_status = 'ok'
  group by 1, 2
)
select
  (select count(*) from universe)                                             as universe_pairs,
  count(*) filter (where n >= 20 and mx >= current_date - 3)                  as fresh_ok,
  count(*) filter (where n >= 20 and mx <  current_date - 3)                  as stale,
  count(*) filter (where n <  20)                                             as thin,
  (select count(*) from universe)
    - count(*) filter (where n >= 20 and mx >= current_date - 3)              as still_pending
from agg;
```

Per-pair drill-down for spot checks:
```sql
with active as (
  select (config_value #>> '{}')::uuid as snapshot_id
  from public.stock_picker_runtime_config
  where config_key = 'active_universe_snapshot_id'
)
select u.symbol, u.exchange,
       count(l.record_date)::int as rows_ok,
       max(l.record_date)        as max_date,
       (count(l.record_date) >= 20
        and max(l.record_date) >= current_date - 3) as covered
from public.stock_picker_universe_snapshot_member u
join active a on a.snapshot_id = u.universe_snapshot_id
left join public.stock_picker_liquidity_20d l
  on l.symbol = u.symbol and l.exchange = u.exchange and l.fetch_status='ok'
group by 1,2
order by covered asc, u.symbol
limit 50;
```

### Rollback (no redeploy)
```sql
update public.stock_picker_runtime_config
set config_value = to_jsonb(999999)
where config_key = 'liquidity_coverage_freshness_days';
```
Freshness gate becomes a no-op; behavior reverts to count-only coverage. `force_refresh` and `sleep_ms` default to inert values.

### STOP-gate
Awaiting explicit approval before touching the file.
