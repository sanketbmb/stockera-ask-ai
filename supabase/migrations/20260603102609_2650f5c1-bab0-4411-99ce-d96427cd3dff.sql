
ALTER TABLE public.backtest_run_summary
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS last_progress_at timestamptz;

UPDATE public.backtest_run_summary
SET status = 'failed',
    finished_at = now(),
    error_message = 'stalled - chunk progression did not advance (self-invoke dropped before EdgeRuntime.waitUntil fix)'
WHERE run_id IN (
  '24c1eebc-2a50-4349-a8e1-aab560f48e59',
  '0e767eeb-cf43-415e-9c1c-11f530436b59'
)
AND status = 'running'
AND completed_cases = 0;
