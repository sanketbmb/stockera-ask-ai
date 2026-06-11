CREATE TABLE IF NOT EXISTS public.stock_picker_backtest_sweep (
  id uuid primary key default gen_random_uuid(),
  sweep_id uuid not null,
  variant_id int not null,
  knob_set jsonb not null,
  risk_profile text not null check (risk_profile in ('conservative','moderate','aggressive','ultra')),
  symbols_evaluated int not null,
  total_trades int not null,
  hit_rate numeric,
  avg_return_pct numeric,
  median_return_pct numeric,
  max_drawdown_pct numeric,
  risk_adjusted_score numeric,
  created_at timestamptz not null default now()
);

GRANT ALL ON public.stock_picker_backtest_sweep TO service_role;
ALTER TABLE public.stock_picker_backtest_sweep ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS ix_backtest_sweep_id
  ON public.stock_picker_backtest_sweep (sweep_id);

INSERT INTO public.stock_picker_runtime_config (config_key, kind, config_value, description) VALUES
  ('sweep_enabled',                'enable_flag', to_jsonb(true),                        'Phase 2P: enable backtest sweep runs'),
  ('sweep_max_variants',           'threshold',   to_jsonb(24::int),                     'Phase 2P: cap on variants per sweep'),
  ('sweep_holding_windows',        'identifier',  '[5,10,20]'::jsonb,                    'Phase 2P: holding window candidates (trading closes)'),
  ('sweep_target_vol_mults',       'identifier',  '[2.0,3.0,4.0]'::jsonb,                'Phase 2P: target_vol_mult candidates'),
  ('sweep_stop_vol_mults',         'identifier',  '[1.5,2.0,3.0]'::jsonb,                'Phase 2P: stop_vol_mult candidates'),
  ('sweep_min_trades_per_profile', 'threshold',   to_jsonb(30::int),                     'Phase 2P: minimum trades for non-null risk_adjusted_score')
ON CONFLICT (config_key) DO NOTHING;