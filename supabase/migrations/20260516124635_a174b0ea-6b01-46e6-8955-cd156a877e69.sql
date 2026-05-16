CREATE TABLE IF NOT EXISTS public.market_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.market_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_cache_read" ON public.market_cache;
CREATE POLICY "market_cache_read"
  ON public.market_cache
  FOR SELECT
  USING (true);