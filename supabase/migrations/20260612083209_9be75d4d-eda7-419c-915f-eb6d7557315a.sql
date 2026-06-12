CREATE OR REPLACE FUNCTION public.cleanup_ltp_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _deleted INTEGER := 0;
  _started_at TIMESTAMPTZ := now();
BEGIN
  DELETE FROM public.ltp_history
  WHERE recorded_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  INSERT INTO public.cron_run_log (function_name, status, started_at, finished_at, metrics)
  VALUES (
    'cleanup-ltp-history',
    'ok',
    _started_at,
    now(),
    jsonb_build_object(
      'status', 'ok',
      'processed', _deleted,
      'errors_count', 0,
      'details', jsonb_build_object('retention_days', 7),
      'ran_at', now()
    )
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_run_log (function_name, status, started_at, finished_at, error_message, metrics)
  VALUES (
    'cleanup-ltp-history',
    'error',
    _started_at,
    now(),
    SQLERRM,
    jsonb_build_object('status', 'error', 'errors_count', 1, 'error_message', SQLERRM)
  );
END;
$function$;