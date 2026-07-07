## Revised plan (v2) — awaiting APPLY approval

Universe size verified against DB: `stock_picker_universe_snapshot_member` for `active_universe_snapshot_id = 57d60a8d-…` → **788 rows**. `stock_master` has ~46,606 rows total but the writer never iterates them; it only walks snapshot members (with `stock_master` used solely as a per-symbol `dhan_security_id` fallback lookup).

## Files touched (exactly 2)

1. `supabase/functions/dhan-fetch/index.ts` — add additive batch input
2. `supabase/functions/sync-ltp-dhan/index.ts` — batched, paced fetch loop

No migration. No UI. No changes to `stock-recommendation-query`, cron schedules, `ltp_cache` schema, or the `stock_master` fallback lookup.

## 1) `supabase/functions/dhan-fetch/index.ts` (additive)

- Extend `RequestBody` with `securityIds?: Array<string | number>`.
- Marketfeed validation: accept EITHER `securityId` OR non-empty `securityIds`; reject `securityIds.length > 1000` with 400.
- Marketfeed upstream body:
  ```ts
  const ids = batchIds && batchIds.length > 0 ? batchIds : [Number(securityId)];
  upstreamBody = { [exchangeSegment]: ids };
  ```
- Everything else byte-identical: DHAN_EMPTY_QUOTE detection, 401 handling, 429 `Retry-After` passthrough, historical/holdings paths, success response shape (success response additionally echoes `securityIds` when batch mode used).
- **Backward-compat proof**: when `securityIds` is absent the code path is byte-identical to today (`[Number(securityId)]`). Existing callers unchanged.

## 2) `supabase/functions/sync-ltp-dhan/index.ts`

Constants:

```ts
const MASTER_CHUNK = 200;              // unchanged
const DHAN_BATCH_SIZE = 100;           // ⬅ reduced from 200 per founder rev-2
const DHAN_INTER_CALL_MS = 1100;       // ≥1.1s → ≤1 rps
```

Retire: `FULL_RUN_CHUNK = 50`, `INTER_CHUNK_PAUSE_MS`, `INTRA_CHUNK_PAUSE_MS`.

Cursor: see **Cursor decision** below (Option B — retire).

New helper `fetchDhanLtpBatch(ids, segment)` — one HTTP call to `dhan-fetch` with `{ endpoint:'ltp', exchangeSegment, securityIds }`. Returns discriminated union:

- `ok` → `Map<security_id, number>` parsed from `body.data.data[segment]`, reading `last_price | ltp | lastPrice`.
- `auth_error` / `rate_limited (retryAfterMs)` / `dhan_null` / `fetch_error` — same classification as today's single-shot path.

One retry on `rate_limited` honoring `Retry-After` (same as current path).

Main loop:

1. Build `members` from active snapshot (unchanged). Filtered-inline mode (`{symbols:[…]}` body from `stock-recommendation-query`) unchanged: process supplied symbols in one shot, no cursor.
2. Resolve missing `dhan_security_id` via existing `stock_master (symbol, segment)` fallback — increments `counters.master_fallback_used_count` exactly as today.
3. Bucket into `nseMembers`/`bseMembers`; members still missing an id → `counters.missing_id_count++` and one `errors[]` entry per member (unchanged shape).
4. For each segment, slice into `DHAN_BATCH_SIZE = 100` chunks:
  - `counters.dhan_batch_count++`
  - `fetchDhanLtpBatch(ids, seg)` with one 429 retry
  - **ok** → per member: `ltpBySecId.get(secId)` → if `> 0`, upsert `ltp_cache` on `(symbol,exchange)`; else `dhan_null_count++` + `errors.push`
  - **non-ok** → bump matching counter once; mark every member in the chunk as failed with the batch's error reason (blast radius: up to 100 members per bad batch)
  - `auth_error_count >= 3` → abort (unchanged rule)
  - `await sleep(DHAN_INTER_CALL_MS)` between chunks (intra-segment and across segments)
5. `counters.dhan_batch_avg_ltp_per_call = updated_count / max(1, dhan_batch_count)`.

Counters preserved: `symbols_seen`, `attempted_count`, `updated_count`, `auth_error_count`, `rate_limited_count`, `dhan_null_count`, `fetch_error_count`, `missing_id_count`, `nse_selected_count`, `bse_selected_count`, `nse_updated_count`, `bse_updated_count`, `master_fallback_used_count`, `chunk_count` (= batch count), `fetch_error_by_status`, `rate_limit_like_count`, `processed_member_count`. `attempts[]` shape unchanged.

Counters added: `dhan_batch_count`, `dhan_batch_avg_ltp_per_call`.

`last_sync_ltp_dhan` config and `cron_run_log` telemetry keys unchanged; `filter_applied`, `universe_source`, `universe_mode`, `aborted_systemic_auth` preserved. `cursor_start`/`cursor_end`/`wrapped_to_start` — see decision below.

## Corrected universe numbers (rev-2)

- Universe = 788 members (active snapshot), **not** 46,606.
- `DHAN_BATCH_SIZE = 100` → `ceil(788 / 100) = 8` Dhan calls per full tick (assuming both segments concatenated; NSE-only 788 gives 8; a small residual second-segment batch adds at most 1).
- Pacing: 8 × 1.1 s = **~8.8 s wall-clock per full tick** (worst case ~10 s including the +1 residual batch). Well under the 60 s target.
- Filtered-inline calls (≤10 symbols) = 1 batch = 1 Dhan call = ~1.1 s.

## Cursor decision — **Option B (retire the cursor)**

Reasoning:

- With 788 members and 8 calls per tick, the entire snapshot fits in one invocation (9 s). Every tick would trivially `wrapped_to_start = true`, making the cursor pure dead weight.
- Keeping the cursor (Option A) is idempotent (upserts overwrite with the same fresh LTP; no double-writes within a single tick because each member appears once) but adds branching, persisted state, and telemetry noise for zero benefit.
- Option B removes the `sync_ltp_dhan_cursor` read/write path and always processes the full snapshot per tick. Cleaner code, matches new coverage reality.

Compatibility:

- Filtered-inline mode is orthogonal (never touched the cursor) → unchanged.
- The persisted `sync_ltp_dhan_cursor` config-key row can be left in place; the new writer simply stops reading/writing it (no schema change, no rollback footprint).
- Telemetry: emit `cursor_start:null`, `cursor_end:null`, `wrapped_to_start:false`, and add `universe_mode:"full_snapshot_per_tick"` alongside the existing `filtered_inline` value — preserves the exact JSON keys downstream consumers read today.

If the universe later grows past what fits in one tick under the 1 rps ceiling (~55 batches ≈ 5,500 members in a 60 s tick), we reintroduce the cursor in a follow-up — trivially reversible.

## Risk list

1. **Rate-limit misjudgement** — 1100 ms gives 10% headroom vs Dhan's 1 rps. Mitigated by existing 429 retry with `Retry-After`.
2. **Malformed batch** — non-numeric ids reject the whole batch. Mitigated by `Number.isFinite && > 0` filter in `dhan-fetch` and pre-batch id sanitization in the writer.
3. **Partial batch response** — Dhan may omit some ids. Handled at member level via `Map.get`; missing ids counted as `dhan_null`.
4. **Upsert race** — no schema change; same composite `(symbol, exchange)` conflict target as today, same inline-refresh path.
5. **Backward-compat break of dhan-fetch** — strictly additive field; single-`securityId` callers byte-identical.
6. **Blast radius** — capped at 100 members per bad batch (rev-2). Auth-abort still fires after 3 auth errors (≤300 members before halt).
7. **Empty-quote branch** — `allEmpty` fires for market-closed batches; writer treats as `dhan_null` per member and does not advance counters. Matches today's off-hours behavior.
8. **Cursor retirement** — Option B removes cursor read/write. If ops tooling watches `cursor_end`, it now stays null. Documented in telemetry section above.

## Rollback plan

Single revert of exactly two files to their pre-change SHAs:

- `supabase/functions/dhan-fetch/index.ts`
- `supabase/functions/sync-ltp-dhan/index.ts`

No DB state to unwind. The stale `sync_ltp_dhan_cursor` config row (if present) is harmless and the reverted writer resumes reading it as before.

## Regression checklist (post-deploy)

During NSE market hours, after one cron tick:

1. `SELECT symbol, exchange, ltp, as_of, source FROM ltp_cache WHERE symbol IN ('ICICIBANK','BHARTIARTL','HEROMOTOCO','AAYUSHBULL')` → all four rows `source='dhan'`, `as_of` within last ~1 min (all four now refresh every tick under Option B, not just the head-of-cursor slice).
2. `stock_picker_runtime_config.last_sync_ltp_dhan.counters` → `dhan_batch_count` between 8 and 10, `updated_count ≈ 788` on a healthy tick, `rate_limited_count == 0`, `dhan_batch_avg_ltp_per_call ≈ 90–100`.
3. `cron_run_log` last `sync-ltp-dhan` row → `status='ok'`, `errors_count` near zero.
4. Trigger `stock-recommendation-query` for `ICICIBANK` → filtered-inline path (`filter_applied=true`) still returns fresh LTP.
5. `attempts[]` telemetry still surfaces per-symbol rows for the admin debug view (shape unchanged).
6. Confirm no residual dependency on `sync_ltp_dhan_cursor` config key (rg across repo).

Awaiting explicit APPLY approval before any code change.  
  
APPROVE 4F.2-BATCHING APPLY

Revised plan (v2) reviewed. Approved to APPLY with these confirmations acknowledged:

- Universe iterated: active_universe_snapshot_member for

  active_universe_snapshot_id (788 members, DB-verified).

- DHAN_BATCH_SIZE = 100.

- Cursor: Option B — retired; config row left in place, telemetry keys preserved

  (cursor_start/cursor_end null, wrapped_to_start false, universe_mode

  "full_snapshot_per_tick").

- Per-tick wall-clock: ~9 s (8-10 batches).

- Backward-compat: dhan-fetch single-securityId path byte-identical.

- Rollback: single revert of dhan-fetch/index.ts and sync-ltp-dhan/index.ts.

Proceed in APPLY mode.

Return the full diff before deploying.

Do NOT deploy yet.

After APPLY, I will run the regression checklist. DEPLOY only after I approve.

&nbsp;