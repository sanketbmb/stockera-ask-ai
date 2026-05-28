
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Replace if it already exists (no-op safe)
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-stock-master-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'refresh-stock-master-daily',
  '30 1 * * *',  -- 01:30 UTC = 07:00 IST, daily
  $$
  SELECT net.http_post(
    url := 'https://pwicwmnutyahscbreqvg.supabase.co/functions/v1/seed-stock-master',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
