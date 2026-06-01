ALTER TABLE public.queries
  ADD COLUMN IF NOT EXISTS engine_version text,
  ADD COLUMN IF NOT EXISTS engine_source text,
  ADD COLUMN IF NOT EXISTS horizon text,
  ADD COLUMN IF NOT EXISTS custom_question text,
  ADD COLUMN IF NOT EXISTS orchestrator_response_id text,
  ADD COLUMN IF NOT EXISTS regenerated_from_uuid uuid;

CREATE INDEX IF NOT EXISTS idx_queries_engine_version ON public.queries(engine_version);
CREATE INDEX IF NOT EXISTS idx_queries_regenerated_from ON public.queries(regenerated_from_uuid);