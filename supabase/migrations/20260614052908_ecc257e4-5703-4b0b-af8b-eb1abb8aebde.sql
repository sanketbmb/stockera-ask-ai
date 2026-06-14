INSERT INTO stock_picker_runtime_config (config_key, kind, config_value, description, updated_at)
VALUES
  ('zone_v2_globals', 'threshold',
   '{"stop_k":1.5,"rr_min":1.5,"rr_default":2.0,"max_stop_pct":0.04,"min_stop_pct":0.01,"max_target_pct":0.12,"buy_zone_half_pct":0.005,"structural_floor_mode":"tighten_only","v_clamp_min":0.005,"v_clamp_max":0.05}'::jsonb,
   'Phase 2Y.1 zone-math v2 global defaults', now()),
  ('profile_knobs_v2_conservative', 'threshold',
   '{"stop_k":1.3,"rr_default":2.5,"max_stop_pct":0.030}'::jsonb,
   'Phase 2Y.1 zone-math v2 conservative overrides', now()),
  ('profile_knobs_v2_moderate', 'threshold',
   '{"stop_k":1.5,"rr_default":2.0,"max_stop_pct":0.040}'::jsonb,
   'Phase 2Y.1 zone-math v2 moderate overrides', now()),
  ('profile_knobs_v2_aggressive', 'threshold',
   '{"stop_k":1.8,"rr_default":1.8,"max_stop_pct":0.055}'::jsonb,
   'Phase 2Y.1 zone-math v2 aggressive overrides', now()),
  ('profile_knobs_v2_ultra', 'threshold',
   '{"stop_k":2.0,"rr_default":1.6,"max_stop_pct":0.070}'::jsonb,
   'Phase 2Y.1 zone-math v2 ultra overrides', now())
ON CONFLICT (config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description = EXCLUDED.description,
      updated_at = now();