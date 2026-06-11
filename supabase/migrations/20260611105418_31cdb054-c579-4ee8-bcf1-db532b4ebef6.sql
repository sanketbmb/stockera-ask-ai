
CREATE TABLE IF NOT EXISTS public.stock_picker_ohlcv_backfill_state (
  symbol text NOT NULL,
  exchange text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','done','failed','skipped')),
  rows_inserted int NOT NULL DEFAULT 0,
  source text,
  last_error text,
  attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, exchange)
);

CREATE INDEX IF NOT EXISTS ix_ohlcv_backfill_state_status
  ON public.stock_picker_ohlcv_backfill_state (status);

GRANT SELECT ON public.stock_picker_ohlcv_backfill_state TO authenticated;
GRANT ALL ON public.stock_picker_ohlcv_backfill_state TO service_role;

ALTER TABLE public.stock_picker_ohlcv_backfill_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read backfill state"
  ON public.stock_picker_ohlcv_backfill_state
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "service_role full access backfill state"
  ON public.stock_picker_ohlcv_backfill_state
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_ohlcv_backfill_state_updated_at
  BEFORE UPDATE ON public.stock_picker_ohlcv_backfill_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
