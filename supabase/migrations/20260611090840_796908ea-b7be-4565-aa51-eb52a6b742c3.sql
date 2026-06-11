
CREATE TABLE IF NOT EXISTS public.stock_picker_backtest_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  symbol text NOT NULL,
  exchange text NOT NULL,
  risk_profile text NOT NULL CHECK (risk_profile IN ('conservative','moderate','aggressive','ultra')),
  window_start date NOT NULL,
  window_end date NOT NULL,
  n_signals int NOT NULL,
  n_wins int NOT NULL,
  n_losses int NOT NULL,
  hit_rate numeric,
  avg_return_pct numeric,
  median_return_pct numeric,
  max_drawdown_pct numeric,
  information_coefficient numeric,
  composite_score_preview_avg numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stock_picker_backtest_run TO authenticated;
GRANT ALL ON public.stock_picker_backtest_run TO service_role;

ALTER TABLE public.stock_picker_backtest_run ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backtest_run_authenticated_read"
  ON public.stock_picker_backtest_run FOR SELECT
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS ix_backtest_run_id
  ON public.stock_picker_backtest_run (run_id);
