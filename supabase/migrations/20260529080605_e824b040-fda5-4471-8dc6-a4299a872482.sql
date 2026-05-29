
CREATE TABLE public.sentiment_cache (
  symbol TEXT PRIMARY KEY,
  articles JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ttl_hours INT NOT NULL DEFAULT 6,
  symbol_format_used TEXT
);
GRANT ALL ON public.sentiment_cache TO service_role;
ALTER TABLE public.sentiment_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketaux_usage_log (
  date DATE PRIMARY KEY,
  call_count INT NOT NULL DEFAULT 0,
  articles_returned INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketaux_usage_log TO service_role;
ALTER TABLE public.marketaux_usage_log ENABLE ROW LEVEL SECURITY;
