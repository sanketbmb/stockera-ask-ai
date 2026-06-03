
-- Phase 4E backtest storage

CREATE TABLE public.backtest_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  symbol text NOT NULL,
  horizon text NOT NULL,
  entry_date date NOT NULL,
  engine_version text NOT NULL,
  regime text,
  reasoning_code text,
  entry_anchor text,
  preferred_entry numeric,
  entry_zone_lower numeric,
  entry_zone_upper numeric,
  target_1 numeric,
  target_2 numeric,
  stop_loss numeric,
  entry_hit boolean DEFAULT false,
  days_to_entry_hit integer,
  t1_hit boolean DEFAULT false,
  days_to_t1 integer,
  t2_hit boolean DEFAULT false,
  days_to_t2 integer,
  sl_hit_first boolean DEFAULT false,
  outcome text NOT NULL DEFAULT 'PENDING',
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_backtest_results_run ON public.backtest_results(run_id);
CREATE INDEX idx_backtest_results_outcome ON public.backtest_results(outcome);
CREATE INDEX idx_backtest_results_horizon ON public.backtest_results(horizon);
CREATE INDEX idx_backtest_results_regime ON public.backtest_results(regime);

GRANT SELECT ON public.backtest_results TO authenticated;
GRANT ALL ON public.backtest_results TO service_role;

ALTER TABLE public.backtest_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY backtest_results_admin_read ON public.backtest_results
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));


CREATE TABLE public.backtest_run_summary (
  run_id uuid PRIMARY KEY,
  engine_version text NOT NULL,
  universe_size integer NOT NULL DEFAULT 0,
  total_cases integer NOT NULL DEFAULT 0,
  completed_cases integer NOT NULL DEFAULT 0,
  data_error_cases integer NOT NULL DEFAULT 0,
  entry_hit_rate numeric,
  t1_hit_rate numeric,
  t2_hit_rate numeric,
  sl_hit_rate numeric,
  timeout_rate numeric,
  breakdown_by_horizon jsonb,
  breakdown_by_regime jsonb,
  breakdown_by_reasoning_code jsonb,
  status text NOT NULL DEFAULT 'running',
  next_chunk_index integer NOT NULL DEFAULT 0,
  config jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

GRANT SELECT ON public.backtest_run_summary TO authenticated;
GRANT ALL ON public.backtest_run_summary TO service_role;

ALTER TABLE public.backtest_run_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY backtest_run_summary_admin_read ON public.backtest_run_summary
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
