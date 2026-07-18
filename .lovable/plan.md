## (a) Diagnosis — why the chain silently dies

Reading `supabase/functions/stock-picker-daily-cron/index.ts` end-to-end, four independent chain-killers exist between "cron fires" and "final chunk writes the batch". Any one is enough to explain the 2026‑07‑06 → 2026‑07‑16 blackout.

1. **Fresh `batchId` per invocation, no continuity token.** L789 generates a new `batchId = crypto.randomUUID()` at every `serve()` entry, and the `resume_from` payload (L1413–L1420) carries only `mode / invoked_by / seed_version / run_date_ist / resume_from / risk_profile` — no `batch_id`, no `chunk_index`, no `run_state_id`. Chunks are unlinked: nothing in the DB knows "there is an in-flight live run that has completed 3/10 chunks". If chunk 4 never fires, no watchdog can tell.
2. **Fire-and-forget `net.http_post` with zero delivery guarantee.** L1421–L1434 `await`s `net.http_post` for its enqueue side effect only. The return value (`request_id`) is discarded, `net._http_response` is never inspected, there is no retry, no dead-letter, no ACK back into `cron_run_log`. Any of the following silently ends the chain:
  - pg_net queue paused / worker offline (happens after DB restarts and after some Supabase platform maintenance windows).
  - `timeout_milliseconds: 180000` trips on a cold-start chunk → response recorded as failure in `net._http_response` but the parent chunk already returned 200 and no one reads it.
  - Edge Function invocation returns 5xx on cold start (import error, transient OOM) → no `insertRunningRow` executed → no `cron_run_log` row → invisible.
  - Auth header mismatch on the invoked side (service key rotated, apikey/JWT drift) → 401 recorded in `net._http_response`, chain ends.
3. **Cold cache multiplies the failure surface linearly.** With 500‑symbol universes and `LIVE_CHUNK_SIZE = 50`, cold cache = ≥10 sequential self-invocations, each re-doing config load + universe build + Dhan fan-out. P(chain survives) = P(single link succeeds)^10. At 97% per link the chain still fails ~26% of nights; at 90% it fails ~65%. The observed 10-of-10 nights blackout is consistent with a systemic link failure (item 2) rather than randomness, but the chain design has no headroom either way.
4. **Batch is written only on the terminal chunk.** L1868–L1910: pick-audit chunks + `write_batch_rejection` run only after `isFinalChunk` (L1386). Every non-final chunk exits at L1436–L1444 having done nothing durable except (recently) an `updateRunRow('chunk_finished')` — and even that log row's `batch_id` is unique to that chunk, so `stock_picker_batch_rejection` (which `stock-recommendation-query` reads) stays empty. Result: a chain that breaks at chunk N‑1 is indistinguishable from a chain that never started.

Secondary: `insertRunningRow` was only added recently — so the "cron_run_log shows no entries" for 07‑06 → 07‑16 is expected (the observability wasn't live yet). What is real is that `stock_picker_batch_rejection` and `stock_picker_pick_audit` are empty for those dates, confirming (4).

## (b) Crash-safe design — persist the run, drive continuation from a watchdog

Move continuation off the fragile in-band `net.http_post` chain and onto a durable "run state + external tick" pattern. No scoring, ranking, cohort, hysteresis, or replay-hash code is touched.

### B.1 New table `stock_picker_run_state`

Columns: `id uuid pk`, `batch_id uuid unique`, `mode text`, `invoked_by text`, `run_date_ist date`, `risk_profile text`, `seed_version text`, `status text` (`pending` | `in_progress` | `awaiting_next_chunk` | `finalizing` | `completed` | `failed` | `abandoned`), `chunks_completed int`, `chunks_expected int null`, `resume_from text null`, `universe_size int null`, `last_heartbeat_at timestamptz`, `next_attempt_at timestamptz`, `attempt_count int default 0`, `last_error text null`, `created_at`, `updated_at`. RLS enabled, `service_role` only. Grants per repo convention.

### B.2 Reuse `batch_id` for the whole run

At `serve()` entry: if `body.batch_id` is present, load the matching `stock_picker_run_state` row and reuse its `batch_id`; else create a new row + `batch_id`. Add `batch_id?: string` to `DailyCronRequest`. Every `updateRunRow` and every self-continuation payload carries the same `batch_id`, so `cron_run_log` shows one contiguous story per night and the final batch matches all chunk log rows.

### B.3 Every chunk is a transaction against `run_state`

Before returning after a non-final chunk:

- `UPDATE stock_picker_run_state SET status = 'awaiting_next_chunk', resume_from = <next>, chunks_completed = chunks_completed + 1, last_heartbeat_at = now(), next_attempt_at = now() + interval '10 seconds', updated_at = now() WHERE batch_id = $1`.
- Then attempt `net.http_post` self-continuation (kept as the fast path).

If the fast path fires and the next chunk runs, `next_attempt_at` gets pushed forward again. If it doesn't, `next_attempt_at` becomes the tripwire the watchdog uses.

### B.4 New watchdog cron `stock-picker-chunk-watchdog`

New TanStack server route `src/routes/api/public/hooks/stock-picker-chunk-watchdog.ts`. Runs every 1 minute via `pg_cron`. On each tick:

1. Select `stock_picker_run_state` rows with `status IN ('pending','in_progress','awaiting_next_chunk')` and `next_attempt_at <= now()`.
2. For each, increment `attempt_count`, mark `status = 'in_progress'`, then `net.http_post` the daily-cron with the row's `batch_id` + `resume_from`.
3. If `attempt_count > MAX_ATTEMPTS` (default 6) or `now() - created_at > 90 minutes`, mark `status = 'abandoned'`, write a terminal row into `cron_run_log`, and let the alert path (B.6) fire.

Watchdog is idempotent: the daily-cron itself does an advisory-lock (`pg_try_advisory_xact_lock(hashtext('sp-daily-' || batch_id))`) at the top and returns `ok: false, reason: 'already_running'` if the lock is held, so two overlapping ticks can't double-process the same chunk.

### B.5 Incremental audit writes (respecting existing write ordering)

Constraint from L1852–L1859: `write_batch_rejection` must land last so `stock-recommendation-query` never sees a partial batch. Keep that invariant, but split pick-audit incrementally:

- After each **successful** chunk (post-liquidity, post-scoring for that slice), stream that chunk's pick-audit rows via `stock_picker_write_audit_row` (the RPC already used elsewhere) with a `chunk_index` tag. Idempotent on 23505 as today.
- On the terminal chunk only: send `write_batch_rejection`. This is the atomic "batch is now visible" step. Nothing downstream changes.

Benefit: even a chain that dies at chunk N-1 leaves partial pick_audit rows tagged to `batch_id`, so on-call can diagnose "we got 8/10 chunks worth of picks" instead of "we got nothing".

Note: current scoring runs after the whole liquidity fan-out is complete. To keep scoring/replay-hash untouched, the "incremental pick_audit" only applies to per-chunk audit rows that record liquidity outcomes (a new lightweight op, or existing `stock_picker_write_audit_row` with a `liquidity_snapshot` payload — TBD in build stage after re-reading the RPC signature). Scoring, cohort selection, and the final rejection row all remain unchanged and only run on the terminal chunk.

### B.6 Alerting

Add a second, cheap cron: `stock-picker-run-alert` (or fold into watchdog) — every 5 minutes IST between 20:00 and 23:59:

- If a `live` run was expected today (trading-day, `cron_enabled = true`, `bootstrap_completed = true`) AND either (a) no `stock_picker_run_state` row exists for today's `run_date_ist`, OR (b) a row exists with `status NOT IN ('completed','failed','abandoned')` older than `alert_after_minutes` (default 20), OR (c) no row in `stock_picker_batch_rejection` for today by `alert_final_by_ist` (default 22:30):
  - INSERT into new `stock_picker_alerts` table (dedup by `(run_date_ist, alert_kind)` unique).
  - `net.http_post` to a new `send-cron-alert` route that emails the founder via Resend (reusing `RESEND_API_KEY` already in the project) — subject `SP1: live batch missing (run_date=YYYY-MM-DD, status=<...>)`, body includes `batch_id`, `chunks_completed`, `last_error`, direct link to `cron_run_log`.

Config knobs live in `stock_picker_runtime_config`: `watchdog_stall_seconds` (default 120), `watchdog_max_attempts` (default 6), `alert_after_minutes` (default 20), `alert_final_by_ist_hhmm` (default `22:30`).

## (c) What changes on disk

```text
supabase/migrations/<ts>_sp1_run_state_and_alerts.sql
  - create table stock_picker_run_state (…) + grants + RLS (service_role only)
  - create unique index on stock_picker_run_state(batch_id)
  - create table stock_picker_alerts (id, run_date_ist, alert_kind, batch_id null,
      payload jsonb, created_at, unique(run_date_ist, alert_kind)) + grants + RLS
  - insert stock_picker_runtime_config keys (watchdog_stall_seconds,
      watchdog_max_attempts, alert_after_minutes, alert_final_by_ist_hhmm)

supabase/functions/stock-picker-daily-cron/index.ts
  - DailyCronRequest: add batch_id?: string, chunk_index?: number
  - serve(): if batch_id in body → load run_state; else insert run_state + generate batch_id
  - top-of-handler advisory lock on hashtext('sp-daily-' || batch_id)
  - after every non-final chunk: UPDATE run_state (status, resume_from,
      chunks_completed, last_heartbeat_at, next_attempt_at)
  - self-continuation payload now includes batch_id
  - on final chunk success: UPDATE run_state SET status='completed'
  - on thrown error: UPDATE run_state SET status='in_progress', last_error=…,
      next_attempt_at = now() + backoff, so the watchdog retries
  - incremental per-chunk liquidity-audit write via existing
      stock_picker_write_audit_row; write_batch_rejection stays terminal-only

src/routes/api/public/hooks/stock-picker-chunk-watchdog.ts   (NEW)
  - POST handler: apikey guard, select stalled run_state rows, kick daily-cron

src/routes/api/public/hooks/stock-picker-run-alert.ts        (NEW)
  - POST handler: apikey guard, detect missing/stalled/late live batches,
      insert into stock_picker_alerts (unique on kind+date), fire send-cron-alert

src/routes/api/public/hooks/send-cron-alert.ts               (NEW)
  - POST handler: Resend email to founder, payload from body

pg_cron (run via supabase--insert, NOT migration):
  - schedule 'sp-chunk-watchdog' every minute → watchdog route
  - schedule 'sp-run-alert' every 5 min between 14:30 and 18:30 UTC (20:00 – 24:00 IST) → alert route
```

## (d) Constraints honored

- Scoring, hysteresis, cohort selection, replay-hash, gates (`cron_enabled`, `bootstrap_completed`, trading-day, future-coverage), write ordering (picks before rejection) — all untouched.
- Terminal-only `write_batch_rejection` preserved, so `stock-recommendation-query`'s "latest completed batch" semantics don't change.
- No schema change to `answers`, `stock_picker_pick_audit`, or `stock_picker_batch_rejection`.
- All new tables get explicit GRANTs (service_role) per project convention.
- Watchdog + alert both idempotent (advisory lock + unique index on alert kind).

## (e) Report format after build

- (A) Migration diff + grants confirmation
- (B) `stock-picker-daily-cron` diff scoped to run_state wiring
- (C) Three new route files + pg_cron entries
- (D) Watchdog test: manual insert of a stale `run_state` row → confirm next tick resumes it
- (E) Alert test: force a missing-batch condition → confirm `stock_picker_alerts` row + email delivery
- (F) Verdict  
  
guidance for you :  
Approved in principle — the diagnosis and the run-state + watchdog architecture are correct. Before building, split into two phases so we don't destabilize a currently-working pipeline:
  **Phase 1 (build now):** run-state table, batch_id continuity token, advisory lock, watchdog cron, and the alerting path (B.1–B.4, B.6). Keep the existing terminal-only write flow completely unchanged — do NOT implement the incremental per-chunk audit writes (B.5) in this phase. The watchdog alone fixes the blackout by guaranteeing broken chains get resumed. This is the safe, high-value core.
  **Phase 2 (later, separate PR):** incremental per-chunk audit writes (B.5), only after Phase 1 is proven stable over several nights, and only after re-reading the write-audit RPC signature. This is the part that touches the write/scoring path so it needs isolation.
  Constraints: do not touch scoring, hysteresis, cohort selection, replay-hash, the gates, or write ordering. Ship Phase 1 behind a config flag if possible so it can be disabled without a redeploy. Provide the watchdog resume test (D) and alert test (E) before merging.
- &nbsp;