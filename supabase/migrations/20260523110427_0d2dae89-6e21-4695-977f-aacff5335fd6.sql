
-- Add analyst report fields to answers
ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS report_url text,
  ADD COLUMN IF NOT EXISTS report_filename text,
  ADD COLUMN IF NOT EXISTS report_mime text,
  ADD COLUMN IF NOT EXISTS report_size_bytes integer,
  ADD COLUMN IF NOT EXISTS report_label text DEFAULT 'Analyst Report';

-- Create public storage bucket for analyst reports
INSERT INTO storage.buckets (id, name, public)
VALUES ('analyst-reports', 'analyst-reports', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read for everyone (giveaway downloads)
DROP POLICY IF EXISTS "analyst_reports_public_read" ON storage.objects;
CREATE POLICY "analyst_reports_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'analyst-reports');

-- Only analysts / admins can write
DROP POLICY IF EXISTS "analyst_reports_analyst_insert" ON storage.objects;
CREATE POLICY "analyst_reports_analyst_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'analyst-reports'
  AND (public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin'))
);

DROP POLICY IF EXISTS "analyst_reports_analyst_update" ON storage.objects;
CREATE POLICY "analyst_reports_analyst_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'analyst-reports'
  AND (public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin'))
);

DROP POLICY IF EXISTS "analyst_reports_analyst_delete" ON storage.objects;
CREATE POLICY "analyst_reports_analyst_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'analyst-reports'
  AND (public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin'))
);
