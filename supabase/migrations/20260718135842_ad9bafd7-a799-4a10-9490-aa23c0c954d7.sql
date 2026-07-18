CREATE TABLE IF NOT EXISTS public.stock_picker_run_state (
  batch_id            uuid PRIMARY KEY,
  mode                text NOT NULL CHECK (mode IN ('live','dry_run','bootstrap')),
  invoked_by          text,
  run_date_ist        text NOT NULL,
  risk_profile        text,
  seed_version        text,
  status              text NOT NULL DEFAULT 'in_progress',
  attempt_count       integer NOT NULL DEFAULT 1,
  chunks_completed    integer NOT NULL DEFAULT 0,
  universe_size       integer,
  resume_from         text,
  last_error          text,
  last_heartbeat_at   timestamptz NOT NULL DEFAULT now(),
  next_attempt_at     timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.stock_picker_run_state TO service_role;

ALTER TABLE public.stock_picker_run_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "run_state service_role only"
  ON public.stock_picker_run_state
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS stock_picker_run_state_status_idx
  ON public.stock_picker_run_state (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS stock_picker_run_state_run_date_idx
  ON public.stock_picker_run_state (run_date_ist, mode);

CREATE TRIGGER stock_picker_run_state_touch
  BEFORE UPDATE ON public.stock_picker_run_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.stock_picker_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_kind    text NOT NULL,
  batch_id      uuid,
  run_date_ist  text,
  severity      text NOT NULL DEFAULT 'warn' CHECK (severity IN ('info','warn','error')),
  message       text NOT NULL,
  context       jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.stock_picker_alerts TO service_role;

ALTER TABLE public.stock_picker_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts service_role only"
  ON public.stock_picker_alerts
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS stock_picker_alerts_unresolved_idx
  ON public.stock_picker_alerts (created_at DESC) WHERE resolved_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stock_picker_alerts_dedup_idx
  ON public.stock_picker_alerts (alert_kind, COALESCE(batch_id::text, ''), COALESCE(run_date_ist, ''))
  WHERE resolved_at IS NULL;