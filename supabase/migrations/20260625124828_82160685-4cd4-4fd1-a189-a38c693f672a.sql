-- L2 — Library view-count aggregation
-- Forward Note N-1 (L1 PR-9): prevents unbounded growth of library_item_views.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.fn_aggregate_library_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH agg AS (
    SELECT item_id, count(*) AS n
    FROM public.library_item_views
    WHERE created_at < now() - interval '10 seconds'
    GROUP BY item_id
  ),
  applied AS (
    UPDATE public.library_items li
    SET view_count = li.view_count + agg.n,
        updated_at = now()
    FROM agg WHERE li.id = agg.item_id
    RETURNING agg.item_id, agg.n
  )
  DELETE FROM public.library_item_views v
  WHERE v.created_at < now() - interval '10 seconds'
    AND v.item_id IN (SELECT item_id FROM applied);
END;
$$;

SELECT cron.schedule(
  'aggregate_library_views',
  '*/5 * * * *',
  $$ SELECT public.fn_aggregate_library_views(); $$
);

-- ROLLBACK:
-- SELECT cron.unschedule('aggregate_library_views');
-- DROP FUNCTION IF EXISTS public.fn_aggregate_library_views();