
-- I-LITE-FIX-2: Project AI-only reports to library_items without requiring a published video.

CREATE OR REPLACE FUNCTION public.fn_project_query_to_library()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_verdict text;
  v_analyst uuid;
  v_body    text;
BEGIN
  -- Skip if not opted in or tombstoned.
  IF NEW.is_public_library IS DISTINCT FROM true OR NEW.library_tombstoned_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Prefer a published video answer (richer metadata) when available; otherwise
  -- project AI-only reports as soon as the frozen AI report body exists.
  SELECT a.verdict,
         NEW.assigned_analyst_id,
         left(regexp_replace(coalesce(a.body, NEW.query_text, ''), E'[#*_`>]', '', 'g'), 280)
    INTO v_verdict, v_analyst, v_body
  FROM public.answers a
  WHERE a.query_id = NEW.id
    AND a.is_published = true
    AND a.video_url IS NOT NULL
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF v_body IS NULL THEN
    -- No video yet — require a finalized AI report (ai_report jsonb populated).
    IF NEW.ai_report IS NULL THEN
      RETURN NEW;
    END IF;
    v_verdict := COALESCE(NEW.ai_report->>'verdict', NULL);
    v_analyst := NEW.assigned_analyst_id;
    v_body    := left(regexp_replace(
                   coalesce(NEW.ai_report->>'summary', NEW.query_text, ''),
                   E'[#*_`>]', '', 'g'), 280);
  END IF;

  INSERT INTO public.library_items
    (kind, source_id, source_table, symbol, title, verdict, analyst_id,
     body_excerpt, is_public, is_tombstoned, published_at)
  VALUES
    ('report', NEW.id, 'queries',
     public.fn_normalize_symbol(coalesce(NEW.stock_symbol, NEW.stock_name)),
     CASE WHEN NEW.public_consent_anonymized
          THEN 'Question about ' || coalesce(NEW.stock_name,'a stock')
          ELSE left(coalesce(NEW.query_text, NEW.stock_name), 140) END,
     v_verdict, v_analyst, v_body, true, false, now())
  ON CONFLICT (source_table, source_id) DO UPDATE
    SET is_public     = true,
        is_tombstoned = false,
        updated_at    = now(),
        title         = EXCLUDED.title,
        verdict       = COALESCE(EXCLUDED.verdict, library_items.verdict),
        analyst_id    = COALESCE(EXCLUDED.analyst_id, library_items.analyst_id),
        body_excerpt  = EXCLUDED.body_excerpt,
        symbol        = EXCLUDED.symbol,
        published_at  = coalesce(library_items.published_at, EXCLUDED.published_at);

  RETURN NEW;
END $function$;

-- Expand trigger to also fire when ai_report is filled in (report freeze path).
DROP TRIGGER IF EXISTS trg_project_query_to_library ON public.queries;
CREATE TRIGGER trg_project_query_to_library
AFTER INSERT OR UPDATE OF is_public_library, query_text, ai_report, stock_symbol, stock_name
ON public.queries
FOR EACH ROW
WHEN (NEW.is_public_library = true)
EXECUTE FUNCTION public.fn_project_query_to_library();

-- One-shot backfill: project any opted-in queries with a frozen AI report that
-- currently have no library_items row.
INSERT INTO public.library_items
  (kind, source_id, source_table, symbol, title, verdict, analyst_id,
   body_excerpt, is_public, is_tombstoned, published_at)
SELECT 'report', q.id, 'queries',
       public.fn_normalize_symbol(coalesce(q.stock_symbol, q.stock_name)),
       CASE WHEN q.public_consent_anonymized
            THEN 'Question about ' || coalesce(q.stock_name,'a stock')
            ELSE left(coalesce(q.query_text, q.stock_name), 140) END,
       q.ai_report->>'verdict',
       q.assigned_analyst_id,
       left(regexp_replace(coalesce(q.ai_report->>'summary', q.query_text, ''), E'[#*_`>]', '', 'g'), 280),
       true, false, COALESCE(q.frozen_at, now())
FROM public.queries q
WHERE q.is_public_library = true
  AND q.library_tombstoned_at IS NULL
  AND q.ai_report IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.library_items li
    WHERE li.source_table = 'queries' AND li.source_id = q.id
  )
ON CONFLICT (source_table, source_id) DO NOTHING;
