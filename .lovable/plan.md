# Phase 2W — Plan

Four independent sub-tracks. Each is verifiable in isolation. No SP-1.6 invariant files touched, no universe widening, no persist-flag changes, replay schema stays `sp1-replay-v2`.

## W-A — CMP badge honesty (frontend only)

File: `src/components/stock-picker/StockPickerFlow.tsx` (the inline `StockCard` at line ~712 — this is the equivalent of the spec's `StockCard.tsx`).

Replace the current binary `cmpSourceLabel = cmpLive ? "Live" : "EOD"` (line 732) with the 3-state derivation from `cmp.source`, `cache_health.cmp_fresh`, and `cmp.window_phase`:

- `LIVE` when `cmp_fresh === true`
- `LAST TRADED` when `cmp.source === 'ltp_cache'` AND `cmp_fresh === false` AND `cmp.window_phase === 'post_close'`
- `EOD CLOSE` when `cmp.source === 'liquidity_20d_close'`
- Fallback (e.g. pre_open/weekend stale ltp_cache): `LAST TRADED`

No other UI change. Verify the badge no longer reads "EOD" for ltp_cache survivors via a preview screenshot of the picker.

## W-B — Fundamentals backfill for override universe (data only)

No code edits. Invoke the existing edge function `sync-fundamentals-finedge` (already iterates `universe_override_symbols` when `finedge_api_enabled=true` and `universe_override_enabled=true`, upserts `fundamentals_cache` with sector / industry / `market_cap_rs` / `cap_band`).

Steps:

1. Coverage-before query against `fundamentals_cache` filtered to the 43 override symbols: count of rows where `sector`, `industry`, `market_cap_rs`, `cap_band` are non-null.
2. Confirm both runtime flags are `true`; if not, this sub-track is blocked (report and stop — do not flip flags).
3. POST to `sync-fundamentals-finedge` with service role.
4. Coverage-after query, plus a targeted lookup for `APTECHT` showing real sector / industry / market_cap_rs.

Note on visible card fields: the picker reads fundamentals from `fundamentals_cache` (merged in `stock-recommendation-query`), not `stock_master`. The verification phrasing in the spec ("stock_master fundamentals") is satisfied by the same `fundamentals_cache` rows the card consumes; no `stock_master` writes are needed and none are in scope.

## W-C — Liquidity 20d coverage backfill (new edge function, data only)

New edge function: `supabase/functions/backfill-liquidity-20d/index.ts`.

Logic:

- Read `universe_override_symbols` from `stock_picker_runtime_config`.
- For each symbol, read the last 20 trading-day rows from `stock_picker_ohlcv_history` (ordered by `trade_date desc`, limit 20).
- Insert into `stock_picker_liquidity_20d` using upsert with `onConflict: <pk cols>, ignoreDuplicates: true` (the spec's "DO NOTHING on conflict"). Map columns exactly to existing schema (no synthesis — close, volume, turnover come straight from `stock_picker_ohlcv_history`; any column the source lacks is left null).
- After loop, upsert a telemetry row into `stock_picker_runtime_config` with key `last_backfill_liquidity_20d` (kind `operational`), shape `{ ok, symbols_processed, rows_inserted, errors_count, ran_at }`.

Verification:

1. Coverage-before: `select symbol, count(*) from stock_picker_liquidity_20d where symbol = any(<override>) group by symbol` — flag symbols with <20 rows (expected: ITI and any others).
2. Deploy + invoke once.
3. Coverage-after: every override symbol has ≥20 rows.
4. Reload picker for ITI horizon and confirm "TECHNICALS: Pending" pill is gone.

No edits to write-audit, daily-cron, exclusion-engine, replay-hash, or regulatory-status.

## W-D — Risk-profile differentiation diagnostic (read-only)

No code edits, no function deployments. From the harness, invoke `stock-recommendation-query` for the matrix:

- horizons: `short`, `medium`, `long`
- risks: `conservative`, `moderate`, `aggressive`, `ultra`

For each call, capture: survivor count, top-5 tickers (in order), and score distribution (min / median / max of `composite_score`, treating null as N/A for conservative).

Produce a table grouped by horizon, with one row per risk profile, so we can read off whether moderate vs aggressive top-N differ for the same horizon. Conclusion line: "diverges" vs "identical — universe-size limited" vs "identical — weight-collapse".

## Final verification checklist returned to user

- Files edited per sub-track (W-A only; W-C adds one new file; W-B and W-D edit nothing).
- Edge functions invoked: `sync-fundamentals-finedge` (W-B), `backfill-liquidity-20d` (W-C).
- Coverage-before / coverage-after tables for `fundamentals_cache` and `stock_picker_liquidity_20d`.
- Screenshot of updated card badges (LIVE / LAST TRADED / EOD CLOSE as available in current market window).
- W-D diagnostic table.
- Invariant checks: `audit_rows_with_score` for conservative still 0; `replay_payload_hash_version` still `sp1-replay-v2` on recent rows.
- Final single-line status.

## Out of scope (explicit)

- No edits to: `regulatory-status.ts`, `replay-hash.ts`, `stock-picker-write-audit`, `stock-picker-daily-cron`, `stock-picker-exclusion-engine`.
- No change to `composite_score_writes_enabled` or any `composite_score_persist_*` flag.
- No universe widening, no replay schema bump, no new secrets.  
  
Phase 2W plan APPROVED with 4 mandatory additions before build:
  ADD-1 (W-A): Fallback to LAST TRADED must apply whenever cmp.source='ltp_cache' AND cmp_fresh=false, regardless of window_phase value. Only fall through to EOD CLOSE when cmp.source='liquidity_20d_close'.
  ADD-2 (W-B): If finedge_api_enabled !== true OR universe_override_enabled !== true, return W-B as BLOCKED with both flag values in the message. Do NOT invoke sync-fundamentals-finedge. Do NOT flip flags. W-A, W-C, W-D continue independently. Final phase line becomes PHASE 2W PARTIAL — W-B BLOCKED by config flags.
  ADD-3 (W-C): Lock the column mapping from stock_picker_ohlcv_history to stock_picker_liquidity_20d explicitly in the function. Confirm exact date column name on liquidity_20d before insert (likely record_date or trade_date). Map symbol, exchange, date, close, volume one-to-one. Leave turnover and any unmapped liquidity_20d columns null — no synthesis. If column names diverge from the schema, abort and report. Do not guess.
  ADD-4 (W-D): For each (horizon, risk) row also capture universe_after_sp1_filters and score_spread (max - min composite_score). Conclusion line logic:
  - identical top-5 AND universe_after_sp1_filters ≤ 5 → "identical — universe-size limited"
  - identical top-5 AND universe_after_sp1_filters > 5 AND score_spread < 5 → "identical — weight-collapse"
  - identical top-5 AND universe_after_sp1_filters > 5 AND score_spread ≥ 5 → "identical — risk-profile not wired into ranking"
  - else → "diverges"
  ADD-5 (optional, recommended): Add data-testid="cmp-source-badge" on the W-A badge element.
  All other plan items approved as written. Proceed with build. STOP after verification. Do not start any Phase 2X work.
  &nbsp;