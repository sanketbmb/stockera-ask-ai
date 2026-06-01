-- Phase 1.1: Immutable report artifact tracking.
-- ai_report (JSONB) already exists. Add freezing metadata only.
ALTER TABLE public.queries
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_artifact_status TEXT;

CREATE INDEX IF NOT EXISTS idx_queries_frozen_at ON public.queries(frozen_at);
