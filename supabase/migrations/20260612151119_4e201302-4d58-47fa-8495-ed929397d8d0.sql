UPDATE public.stock_picker_runtime_config
SET config_value = to_jsonb('bb4413e1-8221-49e8-9dda-88d69f065826'::text)
WHERE config_key = 'active_universe_snapshot_id';