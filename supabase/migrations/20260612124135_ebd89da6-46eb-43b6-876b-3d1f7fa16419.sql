UPDATE public.stock_picker_runtime_config SET config_value = '"2b9df896-95b9-44a2-950e-cfba896aa22d"'::jsonb, updated_at = now() WHERE config_key = 'active_universe_snapshot_id';
INSERT INTO public.stock_picker_runtime_config (config_key, kind, config_value, description, updated_at)
SELECT 'active_universe_snapshot_id', 'operational', '"2b9df896-95b9-44a2-950e-cfba896aa22d"'::jsonb, 'Active universe snapshot pointer', now()
WHERE NOT EXISTS (SELECT 1 FROM public.stock_picker_runtime_config WHERE config_key='active_universe_snapshot_id');