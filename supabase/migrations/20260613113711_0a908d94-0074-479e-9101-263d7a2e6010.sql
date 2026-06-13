UPDATE public.stock_picker_runtime_config
SET config_value = (
  SELECT jsonb_agg(symbol ORDER BY symbol ASC, exchange ASC)
  FROM public.stock_picker_universe_snapshot_member
  WHERE universe_snapshot_id = '57d60a8d-09c5-4b87-a4d9-cba8282ed3d9'
),
updated_at = now()
WHERE config_key = 'universe_override_symbols';