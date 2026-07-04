-- Stage 4A.2: public stock analytics cache backing the /stock/$symbol Analytics tab.
-- Nightly pre-warm + on-demand-authenticated compute both write here.
-- The table is anon/authenticated readable so the public route can render without auth,
-- and INSERT/UPDATE are service_role only so browsers cannot poison the cache.

CREATE TABLE IF NOT EXISTS public.stock_analytics_cache (
  symbol                text        NOT NULL,
  exchange              text        NOT NULL DEFAULT 'NSE',
  horizon               text        NOT NULL DEFAULT 'long-term',
  cache_date            date        NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  payload               jsonb       NOT NULL,
  payload_version       integer     NOT NULL DEFAULT 1,
  formula_version       text,
  weighting_profile_id  text,
  action_bucket_version text,
  origin                text        NOT NULL,
  compute_duration_ms   integer,
  provider_failures     jsonb                DEFAULT '[]'::jsonb,
  computed_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_analytics_cache_pkey PRIMARY KEY (symbol, exchange, horizon, cache_date),
  CONSTRAINT stock_analytics_cache_origin_chk CHECK (origin IN ('prewarm','on_demand_authenticated'))
);

CREATE INDEX IF NOT EXISTS stock_analytics_cache_cache_date_idx
  ON public.stock_analytics_cache (cache_date DESC);

CREATE INDEX IF NOT EXISTS stock_analytics_cache_origin_computed_at_idx
  ON public.stock_analytics_cache (origin, computed_at DESC);

GRANT SELECT ON public.stock_analytics_cache TO anon;
GRANT SELECT ON public.stock_analytics_cache TO authenticated;
GRANT ALL    ON public.stock_analytics_cache TO service_role;

ALTER TABLE public.stock_analytics_cache ENABLE ROW LEVEL SECURITY;

-- Public read (page loads for anonymous visitors)
CREATE POLICY stock_analytics_cache_public_read
  ON public.stock_analytics_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Writes restricted to service_role only (bypasses RLS anyway but keep an explicit deny for authenticated).
-- No INSERT/UPDATE/DELETE policies for anon/authenticated => denied by default.