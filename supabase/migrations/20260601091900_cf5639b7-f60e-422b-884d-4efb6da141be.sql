
-- Ensure pg_cron + pg_net are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule any prior instance to make the migration idempotent
DO $$
BEGIN
  PERFORM cron.unschedule('seed-sector-aggregates-daily');
EXCEPTION WHEN OTHERS THEN
  -- ignore if it didn't exist
  NULL;
END $$;

-- 03:00 IST = 21:30 UTC the previous day
SELECT cron.schedule(
  'seed-sector-aggregates-daily',
  '30 21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pwicwmnutyahscbreqvg.supabase.co/functions/v1/seed-sector-aggregates',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3aWN3bW51dHlhaHNjYnJlcXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzE0NjcsImV4cCI6MjA5NDUwNzQ2N30.aUu2WKdHWnlvFbnBxynFJaGLYq_tlpptkPf5CiwSQZA"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
