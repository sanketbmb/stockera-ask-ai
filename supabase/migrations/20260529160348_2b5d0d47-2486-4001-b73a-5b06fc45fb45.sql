-- 1. PDF generation log table
CREATE TABLE public.pdf_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  horizon text NOT NULL,
  include_news boolean NOT NULL DEFAULT true,
  as_of_date text,
  cache_key text NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT false,
  cache_hit boolean NOT NULL DEFAULT false,
  error_message text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdf_log_created_at ON public.pdf_generation_log (created_at DESC);
CREATE INDEX idx_pdf_log_cache_key ON public.pdf_generation_log (cache_key);

GRANT SELECT ON public.pdf_generation_log TO authenticated;
GRANT ALL ON public.pdf_generation_log TO service_role;

ALTER TABLE public.pdf_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY pdf_log_admin_select ON public.pdf_generation_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Storage bucket for cached PDFs (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdf-cache', 'pdf-cache', false)
ON CONFLICT (id) DO NOTHING;

-- Only service_role accesses pdf-cache; no public/authenticated policies needed.
