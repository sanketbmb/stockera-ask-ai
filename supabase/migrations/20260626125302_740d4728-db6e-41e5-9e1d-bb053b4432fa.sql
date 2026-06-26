-- FIX-L4C1-REPORT-ACCESS — allow public read of queries rows that the user
-- has explicitly opted into the public library. Additive policy only;
-- existing owner/analyst/admin policies are untouched. Tombstoned rows and
-- private rows remain protected.

CREATE POLICY "queries_select_public_library"
  ON public.queries
  FOR SELECT
  TO anon, authenticated
  USING (
    is_public_library = true
    AND library_tombstoned_at IS NULL
    AND ai_report IS NOT NULL
  );