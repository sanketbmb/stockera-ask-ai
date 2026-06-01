-- 1. ltp_history: append-only tick log
CREATE TABLE IF NOT EXISTS public.ltp_history (
  id          BIGSERIAL PRIMARY KEY,
  symbol      TEXT NOT NULL,
  ltp         NUMERIC NOT NULL,
  source      TEXT NOT NULL DEFAULT 'dhan',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ltp_history TO authenticated;
GRANT ALL ON public.ltp_history TO service_role;

ALTER TABLE public.ltp_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY ltp_history_auth_read
  ON public.ltp_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS ltp_history_recorded_at_idx
  ON public.ltp_history (recorded_at DESC);

CREATE INDEX IF NOT EXISTS ltp_history_symbol_recorded_at_idx
  ON public.ltp_history (symbol, recorded_at DESC);

-- 2. cron_run_log: audit trail for all cron jobs
CREATE TABLE IF NOT EXISTS public.cron_run_log (
  id             BIGSERIAL PRIMARY KEY,
  job_name       TEXT NOT NULL,
  run_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  status         TEXT NOT NULL DEFAULT 'ok',
  rows_affected  INTEGER NOT NULL DEFAULT 0,
  details        JSONB
);

GRANT SELECT ON public.cron_run_log TO authenticated;
GRANT ALL ON public.cron_run_log TO service_role;

ALTER TABLE public.cron_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY cron_run_log_auth_read
  ON public.cron_run_log
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS cron_run_log_job_run_at_idx
  ON public.cron_run_log (job_name, run_at DESC);

-- 3. cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_ltp_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted INTEGER := 0;
BEGIN
  DELETE FROM public.ltp_history
  WHERE recorded_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  INSERT INTO public.cron_run_log (job_name, status, rows_affected, details)
  VALUES (
    'cleanup-ltp-history',
    'ok',
    _deleted,
    jsonb_build_object('retention_days', 7)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_run_log (job_name, status, rows_affected, details)
  VALUES (
    'cleanup-ltp-history',
    'error',
    0,
    jsonb_build_object('error', SQLERRM)
  );
END;
$$;

-- 4. schedule daily at 02:00 IST = 20:30 UTC
SELECT cron.schedule(
  'cleanup-ltp-history-daily',
  '30 20 * * *',
  $$ SELECT public.cleanup_ltp_history(); $$
);