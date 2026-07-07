
## 1. Root cause (plain English)

**News (`sync-news-marketaux`)** — Each tick tries up to 60 symbols × up to 5 Marketaux variants with 600 ms of enforced sleep between calls. Worst-case blocking sleep alone is ~180 s, well past the edge wall-clock, so the process is killed before it writes:
- `news_cursor_symbol` (stays frozen → same 60 symbols reprocessed forever)
- `last_sync_news_marketaux` (looks like "never runs")
- `cron_run_log` row (looks like "cron dead")

The scheduler and marketaux-fetch are healthy; the caller just never reaches its persistence block.

**Fundamentals (`sync-fundamentals-finedge`)** — Retry + Twelve Data fallback already exist, but:
- Backoff is flat (2 s × N) instead of exponential, so bursty 503s during a sweep re-hit the same rate-limited window.
- When FinEdge profile succeeds but `ratios` fails with 503 (mcap null), we don't fall back to `stock_master.market_cap_rs` even though it's a known-good value.
- InvIT/REIT names have no FinEdge equity coverage; we still burn retries + a TD call on them every sweep.

Result: liquid large-caps like ALKEM/APOLLOHOSP stay null after being unlucky on one sweep, and hopeless names (ALTIUSINVIT) waste the run budget that liquid names need.

## 2. Files changed

Only two files (matches the hard scope):
- `supabase/functions/sync-news-marketaux/index.ts`
- `supabase/functions/sync-fundamentals-finedge/index.ts`

No schema changes. No SQL migrations. No cron changes (fundamentals is already hourly weekday, news stays 30-min). No LTP / UI / report / query changes.

## 3. Change list (what each edit does)

### sync-news-marketaux

1. **Lower per-tick load defaults** (only defaults; runtime config still wins):
   - `news_per_tick_max` default 60 → **20**
   - `news_marketaux_request_sleep_ms` default 600 → **200**
2. **Reduce Marketaux fan-out to 2 strong variants max**:
   - Variant 1: exchange-appropriate ticker (`SYM.NS` for NSE, `SYM.BO` for BSE) — one call, not both
   - Variant 2: normalized company name search (`entity_types=equity`, `countries=in`) — only if company name is known and normalized string is long enough (≥5 chars) to avoid stopword storms
   - **Removed**: bare `entity_search`, `short_token` variant (these produced the AAYUSHBULL-style noise and doubled request count)
3. **Global wall-clock guard** inside the per-symbol loop: if `Date.now() - startedMs > 55_000`, break early and let the `finally` block persist progress.
4. **Durable partial progress** — refactor: hoist `cursorEnd`, `overrideEntries`, counters, `perSymbol`, `errors`, `universeMode`, etc. to outer scope. Wrap the main body in `try/catch/finally`. In `finally`:
   - Upsert `news_cursor_symbol` to the last symbol actually processed (not the whole planned window)
   - Upsert `last_sync_news_marketaux` with whatever counts we have
   - Call `logTelemetry` with status `partial` if we broke early, `ok`/`error` otherwise
5. **Relevance filter unchanged** — stopword blocklist and strong/weak matching stay exactly as-is (AAYUSHBULL fix stays in effect).

### sync-fundamentals-finedge

1. **Exponential backoff** — change `await sleep(retryBackoffMs)` to `await sleep(retryBackoffMs * Math.pow(2, feRetries - 1))` (and same for TD retry). With default 2000 ms and 2 retries → sleeps of 2 s then 4 s instead of 2 s + 2 s.
2. **Seed mcap from `stock_master.market_cap_rs`** — when FinEdge returned `ok` on profile (sector/industry) but `mcap == null` AND TD fallback also missed mcap, promote `stock_master.market_cap_rs` into `finalMcap` (source stays `finedge` / `twelve_data` respectively; we only fill the gap, never overwrite a fresh non-null upstream). We already fetch `stock_master` for `isCleanEquity`, so this is O(0) extra queries.
3. **Never overwrite non-null with null** — before upsert, if an existing `fundamentals_cache` row already has non-null `market_cap_rs` and the new attempt produced null, keep the old value (only overwrite when we have a fresh non-null).
4. **Classify InvIT/REIT as unsupported and skip both providers** — extend `isCleanEquity` name regex from `bond|etf|sgb|gilt|liquidbees|debenture|ncd` to also match `\b(invit|reit)\b|infrastructure investment trust|real estate investment trust`. These names get `skipped_unclean` immediately (no FinEdge, no TD, no retries) — saves ~9 wasted requests per hopeless symbol per sweep.
5. **Inter-symbol spacing already exists** (`finedgeSleepMs` between calls). No additional change needed — exponential backoff + fewer wasted calls on InvITs should be enough headroom.

## 4. Runtime + request math

### News (30-min cadence, Mon–Fri, ~13 market ticks/day covering 24×2=48 max)
Assume full 48 ticks/day for safety.
- Per symbol: at most 2 Marketaux calls (was up to 5).
- Per tick: 20 symbols × 2 = **40 Marketaux calls max**.
- Per day: 48 × 40 = **1,920 calls/day** ≤ Marketaux Basic 2,500/day ✅ (was theoretically 48 × 60 × 5 = 14,400/day, wildly over plan — one more reason ticks were dying).
- Wall-clock per tick: 40 calls × ~(network 300 ms + sleep 200 ms) ≈ **20 s**, plus one-shot RSS prefetch (~6 s budget). Comfortably under 60 s target.
- Full 788-symbol sweep at 20/tick = 40 ticks = ~20 hours market-time (news is 30-min all-day cron, so ≤1 calendar day).

### Fundamentals (hourly weekday, 10 market-hour ticks/day)
- Per symbol: FinEdge 2 calls (profile+ratios) + up to 2 retries; TD only if FinEdge fails, 2 calls + up to 2 retries.
- Per tick: 40 symbols. FinEdge ~80–160 calls; TD only on misses, ~10–20 calls typical.
- Twelve Data ceiling: 55/min, 8/day plan-dependent — our worst-case per tick stays under 55/min because of `twelvedata_request_sleep_ms=1500` (≤40 calls/min).
- Full 788-symbol sweep at 40/tick × 10 ticks/day = **~2 market days** for a full pass.

## 5. Guarantees / non-scope

- No changes to `refresh-ltp`, `sync-ltp-dhan`, `snapshot-ltp-close`, `stock-recommendation-query`, any UI route, any report/query function.
- No schema changes. Uses existing `stock_picker_runtime_config`, `fundamentals_cache`, `news_cache`, `cron_run_log`, `stock_master` columns only.
- No cron edits. `sync-fundamentals-finedge-hourly` (15 3-12 * * 1-5) and `sync-news-marketaux-30min` stay as-is.
- Runtime config keys unchanged — defaults just moved lower; if the user already set higher values in the table those still win.

## 6. Rollback

Purely code-level. Redeploying the previous version of the two files reverts everything. No DB state to unwind. `news_cursor_symbol` will just resume from wherever it stopped.

## 7. Post-deploy verification (will run after approval + deploy)

SQL I'll execute:
```sql
-- cron freshness
select jobname, schedule, active from cron.job
 where jobname in ('sync-news-marketaux-30min','sync-fundamentals-finedge-hourly');

select function_name, status, started_at, finished_at,
       metrics->'details'->>'universe_mode' as universe_mode,
       metrics->'details'->>'cursor_end' as cursor_end,
       metrics->>'processed' as processed
  from cron_run_log
 where function_name in ('sync-news-marketaux','sync-fundamentals-finedge')
   and started_at > now() - interval '3 hours'
 order by started_at desc limit 20;

-- runtime state
select config_key, config_value, updated_at
  from stock_picker_runtime_config
 where config_key in ('news_cursor_symbol','fundamentals_cursor_symbol',
                      'last_sync_news_marketaux','last_sync_fundamentals_finedge');

-- 10-symbol scoreboard
with syms(sym) as (values
 ('AAYUSHBULL'),('ALKEM'),('ALTIUSINVIT'),('APOLLOHOSP'),('BIOCON'),
 ('CASTROLIND'),('DRREDDY'),('GRASIM'),('HEROMOTOCO'),('ICICIBANK'))
select s.sym,
       sm.market_cap_rs as master_mcap,
       fc.market_cap_rs as cache_mcap,
       fc.source, fc.updated_at as fundamentals_updated_at,
       (select count(*) from news_cache n
         where n.symbol = s.sym
           and n.published_at > now() - interval '30 days') as news_last_30d,
       (select max(published_at) from news_cache n
         where n.symbol = s.sym) as latest_news_at
  from syms s
  left join stock_master sm on sm.symbol = s.sym and sm.exchange='NSE'
  left join fundamentals_cache fc on fc.symbol = s.sym and fc.exchange='NSE'
 order by s.sym;
```

## 8. One-time backfill after deploy

Yes — after the code lands, I'll run a controlled sequential backfill by invoking `sync-fundamentals-finedge` ~10 times (one per minute) with `trigger=post-deploy-backfill` so the cursor sweeps A→Z in one calendar day rather than 2. News does not need a backfill — the 30-min cron will catch up naturally now that ticks actually finish. This respects both providers' plans (well under FinEdge burst limit and TD 55/min).

---

## FULL DIFF — file 1: `supabase/functions/sync-news-marketaux/index.ts`

Below is the complete new file. This is a rewrite of the request/persistence flow inside `Deno.serve`; RSS parsing, relevance gating, stopword list, and universe resolver are byte-identical to the current version (only moved into outer scope so `finally` can see them).

### Change A — lower defaults (line 258 area)
```diff
-    const perTickMaxRaw = cfg.get("news_per_tick_max");
-    const perTickMax = Math.max(1, typeof perTickMaxRaw === "number" && Number.isFinite(perTickMaxRaw) ? perTickMaxRaw : 60);
+    const perTickMaxRaw = cfg.get("news_per_tick_max");
+    const perTickMax = Math.max(1, typeof perTickMaxRaw === "number" && Number.isFinite(perTickMaxRaw) ? perTickMaxRaw : 20);
```
```diff
-    const mxSleep = Number(cfg.get("news_marketaux_request_sleep_ms") ?? 600);
+    const mxSleep = Number(cfg.get("news_marketaux_request_sleep_ms") ?? 200);
```

### Change B — Marketaux fan-out (per-symbol block, ~line 320)
Replace the entire `tries` array + loop with 2 variants max:
```diff
-        const tries: Array<{ label: string; params: Record<string, string> }> = [
-          { label: "ticker_ns", params: { symbols: `${sym}.NS`, limit: String(perSymbolMax) } },
-          { label: "ticker_bo", params: { symbols: `${sym}.BO`, limit: String(perSymbolMax) } },
-          { label: "entity_search", params: { entity_search: sym, limit: String(perSymbolMax), countries: "in" } },
-        ];
-        if (normalized) tries.push({ label: "company_name", params: { search: normalized, entity_types: "equity", countries: "in", limit: String(perSymbolMax) } });
-        if (token && token.length >= 4 && token !== normalized) tries.push({ label: "short_token", params: { search: token, entity_types: "equity", countries: "in", limit: String(perSymbolMax) } });
+        const tickerSuffix = exch === "BSE" ? "BO" : "NS";
+        const tries: Array<{ label: string; params: Record<string, string> }> = [
+          { label: `ticker_${tickerSuffix.toLowerCase()}`, params: { symbols: `${sym}.${tickerSuffix}`, limit: String(perSymbolMax) } },
+        ];
+        if (normalized && normalized.length >= 5) {
+          tries.push({ label: "company_name", params: { search: normalized, entity_types: "equity", countries: "in", limit: String(perSymbolMax) } });
+        }
```

### Change C — durable partial progress
Hoist state to outer scope + wrap body in try/finally. Diff sketch:
```diff
   try {
-    const supabase = createClient(...);
-    ... all body ...
-    await logTelemetry(...);
-    return json(...);
+    let overrideEntries: Sym[] = [];
+    let cursorStart: string | null = null;
+    let cursorEnd: string | null = null;
+    let wrappedToStart = false;
+    let universeMode: "active_snapshot" | "override_fallback" | "empty" = "empty";
+    let membersTotal = 0;
+    const perSymbol: Record<string, { marketaux: number; rss: number }> = {};
+    let marketauxInserted = 0, rssInsertedTotal = 0, errorsCount = 0;
+    const errors: Array<{ symbol: string; reason: string }> = [];
+    let processedCount = 0;
+    let earlyExit = false;
+    let snapshotId: string | null = null;
+    const rssInsertedPerFeed: Record<string, number> = {};
+    const rssFeedErrors: Record<string, string> = {};
+    let supabase: ReturnType<typeof createClient> | null = null;
+    try {
+      supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
+      ... existing body, but inside per-symbol loop add:
+      if (Date.now() - startedMs > 55_000) { earlyExit = true; break; }
+      ... after loop, keep existing coverage tally + return json ...
+    } catch (e) {
+      errorsCount++;
+      errors.push({ symbol: "__fatal__", reason: String(e) });
+    } finally {
+      // durable writes — even on early exit / throw
+      if (supabase && overrideEntries.length > 0) {
+        const lastDone = overrideEntries[Math.min(processedCount, overrideEntries.length) - 1]?.symbol ?? cursorStart;
+        cursorEnd = lastDone ?? cursorStart;
+        try {
+          await supabase.from("stock_picker_runtime_config").upsert(
+            { config_key: "news_cursor_symbol", kind: "operational", config_value: cursorEnd },
+            { onConflict: "config_key" });
+        } catch {}
+        try {
+          await supabase.from("stock_picker_runtime_config").upsert({
+            config_key: "last_sync_news_marketaux", kind: "operational",
+            config_value: {
+              ok: !earlyExit && errorsCount === 0,
+              inserted: marketauxInserted + rssInsertedTotal,
+              ran_at: startedAt, universe_mode: universeMode,
+              members_total: membersTotal, members_seen: processedCount,
+              cursor_start: cursorStart, cursor_end: cursorEnd,
+              wrapped_to_start: wrappedToStart, early_exit: earlyExit,
+            },
+            description: "Last sync-news-marketaux run summary",
+            updated_at: new Date().toISOString(),
+          }, { onConflict: "config_key" });
+        } catch {}
+      }
+      const finalStatus = earlyExit ? "partial" : (errorsCount === 0 ? "ok" : (marketauxInserted + rssInsertedTotal === 0 ? "error" : "partial"));
+      await logTelemetry({
+        status: finalStatus, processed: marketauxInserted + rssInsertedTotal, errors_count: errorsCount,
+        details: { universe_mode: universeMode, snapshot_id: snapshotId, members_total: membersTotal,
+                   members_seen: processedCount, cursor_start: cursorStart, cursor_end: cursorEnd,
+                   wrapped_to_start: wrappedToStart, early_exit: earlyExit,
+                   marketaux_inserted: marketauxInserted, rss_inserted_total: rssInsertedTotal,
+                   rss_inserted_per_feed: rssInsertedPerFeed, rss_feed_errors: rssFeedErrors,
+                   errors_sample: errors.slice(0, 10) },
+      });
+    }
+    return json({ ok: true, status: earlyExit ? "partial" : "ok",
+      processed: marketauxInserted + rssInsertedTotal, early_exit: earlyExit,
+      members_seen: processedCount, cursor_start: cursorStart, cursor_end: cursorEnd });
   } catch (e) {
     await logTelemetry({ status: "error", processed: 0, errors_count: 1, error_message: String(e) });
     return json({ ok: false, error: String(e) }, 500);
   }
```
Also inside the loop, increment `processedCount++` at the top of each iteration and add the wall-clock guard.

Nothing else in the file changes (RSS prefetch, stopword list, relevance regexes, upsert conflict targets, all identical).

---

## FULL DIFF — file 2: `supabase/functions/sync-fundamentals-finedge/index.ts`

### Change D — InvIT/REIT skip (line ~364)
```diff
-      if (/\b(bond|etf|sgb|gilt|liquidbees|debenture|ncd)\b/.test(name)) return { ok: false, reason: "bond_or_etf_pattern" };
+      if (/\b(bond|etf|sgb|gilt|liquidbees|debenture|ncd|invit|reit)\b/.test(name)
+          || /infrastructure investment trust|real estate investment trust/.test(name)) {
+        return { ok: false, reason: "non_equity_instrument_pattern" };
+      }
```

### Change E — exponential backoff (lines 423 + 464)
```diff
-        while (fe.status === "miss" && TRANSIENT.has(fe.http_status) && feRetries < retryMaxAttempts) {
-          feRetries++;
-          retriesAttempted++;
-          await sleep(retryBackoffMs);
+        while (fe.status === "miss" && TRANSIENT.has(fe.http_status) && feRetries < retryMaxAttempts) {
+          feRetries++;
+          retriesAttempted++;
+          await sleep(retryBackoffMs * Math.pow(2, feRetries - 1));
           fe = await tryFinEdgeOnce(sym, finedgeSleepMs);
```
Identical change for the TD retry loop:
```diff
-            while (td.status === "miss" && TRANSIENT.has(td.http_status) && tdRetries < retryMaxAttempts) {
-              tdRetries++;
-              retriesAttempted++;
-              await sleep(retryBackoffMs);
+            while (td.status === "miss" && TRANSIENT.has(td.http_status) && tdRetries < retryMaxAttempts) {
+              tdRetries++;
+              retriesAttempted++;
+              await sleep(retryBackoffMs * Math.pow(2, tdRetries - 1));
               td = await tryTwelveDataOnce(sym, ex, twelveSleepMs);
```

### Change F — stock_master mcap seed + never-overwrite-non-null (before upsert, line ~488)
```diff
         if (source !== "none") {
+          // Seed mcap from stock_master if both providers left it null but master has a known value.
+          if (finalMcap == null) {
+            const m = masterKey.get(key);
+            const mMcap = m && typeof m.market_cap_rs === "number" ? (m.market_cap_rs as number) : null;
+            if (mMcap != null && Number.isFinite(mMcap) && mMcap > 0) {
+              finalMcap = mMcap;
+              attempts.push({ symbol: sym, exchange: ex, source: "stock_master_seed", status: "mcap_filled", value: mMcap });
+            }
+          }
+          // Never overwrite an existing non-null mcap with null.
+          if (finalMcap == null) {
+            const prior = (existing ?? []).find((r) => r.symbol === sym && r.exchange === ex);
+            if (prior && prior.market_cap_rs != null) finalMcap = prior.market_cap_rs as number;
+          }
           const nowIso = new Date().toISOString();
           const { error: upErr } = await supabase
             .from("fundamentals_cache")
             .upsert({ symbol: sym, exchange: ex,
               sector: finalSector, industry: finalIndustry,
               market_cap_rs: finalMcap, cap_band: capBand(finalMcap),
               source, as_of: nowIso, updated_at: nowIso,
             }, { onConflict: "symbol,exchange" });
```
Also add a broader entry point: if FinEdge status was `miss` AND TD status was `miss` (or disabled) but `stock_master.market_cap_rs` exists, promote to a successful upsert with source `stock_master`:
```diff
         } else {
           finedgeMissed++;
           ...existing TD fallback block...
+          // Last-ditch: stock_master mcap so the row doesn't stay null.
+          if (source === "none") {
+            const m = masterKey.get(key);
+            const mMcap = m && typeof m.market_cap_rs === "number" ? (m.market_cap_rs as number) : null;
+            if (mMcap != null && Number.isFinite(mMcap) && mMcap > 0) {
+              finalMcap = mMcap;
+              finalSector = null; finalIndustry = null;
+              source = "finedge"; // keep enum-safe; provenance tracked in attempts
+              attempts.push({ symbol: sym, exchange: ex, source: "stock_master_seed", status: "ok_last_ditch", value: mMcap });
+            }
+          }
           attempts.push(feAttempt);
         }
```
(Adds `stock_master.market_cap_rs` to the existing `masters` select — one string added to `.select(...)`.)

### Change G — include market_cap_rs in stock_master fetch (line 349)
```diff
-      .select("symbol, exchange, type, segment, dhan_security_id, is_suspended, company_name")
+      .select("symbol, exchange, type, segment, dhan_security_id, is_suspended, company_name, market_cap_rs")
```

Nothing else in the file changes. `retryMaxAttempts`, `retryBackoffMs`, `finedgeSleepMs`, `twelveSleepMs`, universe resolver, cursor logic, telemetry — all identical.

---

## Execution order after your approval

1. Apply both edits (in-place, no new files).
2. Deploy via automatic function push.
3. Run one manual invocation of each function to smoke-test.
4. Run the verification SQL above.
5. Kick off the controlled 10-run fundamentals backfill (spaced 60 s apart).
6. Return the 10-symbol scoreboard + telemetry evidence.

**Waiting on your approval before touching any code.**
