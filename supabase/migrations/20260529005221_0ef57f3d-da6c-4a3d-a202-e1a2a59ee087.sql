
ALTER TABLE public.stock_master ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'EQUITY';

CREATE TABLE IF NOT EXISTS public.benchmark_cache (
  benchmark_symbol TEXT PRIMARY KEY,
  daily_candles JSONB NOT NULL,
  candle_count INTEGER NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.benchmark_cache TO anon, authenticated;
GRANT ALL ON public.benchmark_cache TO service_role;

ALTER TABLE public.benchmark_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benchmark_cache_public_read" ON public.benchmark_cache
  FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.risk_compute_meta (
  stock_symbol TEXT PRIMARY KEY,
  last_beta_compute_at TIMESTAMPTZ,
  last_beta NUMERIC,
  last_correlation NUMERIC,
  last_r_squared NUMERIC,
  last_benchmark TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.risk_compute_meta TO anon, authenticated;
GRANT ALL ON public.risk_compute_meta TO service_role;

ALTER TABLE public.risk_compute_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "risk_compute_meta_public_read" ON public.risk_compute_meta
  FOR SELECT USING (true);
