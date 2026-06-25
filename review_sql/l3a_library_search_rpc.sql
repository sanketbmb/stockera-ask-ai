-- L3a Library Search RPC — REVIEW ONLY (not in supabase/migrations/, not auto-applied)
-- Apply via SQL editor or migration tool after founder audit.

CREATE OR REPLACE FUNCTION public.fn_library_search(
  q text,
  limit_n int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  kind text,
  source_id uuid,
  source_table text,
  related_query_id uuid,
  symbol text,
  symbol_exchange text,
  title text,
  verdict text,
  sector text,
  analyst_id uuid,
  analyst_name text,
  analyst_sebi_reg_number text,
  body_excerpt text,
  view_count int,
  published_at timestamptz,
  is_tombstoned bool,
  rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      coalesce(nullif(trim(q), ''), '') AS qraw,
      lower(coalesce(nullif(trim(q), ''), '')) AS qlower,
      plainto_tsquery('simple', coalesce(nullif(trim(q), ''), '')) AS tsq
  ),
  enriched AS (
    SELECT
      li.id,
      li.kind,
      li.source_id,
      li.source_table,
      CASE
        WHEN li.source_table = 'queries' THEN li.source_id
        WHEN li.source_table = 'answers' THEN a.query_id
        ELSE NULL
      END AS related_query_id,
      li.symbol,
      li.symbol_exchange,
      li.title,
      li.verdict,
      li.sector,
      li.analyst_id,
      ap.display_name AS analyst_name,
      ap.sebi_reg_number AS analyst_sebi_reg_number,
      li.body_excerpt,
      li.view_count,
      li.published_at,
      li.is_tombstoned,
      li.search_tsv,
      li.trgm_blob
    FROM public.library_items li
    LEFT JOIN public.answers a
      ON li.source_table = 'answers' AND a.id = li.source_id
    LEFT JOIN public.analyst_profiles ap
      ON ap.id = li.analyst_id
  )
  SELECT
    e.id,
    e.kind,
    e.source_id,
    e.source_table,
    e.related_query_id,
    e.symbol,
    e.symbol_exchange,
    e.title,
    e.verdict,
    e.sector,
    e.analyst_id,
    e.analyst_name,
    e.analyst_sebi_reg_number,
    e.body_excerpt,
    e.view_count,
    e.published_at,
    e.is_tombstoned,
    (
        ts_rank_cd(e.search_tsv, p.tsq) * 1.0
      + similarity(e.trgm_blob, p.qlower) * 0.8
      + CASE e.kind
          WHEN 'analyst' THEN 0.4
          WHEN 'report'  THEN 0.3
          WHEN 'video'   THEN 0.25
          ELSE 0.15
        END
      + CASE
          WHEN e.published_at IS NULL THEN 0
          ELSE exp(-extract(epoch from now() - e.published_at) / 86400.0 / 180.0) * 0.5
        END
      + ln(1 + e.view_count) * 0.1
    )::real AS rank
  FROM enriched e, params p
  WHERE e.is_tombstoned = false
    AND (
      e.search_tsv @@ p.tsq
      OR e.trgm_blob % p.qlower
      OR e.symbol ILIKE upper(p.qraw) || '%'
    )
  ORDER BY rank DESC
  LIMIT greatest(1, least(limit_n, 100));
$$;

GRANT EXECUTE ON FUNCTION public.fn_library_search(text, int)
TO anon, authenticated, service_role;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.fn_library_search(text, int);
