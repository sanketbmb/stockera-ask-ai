
-- Phase 2R: gate thresholds + per-profile persistence flags + global flag flip
INSERT INTO public.stock_picker_runtime_config (config_key, kind, config_value, description) VALUES
  ('gate_min_avg_return_pct',     'threshold',  to_jsonb(0.10::numeric),  'Phase 2R backtest gate: min avg return % per profile'),
  ('gate_min_hit_rate',           'threshold',  to_jsonb(0.55::numeric),  'Phase 2R backtest gate: min hit rate per profile'),
  ('gate_max_abs_drawdown_pct',   'threshold',  to_jsonb(25.00::numeric), 'Phase 2R backtest gate: max abs(avg drawdown %) per profile'),
  ('gate_min_signals_per_symbol', 'threshold',  to_jsonb(30::numeric),    'Phase 2R backtest gate: min avg signals per symbol'),
  ('composite_score_persist_conservative', 'enable_flag', to_jsonb(false), 'Phase 2R per-profile persistence gate (conservative)'),
  ('composite_score_persist_moderate',     'enable_flag', to_jsonb(false), 'Phase 2R per-profile persistence gate (moderate)'),
  ('composite_score_persist_aggressive',   'enable_flag', to_jsonb(false), 'Phase 2R per-profile persistence gate (aggressive)'),
  ('composite_score_persist_ultra',        'enable_flag', to_jsonb(false), 'Phase 2R per-profile persistence gate (ultra)')
ON CONFLICT (config_key) DO NOTHING;

-- Apply Phase 2R gate evaluation (moderate, aggressive, ultra PASS; conservative FAIL on avg_return).
INSERT INTO public.stock_picker_runtime_config (config_key, kind, config_value, description) VALUES
  ('composite_score_persist_moderate',     'enable_flag', to_jsonb(true),  'Phase 2R per-profile persistence gate (moderate)'),
  ('composite_score_persist_aggressive',   'enable_flag', to_jsonb(true),  'Phase 2R per-profile persistence gate (aggressive)'),
  ('composite_score_persist_ultra',        'enable_flag', to_jsonb(true),  'Phase 2R per-profile persistence gate (ultra)'),
  ('composite_score_persist_conservative', 'enable_flag', to_jsonb(false), 'Phase 2R per-profile persistence gate (conservative) — backtest FAILED gate, persistence stays off')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, description = EXCLUDED.description, updated_at = now();

-- Global gate: at least one profile passed, so open the door. Per-profile flags remain the gatekeepers.
INSERT INTO public.stock_picker_runtime_config (config_key, kind, config_value, description) VALUES
  ('composite_score_writes_enabled', 'enable_flag', to_jsonb(true), 'Phase 2R: global door — per-profile flags still gate per batch')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, description = EXCLUDED.description, updated_at = now();
