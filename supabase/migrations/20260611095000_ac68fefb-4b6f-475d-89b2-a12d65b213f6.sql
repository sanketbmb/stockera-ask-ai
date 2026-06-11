INSERT INTO public.stock_picker_runtime_config (config_key, kind, config_value, description) VALUES
  ('zone_vol_clamp_min',           'threshold', to_jsonb(0.005::numeric), 'Phase 2O: vc clamp lower bound'),
  ('zone_vol_clamp_max',           'threshold', to_jsonb(0.05::numeric),  'Phase 2O: vc clamp upper bound'),
  ('zone_vol_default',             'threshold', to_jsonb(0.02::numeric),  'Phase 2O: default vc when realized_vol_20d is null'),
  ('zone_buy_upper_factor',        'threshold', to_jsonb(0.25::numeric),  'Phase 2O: buy_zone upper = CMP*(1 - vc*X)'),
  ('zone_buy_lower_factor',        'threshold', to_jsonb(1.25::numeric),  'Phase 2O: buy_zone lower base = CMP*(1 - vc*X)'),
  ('zone_buy_lower_floor_factor',  'threshold', to_jsonb(0.98::numeric),  'Phase 2O: buy_zone lower floor = low_20d*X'),
  ('zone_target_vol_mult',         'threshold', to_jsonb(3.0::numeric),   'Phase 2O: target = CMP*(1 + vc*X)'),
  ('zone_target_high_factor',      'threshold', to_jsonb(1.02::numeric),  'Phase 2O: target anchor = high_20d*X'),
  ('zone_stop_vol_mult',           'threshold', to_jsonb(3.0::numeric),   'Phase 2O: stop_loss = CMP*(1 - vc*X)'),
  ('zone_stop_low_factor',         'threshold', to_jsonb(0.95::numeric),  'Phase 2O: stop_loss anchor = low_20d*X'),
  ('score_weight_vol',             'threshold', to_jsonb(0.4::numeric),   'Phase 2O: composite weight on vol_score'),
  ('score_weight_trend',           'threshold', to_jsonb(0.4::numeric),   'Phase 2O: composite weight on trend_score'),
  ('score_weight_mean_rev',        'threshold', to_jsonb(0.2::numeric),   'Phase 2O: composite weight on mean-reversion proximity'),
  ('backtest_holding_window',      'threshold', to_jsonb(5::numeric),     'Phase 2O: backtest holding window in trading closes')
ON CONFLICT (config_key) DO NOTHING;