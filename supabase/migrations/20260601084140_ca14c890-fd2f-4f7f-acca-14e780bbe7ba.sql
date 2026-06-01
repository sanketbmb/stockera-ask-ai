
CREATE TABLE IF NOT EXISTS public.sector_aggregates (
  sector text PRIMARY KEY,
  pe_median numeric NOT NULL,
  pe_p25 numeric,
  pe_p75 numeric,
  return_12m_median_pct numeric,
  sample_size integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'bootstrap',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sector_aggregates TO anon, authenticated;
GRANT ALL ON public.sector_aggregates TO service_role;

ALTER TABLE public.sector_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY sector_aggregates_public_read ON public.sector_aggregates
  FOR SELECT USING (true);

-- Bootstrap with empirical Indian-market sector P/E medians and a default
-- 12m drift assumption (~Nifty 50 long-run nominal return). The nightly
-- seed-sector-aggregates job will recompute and override these values.
INSERT INTO public.sector_aggregates (sector, pe_median, return_12m_median_pct, sample_size, source) VALUES
  ('Financial Services', 18, 12, 0, 'bootstrap'),
  ('Banks',              16, 12, 0, 'bootstrap'),
  ('Information Technology', 28, 10, 0, 'bootstrap'),
  ('IT - Software',      28, 10, 0, 'bootstrap'),
  ('Software & Services', 28, 10, 0, 'bootstrap'),
  ('FMCG',               48, 11, 0, 'bootstrap'),
  ('Consumer Staples',   45, 11, 0, 'bootstrap'),
  ('Consumer Discretionary', 40, 13, 0, 'bootstrap'),
  ('Pharmaceuticals',    32, 12, 0, 'bootstrap'),
  ('Healthcare',         35, 12, 0, 'bootstrap'),
  ('Automobile',         25, 14, 0, 'bootstrap'),
  ('Auto Components',    28, 14, 0, 'bootstrap'),
  ('Energy',             13, 9,  0, 'bootstrap'),
  ('Oil & Gas',          12, 9,  0, 'bootstrap'),
  ('Metals & Mining',    15, 10, 0, 'bootstrap'),
  ('Capital Goods',      45, 14, 0, 'bootstrap'),
  ('Engineering',        40, 13, 0, 'bootstrap'),
  ('Telecom',            55, 12, 0, 'bootstrap'),
  ('Telecommunication',  55, 12, 0, 'bootstrap'),
  ('Utilities',          18, 10, 0, 'bootstrap'),
  ('Power',              18, 10, 0, 'bootstrap'),
  ('Real Estate',        35, 14, 0, 'bootstrap'),
  ('Chemicals',          30, 11, 0, 'bootstrap'),
  ('Cement',             28, 11, 0, 'bootstrap'),
  ('Media',              25, 9,  0, 'bootstrap'),
  ('Textiles',           20, 10, 0, 'bootstrap'),
  ('Infrastructure',     30, 12, 0, 'bootstrap'),
  ('Construction',       25, 12, 0, 'bootstrap'),
  ('Diversified',        25, 11, 0, 'bootstrap'),
  ('Agriculture',        22, 10, 0, 'bootstrap'),
  ('Services',           30, 11, 0, 'bootstrap'),
  ('__default__',        25, 11, 0, 'bootstrap')
ON CONFLICT (sector) DO NOTHING;
