
ALTER TABLE public.ltp_cache
  ADD COLUMN IF NOT EXISTS exchange text NOT NULL DEFAULT 'NSE',
  ADD COLUMN IF NOT EXISTS as_of timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.fundamentals_cache (
  symbol text NOT NULL,
  exchange text NOT NULL DEFAULT 'NSE',
  sector text,
  industry text,
  market_cap_rs numeric,
  cap_band text,
  source text,
  as_of timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, exchange)
);
GRANT SELECT ON public.fundamentals_cache TO authenticated;
GRANT ALL ON public.fundamentals_cache TO service_role;
ALTER TABLE public.fundamentals_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fundamentals_cache read auth" ON public.fundamentals_cache;
CREATE POLICY "fundamentals_cache read auth" ON public.fundamentals_cache
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.news_cache (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL,
  exchange text,
  headline text NOT NULL,
  url text,
  source text,
  published_at timestamptz NOT NULL,
  category text,
  inserted_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS news_cache_symbol_url_publishedat_uidx
  ON public.news_cache (symbol, url, published_at);
CREATE INDEX IF NOT EXISTS news_cache_symbol_publishedat_idx
  ON public.news_cache (symbol, published_at DESC);
GRANT SELECT ON public.news_cache TO authenticated;
GRANT ALL ON public.news_cache TO service_role;
ALTER TABLE public.news_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "news_cache read auth" ON public.news_cache;
CREATE POLICY "news_cache read auth" ON public.news_cache
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.stock_picker_runtime_config (config_key, kind, config_value, description)
VALUES
  ('ltp_cache_ttl_seconds',          'threshold',   to_jsonb(60),    'Phase 2E: LTP cache TTL (seconds)'),
  ('fundamentals_cache_ttl_seconds', 'threshold',   to_jsonb(86400), 'Phase 2E: fundamentals cache TTL (seconds)'),
  ('news_cache_ttl_seconds',         'threshold',   to_jsonb(1800),  'Phase 2E: news cache TTL (seconds)'),
  ('dhan_api_enabled',               'enable_flag', to_jsonb(true),  'Phase 2E: allow background Dhan sync'),
  ('finedge_api_enabled',            'enable_flag', to_jsonb(true),  'Phase 2E: allow background FinEdge sync'),
  ('marketaux_api_enabled',          'enable_flag', to_jsonb(true),  'Phase 2E: allow background Marketaux sync'),
  ('browserless_api_enabled',        'enable_flag', to_jsonb(false), 'Phase 2E: Browserless dormant')
ON CONFLICT (config_key) DO NOTHING;
