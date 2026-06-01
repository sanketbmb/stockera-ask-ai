
CREATE TABLE IF NOT EXISTS public.ltp_cache (
  symbol      TEXT PRIMARY KEY,
  ltp         NUMERIC NOT NULL,
  source      TEXT NOT NULL DEFAULT 'dhan',
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ltp_cache TO anon, authenticated;
GRANT ALL    ON public.ltp_cache TO service_role;

ALTER TABLE public.ltp_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY ltp_cache_public_read
  ON public.ltp_cache
  FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS ltp_cache_fetched_at_idx
  ON public.ltp_cache (fetched_at DESC);
