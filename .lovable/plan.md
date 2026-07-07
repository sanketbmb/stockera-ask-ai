# Fundamentals + News Sync Remediation (PLAN ONLY — no deploy)

## 1) Root-cause summary

Both `sync-fundamentals-finedge` and `sync-news-marketaux` currently hard-gate on
`universe_override_enabled=true` and read `universe_override_symbols` as the
work list. That config still holds the legacy value (`500` — a scalar, not
even a valid symbol array), so:

- `parseOverrideSymbols` returns `[]` for news → early exit "no override
symbols", or (given the fundamentals telemetry showing `processed:3`)
something upstream is passing a tiny sample. Either way, **neither function
ever sees the 788-member active snapshot** (`57d60a8d-…`).
- Fundamentals cache is null across the sampled universe.
- News cache is empty for 9/10 sampled symbols. The one hot symbol
(`AAYUSHBULL`, 407 items/30d) is a **false-positive match**: the RSS
fallback matches short/weak tokens even when Marketaux returned nothing —
a common brand string is catching unrelated headlines.
- LTP sync already migrated to the snapshot pattern and is healthy — do not
touch.

## 2) Exact files to edit

Two edge functions, no schema changes, no cron changes, no UI:

- `supabase/functions/sync-fundamentals-finedge/index.ts`
- `supabase/functions/sync-news-marketaux/index.ts`

Optionally (Step 6, config-only, decided by founder): repair
`universe_override_symbols` value via `supabase--insert` — the code will no
longer depend on it.

## 3) Exact logic changes

### 3a) Universe resolver (identical helper inlined in both files)

Mirror the LTP sync's snapshot reader:

1. Read `active_universe_snapshot_id`, `universe_override_enabled`,
  `universe_override_symbols` from `stock_picker_runtime_config`.
2. **Primary**: page `stock_picker_universe_snapshot_member` where
  `universe_snapshot_id = <snapshot_id>` in chunks of 1000, ordered by
   `symbol ASC`, projecting `symbol, exchange, segment` (fundamentals also
   reads `dhan_security_id` for the equity-cleanliness gate).
3. **Fallback (safety valve only)**: if the snapshot read returns 0 members
  AND `universe_override_enabled=true` AND `universe_override_symbols`
   parses to a non-empty array, use the override list. If snapshot_id is
   missing or unreadable, fall back the same way. Do NOT gate on
   `universe_override_enabled`.
4. Emit `universe_mode: "active_snapshot" | "override_fallback" | "empty"`
  in telemetry.

Drop the current top-level `if (universe_override_enabled !== true) return skipped` gate in both files.

### 3b) Rolling cursor + per-tick budget (both files)

New runtime-config keys (read with sane defaults, no migration needed —
`stock_picker_runtime_config` is a KV table, missing keys just use defaults):


| Key                          | Default | Purpose                             |
| ---------------------------- | ------- | ----------------------------------- |
| `fundamentals_cursor_symbol` | `null`  | last-processed symbol in prior tick |
| `fundamentals_per_tick_max`  | `40`    | hard cap per invocation             |
| `news_cursor_symbol`         | `null`  | same, for news                      |
| `news_per_tick_max`          | `60`    | hard cap per invocation             |


Loop shape (both files):

1. Sort resolved members ascending by symbol.
2. Find start index = first member with `symbol > cursor_symbol` (or 0 if
  cursor null / not found).
3. Iterate up to `per_tick_max` members, wrapping to index 0 once when the
  tail is reached. Track `wrapped_to_start: boolean`.
4. After the loop, upsert the new cursor = last-processed symbol (or
  `null` if we ended exactly at the tail with no wrap).
5. Existing `fresh_skip` / `pending_runtime_cap` behaviors preserved and
  counted separately from the cursor advance so a fresh-skip still counts
   toward `members_seen` but not toward Finedge/Marketaux quota.

Coverage math is in §4.

### 3c) Fundamentals-specific preservations

- FinEdge → Twelve Data fallback ladder, transient retry (429/5xx),
auth-abort, upsert into `fundamentals_cache`, `capBand` — all unchanged.
- `isCleanEquity` gate unchanged.
- `fundamentals_skip_if_fresh_minutes` idempotent skip unchanged.

### 3d) News-specific preservations + matching-quality fix

Preserve Marketaux fan-out order (ticker.NS → ticker.BO → entity_search →
company_name → short_token) and the RSS pre-fetch + per-symbol matching.
Fix the false-positive matcher:

- Require the RSS candidate to satisfy **at least one strong hit**
(unchanged) **AND** that the hit come from either the full
`normalized` company name or the ticker `sym` where `sym.length >= 4`.
Short tickers alone stay weak (already the case).
- Add a **stopword blocklist** for `token` (first two words of normalized
name): if `token` matches common Indian brand/generic words
(`tata`, `reliance`, `bharat`, `bharti`, `india`, `indian`, `national`,
`state`, `bank`, `power`, `steel`, `motors`, `finance`, `capital`,
`industries`, `bull`, `bullion`, `gold`, `silver`, `metal`, `energy`,
`oil`, `gas`, `cement`, `pharma`, `chem`, `chemicals`), the `token`
candidate becomes **weak** (cannot be the sole strong hit). This is what
is causing `AAYUSHBULL` (token likely `aayush bull` → `bull` collision or
weak match) to over-fire.
- Cap RSS hits per feed per symbol at `perSymbolMax` (already implicit via
outer cap) AND enforce a per-tick global RSS budget of
`perSymbolMax × per_tick_max × 2` items to protect news_cache from
a run-away feed.

### 3e) Telemetry (both files, `details` object and `cron_run_log.metrics`)

Add / ensure present:

```
universe_mode:          "active_snapshot" | "override_fallback" | "empty"
snapshot_id:            <uuid|null>
members_total:          <int>          // full resolved universe size
members_seen:           <int>          // processed this tick (incl. fresh_skip)
cursor_start:           <symbol|null>
cursor_end:             <symbol|null>
wrapped_to_start:       <bool>
processed:              <int>          // successful writes this tick
coverage_after_tick:    <int>          // rows in target cache with recent data
```

All existing keys retained.

## 4) Coverage math (788 members)

Full universe = 788.

### Fundamentals (`fundamentals_per_tick_max = 40`)

- Cron: `30 11 * * 1-5` (daily 11:30 UTC = 17:00 IST, once/day).
- Per-tick throughput at `finedge_request_sleep_ms=800` (2 calls/symbol +
optional TD fallback): ≈ 2–4 s/symbol wall-clock, ≈ 40 symbols in
80–160 s. `fundamentals_max_runtime_ms=60000` will typically cap this
around 25–35 symbols per tick.
- Coverage cadence at once/day, 30/tick effective: `ceil(788/30) ≈ 27` days
for a full cold sweep.
- **Recommendation (config-only, no code diff):** bump the fundamentals
cron to hourly during market days, or every 30 min. Cadence change is
founder-approved separately; the code supports it via the cursor. In the
interim, `fresh_skip` (1440 min TTL) means once a symbol is filled it
stays warm for ~24h, so steady state is: refill 30/day → 26 days to first
full coverage, then daily maintenance of only the ~30 symbols that expire.

### News (`news_per_tick_max = 60`)

- Cron: `0,30 3-12 * * 1-5` (every 30 min, 03:00–12:30 UTC / 08:30–18:00 IST,
Mon–Fri) = 20 ticks/day.
- Per-tick throughput at `news_marketaux_request_sleep_ms=600` × up to 5
Marketaux variants + RSS re-scan of cached feeds: ≈ 1.5–3 s/symbol.
60 symbols ≈ 90–180 s. Marketaux free-tier daily quota is the binding
constraint at large per-tick sizes; 60 keeps daily API calls bounded to
`60 × 5 × 20 = 6000` at absolute worst, `~1200–2000` typical (fan-out
short-circuits on first non-empty variant).
- **Full sweep**: `ceil(788/60) = 14 ticks ≈ 7 hours`. Full universe
refreshed roughly **twice per market day**.

Both numbers are conservative — `fresh_skip` in fundamentals and Marketaux
short-circuit in news raise effective throughput.

## 5) Cursor decision

**Option B (retire per-run cursor and process full universe per tick)** —
rejected here for both syncs because:

- Fundamentals: 788 × 2 upstream calls at 800 ms would take 21 minutes,
well beyond edge function runtime and FinEdge daily quota.
- News: 788 × up to 5 Marketaux calls per tick would blow the Marketaux
free-tier daily quota within one tick.

**Option A (rolling cursor + per-tick budget)** — chosen. Cursor stored in
`stock_picker_runtime_config` as scalar text.

## 6) `universe_override_symbols` config anomaly

Current value: scalar `500` (not an array). Both syncs will no longer read
this key on the happy path — LTP already ignores it as primary.

Recommendation: **leave the value in place**, do not repair. Reason:
`universe_override_enabled=true` is still meaningful as an emergency safety
valve (both functions will fall back to override only if the snapshot is
empty). Repairing `500` to an actual symbol array is a founder decision
tied to whether the override is intended as a debug switch or a legit
allow-list. **No code depends on it after this change.**

If founder wants to normalize: a one-line `supabase--insert` upsert setting
`universe_override_symbols = []` (empty array) makes the fallback yield 0
members and thus force snapshot-only mode. Not blocking.

## 7) Risks

1. **Cursor stall**: if a bad symbol throws before cursor upsert, the tick
  still advances (cursor upsert is in a `finally`-like block after the
   loop, using the last successfully-attempted symbol). Symbols that
   consistently error will not block the cursor; they will be revisited on
   the next wrap and re-count as errors.
2. **Snapshot swap mid-run**: `active_universe_snapshot_id` change between
  ticks resets the effective universe; cursor may point to a symbol no
   longer present. Handled: start-index search uses `symbol > cursor`, so
   an absent cursor symbol falls through to the next present symbol.
3. **RSS matcher change** narrows matches — could drop legitimate
  `AAYUSHBULL` items. Mitigation: `sym` (length 10) is a strong candidate
   independent of the token stopword list, so the ticker itself still
   matches ticker-tagged headlines.
4. **Fundamentals quota**: at 30/day the cold sweep is ~26 days. If founder
  accepts this cadence, no action. If not, bump cron cadence separately
   (config-only, no code change).
5. **Backward compat**: telemetry adds keys; no consumer parses the details
  object strictly, so additive-safe. `last_sync_*` config-value shape
   preserved (existing keys unchanged).
6. **Fallback path never exercised in prod** → we ship a unit-style probe
  in verification (see §9).

## 8) Rollback plan

Revert of the two files. No DB state to unwind — the new cursor keys are
additive and ignored by any older code. `fundamentals_cache` and
`news_cache` writes remain valid regardless of universe source.

## 9) Post-deploy verification SQL

Run within one full news cycle (30 min) and one fundamentals tick (1 h if
cron bumped, else check next scheduled 11:30 UTC):

```sql
-- (a) telemetry proves snapshot path is active
SELECT metrics->>'status' AS status,
       metrics->'details'->>'universe_mode' AS mode,
       metrics->'details'->>'members_total' AS members_total,
       metrics->'details'->>'members_seen' AS members_seen,
       metrics->'details'->>'cursor_start' AS cursor_start,
       metrics->'details'->>'cursor_end' AS cursor_end,
       metrics->'details'->>'wrapped_to_start' AS wrapped,
       started_at
FROM cron_run_log
WHERE function_name IN ('sync-fundamentals-finedge', 'sync-news-marketaux')
ORDER BY started_at DESC LIMIT 10;

-- (b) universe_mode should be 'active_snapshot' and members_total = 788

-- (c) fundamentals coverage is climbing across the snapshot
SELECT COUNT(*) FILTER (WHERE fc.market_cap_rs IS NOT NULL) AS with_mcap,
       COUNT(*) AS members
FROM stock_picker_universe_snapshot_member m
LEFT JOIN fundamentals_cache fc
  ON fc.symbol = m.symbol AND fc.exchange = m.exchange
WHERE m.universe_snapshot_id =
  (SELECT (config_value #>> '{}')::text
     FROM stock_picker_runtime_config
    WHERE config_key = 'active_universe_snapshot_id');

-- (d) news coverage — symbols with any item in last 30d
SELECT COUNT(DISTINCT m.symbol) FILTER (
  WHERE EXISTS (
    SELECT 1 FROM news_cache n
     WHERE n.symbol = m.symbol
       AND n.published_at >= now() - interval '30 days'
  )
) AS symbols_with_recent_news,
COUNT(*) AS members
FROM stock_picker_universe_snapshot_member m
WHERE m.universe_snapshot_id =
  (SELECT (config_value #>> '{}')::text
     FROM stock_picker_runtime_config
    WHERE config_key = 'active_universe_snapshot_id');

-- (e) matcher-quality regression: AAYUSHBULL news volume should drop
SELECT symbol, COUNT(*) AS items_30d
FROM news_cache
WHERE symbol = 'AAYUSHBULL'
  AND published_at >= now() - interval '30 days'
GROUP BY symbol;
-- Expect a large drop from 407 toward single/low-double digits.

-- (f) cursor is being upserted
SELECT config_key, config_value, updated_at
FROM stock_picker_runtime_config
WHERE config_key IN ('fundamentals_cursor_symbol','news_cursor_symbol');
```

## 10) One-time backfill after deploy?

**Not required for the transport migration.** The rolling cursor will
organically sweep 788 members:

- News: full sweep in 7 h (1 market day) after deploy.
- Fundamentals: full sweep in ~26 days at current daily cadence, or
hours/day depending on any cron-cadence bump the founder approves
separately.

**Optional accelerator (post-approval):** manually invoke each function
several times in sequence right after deploy — each call advances the
cursor by `per_tick_max`. Two invocations in a row against news would
cover ~120 symbols immediately; ~14 invocations completes news; ~27
completes fundamentals. This is safe (respects sleep pacing and upstream
quotas) but is a founder-triggered operation, not part of this plan.

## Estimate

- Files touched: **2**
- Additive telemetry, no schema changes, no cron changes, no UI.
- LTP sync, stock-recommendation-query, and downstream analytics: **untouched**.  
  
note :  

  # Fundamentals + News Sync Remediation (PLAN ONLY — no deploy)
  ## 1) Root-cause summary
  Both `sync-fundamentals-finedge` and `sync-news-marketaux` currently hard-gate on
  `universe_override_enabled=true` and read `universe_override_symbols` as the
  work list. That config still holds the legacy value `500` — a scalar, not
  even a valid symbol array), so:
  - `parseOverrideSymbols` returns `[]` for news → early exit "no override
    symbols", or (given the fundamentals telemetry showing `processed:3`)
    something upstream is passing a tiny sample. Either way, **neither function
    ever sees the 788-member active snapshot** `57d60a8d-…`).
  - Fundamentals cache is null across the sampled universe.
  - News cache is empty for 9/10 sampled symbols. The one hot symbol
    `AAYUSHBULL`, 407 items/30d) is a **false-positive match**: the RSS
    fallback matches short/weak tokens even when Marketaux returned nothing —
    a common brand string is catching unrelated headlines.
  - LTP sync already migrated to the snapshot pattern and is healthy — do not
    touch.
  ## 2) Exact files to edit
  Two edge functions, no schema changes, no cron changes, no UI:
  - `supabase/functions/sync-fundamentals-finedge/index.ts`
  - `supabase/functions/sync-news-marketaux/index.ts`
  Optionally (Step 6, config-only, decided by founder): repair
  `universe_override_symbols` value via `supabase--insert` — the code will no
  longer depend on it.
  ## 3) Exact logic changes
  ### 3a) Universe resolver (identical helper inlined in both files)
  Mirror the LTP sync's snapshot reader:
  1. Read `active_universe_snapshot_id`, `universe_override_enabled`,
     `universe_override_symbols` from `stock_picker_runtime_config`.
  2. **Primary**: page `stock_picker_universe_snapshot_member` where
     `universe_snapshot_id = <snapshot_id>` in chunks of 1000, ordered by
     `symbol ASC`, projecting `symbol, exchange, segment` (fundamentals also
     reads `dhan_security_id` for the equity-cleanliness gate).
  3. **Fallback (safety valve only)**: if the snapshot read returns 0 members
     AND `universe_override_enabled=true` AND `universe_override_symbols`
     parses to a non-empty array, use the override list. If snapshot_id is
     missing or unreadable, fall back the same way. Do NOT gate on
     `universe_override_enabled`.
  4. Emit `universe_mode: "active_snapshot" | "override_fallback" | "empty"`
     in telemetry.
  Drop the current top-level `if (universe_override_enabled !== true) return
  skipped` gate in both files.
  ### 3b) Rolling cursor + per-tick budget (both files)
  New runtime-config keys (read with sane defaults, no migration needed —
  `stock_picker_runtime_config` is a KV table, missing keys just use defaults):
  | Key | Default | Purpose |
  |---|---|---|
  | `fundamentals_cursor_symbol` | `null` | last-processed symbol in prior tick |
  | `fundamentals_per_tick_max` | `40` | hard cap per invocation |
  | `news_cursor_symbol` | `null` | same, for news |
  | `news_per_tick_max` | `60` | hard cap per invocation |
  Loop shape (both files):
  1. Sort resolved members ascending by symbol.
  2. Find start index = first member with `symbol > cursor_symbol` (or 0 if
     cursor null / not found).
  3. Iterate up to `per_tick_max` members, wrapping to index 0 once when the
     tail is reached. Track `wrapped_to_start: boolean`.
  4. After the loop, upsert the new cursor = last-processed symbol (or
     `null` if we ended exactly at the tail with no wrap).
  5. Existing `fresh_skip` / `pending_runtime_cap` behaviors preserved and
     counted separately from the cursor advance so a fresh-skip still counts
     toward `members_seen` but not toward Finedge/Marketaux quota.
  Coverage math is in §4.
  ### 3c) Fundamentals-specific preservations
  - FinEdge → Twelve Data fallback ladder, transient retry (429/5xx),
    auth-abort, upsert into `fundamentals_cache`, `capBand` — all unchanged.
  - `isCleanEquity` gate unchanged.
  - `fundamentals_skip_if_fresh_minutes` idempotent skip unchanged.
  ### 3d) News-specific preservations + matching-quality fix
  Preserve Marketaux fan-out order (ticker.NS → [ticker.BO](http://ticker.BO) → entity_search →
  company_name → short_token) and the RSS pre-fetch + per-symbol matching.
  Fix the false-positive matcher:
  - Require the RSS candidate to satisfy **at least one strong hit**
    (unchanged) **AND** that the hit come from either the full
    `normalized` company name or the ticker `sym` where `sym.length >= 4`.
    Short tickers alone stay weak (already the case).
  - Add a **stopword blocklist** for `token` (first two words of normalized
    name): if `token` matches common Indian brand/generic words
    `tata`, `reliance`, `bharat`, `bharti`, `india`, `indian`, `national`,
    `state`, `bank`, `power`, `steel`, `motors`, `finance`, `capital`,
    `industries`, `bull`, `bullion`, `gold`, `silver`, `metal`, `energy`,
    `oil`, `gas`, `cement`, `pharma`, `chem`, `chemicals`), the `token`
    candidate becomes **weak** (cannot be the sole strong hit). This is what
    is causing `AAYUSHBULL` (token likely `aayush bull` → `bull` collision or
    weak match) to over-fire.
  - Cap RSS hits per feed per symbol at `perSymbolMax` (already implicit via
    outer cap) AND enforce a per-tick global RSS budget of
    `perSymbolMax × per_tick_max × 2` items to protect news_cache from
    a run-away feed.
  ### 3e) Telemetry (both files, `details` object and `cron_run_log.metrics`)
  Add / ensure present:
  ```
  universe_mode:          "active_snapshot" | "override_fallback" | "empty"
  snapshot_id:            <uuid|null>
  members_total:          <int>          // full resolved universe size
  members_seen:           <int>          // processed this tick (incl. fresh_skip)
  cursor_start:           <symbol|null>
  cursor_end:             <symbol|null>
  wrapped_to_start:       <bool>
  processed:              <int>          // successful writes this tick
  coverage_after_tick:    <int>          // rows in target cache with recent data
  ```
  All existing keys retained.
  ## 4) Coverage math (788 members)
  Full universe = 788.
  ### Fundamentals `fundamentals_per_tick_max = 40`)
  - Cron: `30 11 * * 1-5` (daily 11:30 UTC = 17:00 IST, once/day).
  - Per-tick throughput at `finedge_request_sleep_ms=800` (2 calls/symbol +
    optional TD fallback): ≈ 2–4 s/symbol wall-clock, ≈ 40 symbols in
    80–160 s. `fundamentals_max_runtime_ms=60000` will typically cap this
    around 25–35 symbols per tick.
  - Coverage cadence at once/day, 30/tick effective: `ceil(788/30) ≈ 27` days
    for a full cold sweep.
  - **Recommendation (config-only, no code diff):** bump the fundamentals
    cron to hourly during market days, or every 30 min. Cadence change is
    founder-approved separately; the code supports it via the cursor. In the
    interim, `fresh_skip` (1440 min TTL) means once a symbol is filled it
    stays warm for ~24h, so steady state is: refill 30/day → 26 days to first
    full coverage, then daily maintenance of only the ~30 symbols that expire.
  ### News `news_per_tick_max = 60`)
  - Cron: `0,30 3-12 * * 1-5` (every 30 min, 03:00–12:30 UTC / 08:30–18:00 IST,
    Mon–Fri) = 20 ticks/day.
  - Per-tick throughput at `news_marketaux_request_sleep_ms=600` × up to 5
    Marketaux variants + RSS re-scan of cached feeds: ≈ 1.5–3 s/symbol.
    60 symbols ≈ 90–180 s. Marketaux free-tier daily quota is the binding
    constraint at large per-tick sizes; 60 keeps daily API calls bounded to
    `60 × 5 × 20 = 6000` at absolute worst, `~1200–2000` typical (fan-out
    short-circuits on first non-empty variant).
  - **Full sweep**: `ceil(788/60) = 14 ticks ≈ 7 hours`. Full universe
    refreshed roughly **twice per market day**.
  Both numbers are conservative — `fresh_skip` in fundamentals and Marketaux
  short-circuit in news raise effective throughput.
  ## 5) Cursor decision
  **Option B (retire per-run cursor and process full universe per tick)** —
  rejected here for both syncs because:
  - Fundamentals: 788 × 2 upstream calls at 800 ms would take 21 minutes,
    well beyond edge function runtime and FinEdge daily quota.
  - News: 788 × up to 5 Marketaux calls per tick would blow the Marketaux
    free-tier daily quota within one tick.
  **Option A (rolling cursor + per-tick budget)** — chosen. Cursor stored in
  `stock_picker_runtime_config` as scalar text.
  ## 6) `universe_override_symbols` config anomaly
  Current value: scalar `500` (not an array). Both syncs will no longer read
  this key on the happy path — LTP already ignores it as primary.
  Recommendation: **leave the value in place**, do not repair. Reason:
  `universe_override_enabled=true` is still meaningful as an emergency safety
  valve (both functions will fall back to override only if the snapshot is
  empty). Repairing `500` to an actual symbol array is a founder decision
  tied to whether the override is intended as a debug switch or a legit
  allow-list. **No code depends on it after this change.**
  If founder wants to normalize: a one-line `supabase--insert` upsert setting
  `universe_override_symbols = []` (empty array) makes the fallback yield 0
  members and thus force snapshot-only mode. Not blocking.
  ## 7) Risks
  1. **Cursor stall**: if a bad symbol throws before cursor upsert, the tick
     still advances (cursor upsert is in a `finally`-like block after the
     loop, using the last successfully-attempted symbol). Symbols that
     consistently error will not block the cursor; they will be revisited on
     the next wrap and re-count as errors.
  2. **Snapshot swap mid-run**: `active_universe_snapshot_id` change between
     ticks resets the effective universe; cursor may point to a symbol no
     longer present. Handled: start-index search uses `symbol > cursor`, so
     an absent cursor symbol falls through to the next present symbol.
  3. **RSS matcher change** narrows matches — could drop legitimate
     `AAYUSHBULL` items. Mitigation: `sym` (length 10) is a strong candidate
     independent of the token stopword list, so the ticker itself still
     matches ticker-tagged headlines.
  4. **Fundamentals quota**: at 30/day the cold sweep is ~26 days. If founder
     accepts this cadence, no action. If not, bump cron cadence separately
     (config-only, no code change).
  5. **Backward compat**: telemetry adds keys; no consumer parses the details
     object strictly, so additive-safe. `last_sync_*` config-value shape
     preserved (existing keys unchanged).
  6. **Fallback path never exercised in prod** → we ship a unit-style probe
     in verification (see §9).
  ## 8) Rollback plan
  Revert of the two files. No DB state to unwind — the new cursor keys are
  additive and ignored by any older code. `fundamentals_cache` and
  `news_cache` writes remain valid regardless of universe source.
  ## 9) Post-deploy verification SQL
  Run within one full news cycle (~30 min) and one fundamentals tick (~1 h if
  cron bumped, else check next scheduled 11:30 UTC):
  ```sql
  -- (a) telemetry proves snapshot path is active
  SELECT metrics->>'status' AS status,
         metrics->'details'->>'universe_mode' AS mode,
         metrics->'details'->>'members_total' AS members_total,
         metrics->'details'->>'members_seen' AS members_seen,
         metrics->'details'->>'cursor_start' AS cursor_start,
         metrics->'details'->>'cursor_end' AS cursor_end,
         metrics->'details'->>'wrapped_to_start' AS wrapped,
         started_at
  FROM cron_run_log
  WHERE function_name IN ('sync-fundamentals-finedge', 'sync-news-marketaux')
  ORDER BY started_at DESC LIMIT 10;
  -- (b) universe_mode should be 'active_snapshot' and members_total = 788
  -- (c) fundamentals coverage is climbing across the snapshot
  SELECT COUNT(*) FILTER (WHERE [fc.market](http://fc.market)_cap_rs IS NOT NULL) AS with_mcap,
         COUNT(*) AS members
  FROM stock_picker_universe_snapshot_member m
  LEFT JOIN fundamentals_cache fc
    ON fc.symbol = m.symbol AND [fc.exchange](http://fc.exchange) = [m.exchange](http://m.exchange)
  WHERE m.universe_snapshot_id =
    (SELECT (config_value #>> '{}')::text
       FROM stock_picker_runtime_config
      WHERE config_key = 'active_universe_snapshot_id');
  -- (d) news coverage — symbols with any item in last 30d
  SELECT COUNT(DISTINCT m.symbol) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM news_cache n
       WHERE n.symbol = m.symbol
         AND n.published_at >= now() - interval '30 days'
    )
  ) AS symbols_with_recent_news,
  COUNT(*) AS members
  FROM stock_picker_universe_snapshot_member m
  WHERE m.universe_snapshot_id =
    (SELECT (config_value #>> '{}')::text
       FROM stock_picker_runtime_config
      WHERE config_key = 'active_universe_snapshot_id');
  -- (e) matcher-quality regression: AAYUSHBULL news volume should drop
  SELECT symbol, COUNT(*) AS items_30d
  FROM news_cache
  WHERE symbol = 'AAYUSHBULL'
    AND published_at >= now() - interval '30 days'
  GROUP BY symbol;
  -- Expect a large drop from 407 toward single/low-double digits.
  -- (f) cursor is being upserted
  SELECT config_key, config_value, updated_at
  FROM stock_picker_runtime_config
  WHERE config_key IN ('fundamentals_cursor_symbol','news_cursor_symbol');
  ```
  ## 10) One-time backfill after deploy?
  **Not required for the transport migration.** The rolling cursor will
  organically sweep 788 members:
  - News: full sweep in ~7 h (~1 market day) after deploy.
  - Fundamentals: full sweep in ~26 days at current daily cadence, or
    hours/day depending on any cron-cadence bump the founder approves
    separately.
  **Optional accelerator (post-approval):** manually invoke each function
  several times in sequence right after deploy — each call advances the
  cursor by `per_tick_max`. Two invocations in a row against news would
  cover ~120 symbols immediately; ~14 invocations completes news; ~27
  completes fundamentals. This is safe (respects sleep pacing and upstream
  quotas) but is a founder-triggered operation, not part of this plan.
  ## Estimate
  - Files touched: **2**
  - Additive telemetry, no schema changes, no cron changes, no UI.
  - LTP sync, stock-recommendation-query, and downstream analytics: **untouched**.
  &nbsp;