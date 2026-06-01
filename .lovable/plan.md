## Add daily LTP history cleanup cron (B1 extension)

Extends the shipped B1 freshness work with a retention job. `ltp_cache` already self-caps at 1 row per symbol (upsert on `symbol` PK), so the only growth surface is the optional history table and the cron run log itself.

### Scope

1. **New table `public.ltp_history`** (append-only tick log; not yet in schema — created here so the cleanup job has something to prune and we can backfill intraday analytics later).
   - Columns: `symbol TEXT`, `ltp NUMERIC`, `source TEXT`, `recorded_at TIMESTAMPTZ DEFAULT now()`.
   - Index on `recorded_at DESC` for fast range deletes.
   - RLS enabled; `GRANT SELECT` to authenticated, `GRANT ALL` to service_role. No anon access.
   - `refresh-ltp` edge function gets one extra insert per refreshed symbol into `ltp_history` (alongside the existing `ltp_cache` upsert).

2. **New table `public.cron_run_log`** (audit trail for all cron jobs, not just cleanup).
   - Columns: `job_name TEXT`, `run_at TIMESTAMPTZ DEFAULT now()`, `status TEXT` (`'ok' | 'error'`), `rows_affected INT`, `details JSONB`.
   - RLS: service_role full, authenticated SELECT (so an admin UI can read it later). No anon.

3. **Cleanup function `public.cleanup_ltp_history()`** (SQL `SECURITY DEFINER`):
   - Deletes `ltp_history` rows where `recorded_at < now() - interval '7 days'`.
   - Inserts one row into `cron_run_log` with `job_name='cleanup-ltp-history'`, status, deleted count.
   - Runs entirely in Postgres — no edge function needed, no pg_net call, no auth header juggling.

4. **pg_cron schedule `cleanup-ltp-history-daily`**: `30 20 * * *` UTC = **02:00 IST** daily, invokes `public.cleanup_ltp_history()`.

5. **Audit existing `refresh-ltp-every-minute` cron** to also write to `cron_run_log` (one row per run, status + refreshed/failed counts). Small edit inside `supabase/functions/refresh-ltp/index.ts` — insert a `cron_run_log` row at end of handler.

### Files

- **migration** (single SQL file): create `ltp_history`, create `cron_run_log`, GRANTs + RLS + policies for both, create `cleanup_ltp_history()` function, schedule `cleanup-ltp-history-daily` via `cron.schedule`.
- **edit `supabase/functions/refresh-ltp/index.ts`**: after the batch loop, `INSERT INTO ltp_history` for each successful tick, and `INSERT INTO cron_run_log` once with the summary.

### Why this shape

- Keeps cleanup in pure SQL — no extra edge function, no apikey plumbing, no cold-start.
- `cron_run_log` is reusable for every future cron (refresh-stock-master-daily, refresh-ltp-every-minute, cleanup-ltp-history-daily) — single pane of glass.
- 7-day retention on minute ticks ≈ 6.5 * 60 * 5 * 7 ≈ 13 650 rows per symbol per week, well within Postgres budget; index on `recorded_at` keeps the daily delete cheap.

### Out of scope (will not touch)

- `ltp_cache` shape — already 1 row per symbol.
- UI — no changes; this is backend retention only.
- Any of the Part-A polish items already shipped.

### Open question before I build

Do you want `ltp_history` populated **starting now** (every minute refresh writes a tick), or should I create the table empty and only wire the insert later when intraday analytics actually needs it? The cleanup cron itself works either way — it just becomes a no-op until data exists.
