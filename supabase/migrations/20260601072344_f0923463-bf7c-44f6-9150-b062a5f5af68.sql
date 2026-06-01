
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- Drop prior schedule if present so this migration is idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-ltp-every-minute') THEN
    PERFORM cron.unschedule('refresh-ltp-every-minute');
  END IF;
END $$;

SELECT cron.schedule(
  'refresh-ltp-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://pwicwmnutyahscbreqvg.supabase.co/functions/v1/refresh-ltp',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3aWN3bW51dHlhaHNjYnJlcXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzE0NjcsImV4cCI6MjA5NDUwNzQ2N30.aUu2WKdHWnlvFbnBxynFJaGLYq_tlpptkPf5CiwSQZA"}'::jsonb,
    body    := '{"trigger":"cron"}'::jsonb
  ) AS request_id;
  $$
);
