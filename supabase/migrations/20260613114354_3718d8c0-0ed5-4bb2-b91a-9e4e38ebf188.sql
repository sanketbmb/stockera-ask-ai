UPDATE public.stock_picker_runtime_config
SET config_value = (
  SELECT jsonb_agg(symbol ORDER BY ord)
  FROM (
    SELECT symbol, ROW_NUMBER() OVER (ORDER BY symbol ASC, exchange ASC) AS ord
    FROM public.stock_picker_universe_snapshot_member
    WHERE universe_snapshot_id = '57d60a8d-09c5-4b87-a4d9-cba8282ed3d9'
  ) ranked
  WHERE ord <= 500
),
updated_at = now()
WHERE config_key = 'universe_override_symbols';