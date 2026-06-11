CREATE TABLE IF NOT EXISTS public.stock_picker_ohlcv_history (
  symbol text NOT NULL,
  exchange text NOT NULL,
  record_date date NOT NULL,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume numeric,
  source text NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, exchange, record_date)
);

GRANT SELECT ON public.stock_picker_ohlcv_history TO authenticated;
GRANT ALL ON public.stock_picker_ohlcv_history TO service_role;

ALTER TABLE public.stock_picker_ohlcv_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ohlcv_history_authenticated_read"
  ON public.stock_picker_ohlcv_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ohlcv_history_service_role_all"
  ON public.stock_picker_ohlcv_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS ix_ohlcv_history_symbol_date
  ON public.stock_picker_ohlcv_history (symbol, exchange, record_date DESC);