-- Stage 4A security migration: require anonymized consent for public library exposure.

-- 1) queries: tighten public-library SELECT path
DROP POLICY IF EXISTS queries_select_public_library ON public.queries;

CREATE POLICY queries_select_public_library
  ON public.queries
  FOR SELECT
  USING (
    is_public_library = true
    AND library_tombstoned_at IS NULL
    AND ai_report IS NOT NULL
    AND public_consent_anonymized = true
  );

-- 2) library_items: tighten public SELECT path so query-sourced rows require
--    the source query to have anonymized consent. Owner path unchanged.
--    Non-query-sourced public rows (e.g. video/analyst) remain visible via is_public = true.
DROP POLICY IF EXISTS library_items_select_public_or_owner ON public.library_items;

CREATE POLICY library_items_select_public_or_owner
  ON public.library_items
  FOR SELECT
  USING (
    (
      is_public = true
      AND is_tombstoned = false
      AND (
        source_table <> 'queries'
        OR EXISTS (
          SELECT 1 FROM public.queries q
          WHERE q.id = library_items.source_id
            AND q.is_public_library = true
            AND q.library_tombstoned_at IS NULL
            AND q.public_consent_anonymized = true
        )
      )
    )
    OR (
      auth.uid() = CASE source_table
        WHEN 'queries'::text THEN (
          SELECT queries.user_id FROM public.queries WHERE queries.id = library_items.source_id
        )
        ELSE NULL::uuid
      END
    )
  );