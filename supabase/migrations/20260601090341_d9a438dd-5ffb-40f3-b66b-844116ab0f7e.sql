
ALTER TABLE public.sector_aggregates
  ADD COLUMN IF NOT EXISTS sector_canonical text,
  ADD COLUMN IF NOT EXISTS sector_display text,
  ADD COLUMN IF NOT EXISTS pb_median numeric,
  ADD COLUMN IF NOT EXISTS roe_median numeric,
  ADD COLUMN IF NOT EXISTS pe_avg_5y numeric,
  ADD COLUMN IF NOT EXISTS pe_high_5y numeric,
  ADD COLUMN IF NOT EXISTS pe_low_5y numeric,
  ADD COLUMN IF NOT EXISTS method_version text NOT NULL DEFAULT 'bootstrap_v1',
  ADD COLUMN IF NOT EXISTS bootstrap_source_reference text,
  ADD COLUMN IF NOT EXISTS as_of_timestamp timestamptz NOT NULL DEFAULT now();

UPDATE public.sector_aggregates
SET sector_canonical = COALESCE(sector_canonical,
      regexp_replace(regexp_replace(lower(trim(sector)), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g')),
    sector_display = COALESCE(sector_display, sector)
WHERE sector_canonical IS NULL OR sector_display IS NULL;

ALTER TABLE public.sector_aggregates ALTER COLUMN sector_canonical SET NOT NULL;

-- Switch PK from sector → sector_canonical so canonical upserts work
ALTER TABLE public.sector_aggregates DROP CONSTRAINT IF EXISTS sector_aggregates_pkey;
DROP INDEX IF EXISTS sector_aggregates_sector_canonical_uidx;
ALTER TABLE public.sector_aggregates ADD PRIMARY KEY (sector_canonical);

-- Seed bootstrap sectors (canonical-keyed)
INSERT INTO public.sector_aggregates
  (sector, sector_canonical, sector_display, pe_median, pb_median, source, method_version, bootstrap_source_reference, sample_size)
VALUES
  ('Private Sector Bank', 'private_sector_bank', 'Private Sector Bank', 16, 2.4, 'bootstrap', 'bootstrap_v1', 'Trendlyne/Screener/NSE — May 2026 snapshot', 0),
  ('Public Sector Bank',  'public_sector_bank',  'Public Sector Bank',  8,  1.0, 'bootstrap', 'bootstrap_v1', 'Trendlyne/Screener/NSE — May 2026 snapshot', 0),
  ('IT Services',         'it_services',         'IT Services',         25, 7,   'bootstrap', 'bootstrap_v1', 'Trendlyne/Screener/NSE — May 2026 snapshot', 0),
  ('Petroleum Products',  'petroleum_products',  'Refineries & Marketing', 12, 1.8, 'bootstrap', 'bootstrap_v1', 'Trendlyne/Screener/NSE — May 2026 snapshot', 0),
  ('Pharmaceuticals',     'pharmaceuticals',     'Pharmaceuticals',     28, 4.5, 'bootstrap', 'bootstrap_v1', 'Trendlyne/Screener/NSE — May 2026 snapshot', 0),
  ('Automobile',          'automobile',          'Automobile',          22, 3.5, 'bootstrap', 'bootstrap_v1', 'Trendlyne/Screener/NSE — May 2026 snapshot', 0),
  ('FMCG',                'fmcg',                'FMCG',                45, 12,  'bootstrap', 'bootstrap_v1', 'Trendlyne/Screener/NSE — May 2026 snapshot', 0),
  ('Capital Goods',       'capital_goods',       'Capital Goods',       35, 5,   'bootstrap', 'bootstrap_v1', 'Trendlyne/Screener/NSE — May 2026 snapshot', 0),
  ('Telecom',             'telecom',             'Telecom',             30, 4,   'bootstrap', 'bootstrap_v1', 'Trendlyne/Screener/NSE — May 2026 snapshot', 0),
  ('Cement',              'cement',              'Cement',              25, 3,   'bootstrap', 'bootstrap_v1', 'Trendlyne/Screener/NSE — May 2026 snapshot', 0),
  ('__default__',         '__default__',         'Default Fallback',    22, 3,   'bootstrap', 'bootstrap_v1', 'Stockera default fallback', 0)
ON CONFLICT (sector_canonical) DO UPDATE
SET pe_median = EXCLUDED.pe_median,
    pb_median = EXCLUDED.pb_median,
    sector_display = EXCLUDED.sector_display,
    method_version = EXCLUDED.method_version,
    bootstrap_source_reference = EXCLUDED.bootstrap_source_reference,
    source = EXCLUDED.source,
    as_of_timestamp = now(),
    updated_at = now();
