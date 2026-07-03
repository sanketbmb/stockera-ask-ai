## PHASE OHLCV.RECOVERY.FIX — Plan

Single file changed: `supabase/functions/sync-ohlcv-history/index.ts`. No other files. No migrations. No config or schedule changes.

Two independent bug fixes below; neither touches the other's logic. `processOne`, the fetch functions, plain chunk-mode loop, and cursor upsert shapes are untouched. Wide fetch window (`fromStr` → `toStr`) preserved.

---

### Bug 1 — PostgREST 1000-row truncation in `resolveBackfillCandidates`

**Root cause:** `.in('symbol', symbolList)` at lines 283-287 returns at most 1000 rows. With ~788 active universe symbols mapping to ~2,700 `stock_master` rows (multi-exchange listings), rows past 1000 are silently dropped. The `agg` map is incomplete, and `if (!a) continue;` at line 317 discards ~428 eligible pairs. Result: `candidates_resolved = 360` instead of 788.

**Fix:** paginate with `.range()` in 1000-row pages, ordered stably, break when a page returns `< PAGE` rows. Mirrors the FIX-K pattern in `stock-picker-daily-cron/index.ts`. Same `select` columns; downstream `agg` and `targets` logic unchanged.

**Before (lines 281-287):**
```ts
// Apply inline cleanliness from stock_master.
const symbolList = [...new Set(pairs.map((p) => p.symbol))];
const { data: meta, error: metaErr } = await supabase
  .from('stock_master')
  .select('symbol,exchange,type,segment,is_suspended,dhan_security_id,company_name')
  .in('symbol', symbolList);
if (metaErr) throw new Error(`stock_master read failed: ${metaErr.message}`);
```

**After:**
```ts
// Apply inline cleanliness from stock_master.
// FIX-K pattern: paginate the .in() read to defeat PostgREST's 1000-row cap.
// Without this, ~2.7k rows for the ~788-symbol universe get truncated and
// ~428 eligible members silently fall out of the candidate set.
const symbolList = [...new Set(pairs.map((p) => p.symbol))];
const meta: Array<Record<string, unknown>> = [];
const META_PAGE = 1000;
for (let offset = 0; ; offset += META_PAGE) {
  const { data, error: metaErr } = await supabase
    .from('stock_master')
    .select('symbol,exchange,type,segment,is_suspended,dhan_security_id,company_name')
    .in('symbol', symbolList)
    .order('symbol', { ascending: true })
    .order('exchange', { ascending: true })
    .range(offset, offset + META_PAGE - 1);
  if (metaErr) throw new Error(`stock_master read failed: ${metaErr.message}`);
  const batch = (data ?? []) as Array<Record<string, unknown>>;
  meta.push(...batch);
  if (batch.length < META_PAGE) break;
}
```

Downstream `for (const r of (meta ?? []) …)` becomes `for (const r of meta …)` (drop the `?? []`, `meta` is now always an array). No other change to the agg/target loops.

---

### Bug 2 — Row-count-only coverage in `nifty500_chunk` mode

**Root cause:** lines 488-502 mark a symbol "covered" purely on `count >= 20`, ignoring freshness. Stale symbols (last row weeks/months old) never re-enter `pending`, so chunk mode can never refresh them.

**Fix:** add a freshness gate — covered iff `count >= 20` AND `max(record_date) >= today − N` days, with `N` from `stock_picker_runtime_config.ohlcv_coverage_freshness_days` (default 3). Add a `force_refresh` body flag that bypasses the coverage set entirely. Add telemetry fields. `MIN_USABLE_ROWS = 100` unchanged.

**Before (lines 484-504):**
```ts
// Compute already-covered (>=20 rows) among targets via HEAD count per pair.
// Parallel batches to keep latency bounded. This is the bug-fix vs the
// earlier .select()-based probe, which silently hit the PostgREST 1000-row
// cap and under-reported cumulative coverage.
const coveredSet = new Set<string>();
const BATCH = 25;
for (let i = 0; i < targetsN500.length; i += BATCH) {
  const sl = targetsN500.slice(i, i + BATCH);
  const counts = await Promise.all(sl.map(async (t) => {
    const { count } = await supabase
      .from('stock_picker_ohlcv_history')
      .select('*', { count: 'exact', head: true })
      .eq('symbol', t.symbol).eq('exchange', t.exchange);
    return { t, count: count ?? 0 };
  }));
  for (const { t, count } of counts) {
    if (count >= 20) coveredSet.add(`${t.symbol}|${t.exchange}`);
  }
}
const skippedAlready = coveredSet.size;
const pending = targetsN500.filter((t) => !coveredSet.has(`${t.symbol}|${t.exchange}`));
```

**After:**
```ts
// Freshness-aware coverage: a symbol counts as covered ONLY when it has
// >=20 rows AND its max(record_date) is within `freshnessDays` of today.
// Stale symbols re-enter `pending` so chunk mode can refresh them.
// `force_refresh: true` in the request body bypasses the coverage set entirely.
const forceRefresh = jbool((body as Record<string, unknown>)?.force_refresh);
const freshnessDays = Math.max(
  1,
  Math.floor(jnum(cfg.get('ohlcv_coverage_freshness_days'), 3)),
);
const freshCutoff = new Date();
freshCutoff.setUTCDate(freshCutoff.getUTCDate() - freshnessDays);
const freshCutoffIso = isoDate(freshCutoff);

const coveredSet = new Set<string>();
const coveredByCountOnly = new Set<string>(); // old-rule shadow, telemetry only
const staleNowPending: Array<{ symbol: string; exchange: string; max_record_date: string | null }> = [];
const BATCH = 25;
if (!forceRefresh) {
  for (let i = 0; i < targetsN500.length; i += BATCH) {
    const sl = targetsN500.slice(i, i + BATCH);
    const probes = await Promise.all(sl.map(async (t) => {
      const [{ count }, { data: maxRow }] = await Promise.all([
        supabase
          .from('stock_picker_ohlcv_history')
          .select('*', { count: 'exact', head: true })
          .eq('symbol', t.symbol).eq('exchange', t.exchange),
        supabase
          .from('stock_picker_ohlcv_history')
          .select('record_date')
          .eq('symbol', t.symbol).eq('exchange', t.exchange)
          .order('record_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const maxDate = (maxRow?.record_date as string | undefined) ?? null;
      return { t, count: count ?? 0, maxDate };
    }));
    for (const { t, count, maxDate } of probes) {
      const key = `${t.symbol}|${t.exchange}`;
      if (count >= 20) coveredByCountOnly.add(key);
      const fresh = maxDate !== null && maxDate >= freshCutoffIso;
      if (count >= 20 && fresh) {
        coveredSet.add(key);
      } else if (count >= 20 && !fresh) {
        staleNowPending.push({ symbol: t.symbol, exchange: t.exchange, max_record_date: maxDate });
      }
    }
  }
}
const skippedAlready = coveredSet.size;
const pending = forceRefresh
  ? targetsN500.slice()
  : targetsN500.filter((t) => !coveredSet.has(`${t.symbol}|${t.exchange}`));
```

**Telemetry additions** (extend the response JSON at lines 561-579 and the cursor `config_value` at lines 544-559):

Response JSON — add:
```ts
coverage_rule: 'rows_ge_20_and_fresh_within_days',
coverage_freshness_days: freshnessDays,
force_refresh: forceRefresh,
symbols_covered_by_count_only: coveredByCountOnly.size,
symbols_stale_now_pending: staleNowPending.length,
stale_sample: staleNowPending.slice(0, 20),
```

Cursor `config_value` — add:
```ts
coverage_rule: 'rows_ge_20_and_fresh_within_days',
coverage_freshness_days: freshnessDays,
force_refresh: forceRefresh,
stale_symbols_now_pending: staleNowPending.length,
```

---

### Scope confirmation
- Files changed: 1 (`supabase/functions/sync-ohlcv-history/index.ts`)
- Migrations: 0
- Config keys read (not written): `ohlcv_coverage_freshness_days` (new key, defaults to 3 when absent)
- Untouched: `processOne`, fetch functions, plain chunk mode, cursor upsert shape (only `config_value` payload extended)

### Runtime estimate — clearing ~788 pending via plain chunk mode
- Config: `ohlcv_n500_chunk_size` default 40, `ohlcv_chunk_sleep_ms` default 1000 ms, `ohlcv_max_runtime_ms` default 90 000 ms.
- Per-symbol wall time: ~1 s fetch + 1 s sleep ≈ 2 s → ~45 symbols max per invocation before the runtime guard trips (chunk_size 40 will finish inside the window; ~80 s per run).
- Invocations to drain 788 pending: `ceil(788 / 40) ≈ 20 invocations`. At one invocation per cron tick, that is 20 ticks; on manual back-to-back invocations, ~27 min of wall time.
- Bug 1's fix increases `candidates_resolved` from 360 → ~788, so the first post-fix run will show pending jump before draining begins.

### Rollback
- Bug 2: set `stock_picker_runtime_config.ohlcv_coverage_freshness_days = 999999` — every symbol is "fresh", freshness gate becomes a no-op, behavior reverts to count-only coverage. `force_refresh` defaults to false so it stays inert.
- Bug 1: revert the paginated block to the single `.in()` call. No data written by this change.

### STOP-Gate
Awaiting explicit approval before applying. No files edited and no function deployed until you approve.
