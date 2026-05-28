# Stock master table + daily Dhan CSV seeder

Build a canonical NSE/BSE equity lookup table populated from Dhan's instrument master CSV, refreshed daily.

## 1. Database migration

Create `public.stock_master`:

| column | type | notes |
|---|---|---|
| id | uuid PK | default `gen_random_uuid()` |
| symbol | text not null | from `SEM_TRADING_SYMBOL` |
| company_name | text | from `SM_SYMBOL_NAME` |
| dhan_security_id | text not null | from `SEM_SMST_SECURITY_ID` |
| exchange | text not null | `NSE` or `BSE` |
| segment | text not null | `NSE_EQ` or `BSE_EQ` |
| isin | text | from `SEM_ISIN` |
| lot_size | integer | from `SEM_LOT_UNITS` |
| tick_size | numeric | from `SEM_TICK_SIZE` |
| updated_at | timestamptz not null default now() |

Constraints + indexes:
- `UNIQUE (dhan_security_id, segment)` — upsert key (same numeric ID can repeat across NSE/BSE)
- `INDEX (symbol)`, `INDEX (dhan_security_id)`, `INDEX (isin)`
- Composite `INDEX (exchange, symbol)` for fast symbol → security_id lookup per exchange

GRANTs + RLS:
- `GRANT SELECT ON public.stock_master TO authenticated, anon` (lookup table, safe to read publicly)
- `GRANT ALL ON public.stock_master TO service_role`
- RLS enabled; policy: `SELECT` to `authenticated`+`anon` (`using true`); no insert/update/delete policies (service role bypasses RLS for the seeder)

## 2. Edge Function `seed-stock-master`

New file `supabase/functions/seed-stock-master/index.ts`, registered in `supabase/config.toml` with `verify_jwt = false` (cron-callable; protected by a shared `SEED_CRON_SECRET` header instead — needs one new secret).

Logic:
1. Validate `x-cron-secret` header against `SEED_CRON_SECRET` env (skip check if request comes from service role JWT — detected via `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`).
2. `fetch('https://images.dhan.co/api-data/api-scrip-master.csv')` — stream `.text()`.
3. Parse CSV manually (header row + split on `,`; values are unquoted in Dhan's file). Build column index map from header.
4. Filter rows where:
   - `SEM_EXM_EXCH_ID ∈ {'NSE','BSE'}`
   - `SEM_INSTRUMENT_NAME === 'EQUITY'`
   - `SEM_SEGMENT === 'E'`
5. Map to row objects; derive `segment = ${exchange}_EQ`; coerce `lot_size` → int, `tick_size` → number.
6. Use `supabaseAdmin` (service role client built inline with `Deno.env.get('SUPABASE_URL')` + `SUPABASE_SERVICE_ROLE_KEY`).
7. Upsert in batches of 1000 via `.upsert(rows, { onConflict: 'dhan_security_id,segment' })`. Track inserted/updated count.
8. Return `{ success: true, totalParsed, inserted, durationMs }`.

Errors return `{ success: false, error, status }` with appropriate HTTP code.

## 3. Cron job (pg_cron + pg_net)

Insert (not migration — contains URL+secret) via the Supabase insert tool:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'refresh-stock-master-daily',
  '30 1 * * *',  -- 01:30 UTC = 07:00 IST
  $$
  select net.http_post(
    url := 'https://pwicwmnutyahscbreqvg.supabase.co/functions/v1/seed-stock-master',
    headers := '{"Content-Type":"application/json","x-cron-secret":"<SEED_CRON_SECRET value>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

## 4. New secret

`SEED_CRON_SECRET` — random 32-char token. I'll request via `add_secret` after the migration is approved.

## 5. Verification

After deploy, invoke once via `supabase--curl_edge_functions` with the cron secret header. Then:

```sql
select symbol, dhan_security_id, exchange, segment
from public.stock_master
where symbol = 'RELIANCE' and exchange = 'NSE';
```

Expected: `dhan_security_id = '2885'`, `segment = 'NSE_EQ'`. Report row count and confirmation.

## Open questions / notes

- The Dhan CSV is ~5–10 MB and ~150k+ rows; after filtering to NSE/BSE EQUITY-E it's ~5k rows — well within edge function memory + 60s timeout.
- Cron runs at **01:30 UTC daily** (= 07:00 IST). Confirm if you'd prefer a different time.
- `verify_jwt = false` + shared-secret header is the simplest cron auth. Alternative: keep `verify_jwt = true` and have pg_cron call with the service-role key in the `Authorization` header — I'll go with the shared-secret approach unless you object.
