
-- 1. Add intent + pnl_state to queries
ALTER TABLE public.queries
  ADD COLUMN IF NOT EXISTS intent TEXT,
  ADD COLUMN IF NOT EXISTS pnl_state TEXT;

-- 2. ai_reports table
CREATE TABLE IF NOT EXISTS public.ai_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL REFERENCES public.queries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  intent TEXT NOT NULL,
  stock_symbol TEXT,
  stock_exchange TEXT,
  ltp_value NUMERIC,
  ltp_timestamp TIMESTAMPTZ,
  ltp_source TEXT,
  pnl_state TEXT,
  prompt_version TEXT NOT NULL,
  llm_provider TEXT NOT NULL,
  llm_model TEXT NOT NULL,
  llm_input_tokens INTEGER DEFAULT 0,
  llm_output_tokens INTEGER DEFAULT 0,
  llm_cost_usd NUMERIC DEFAULT 0,
  raw_llm_response JSONB,
  rendered_sections JSONB,
  requires_analyst_review BOOLEAN NOT NULL DEFAULT true,
  analyst_assigned_id UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_query_id ON public.ai_reports(query_id);
CREATE INDEX IF NOT EXISTS idx_ai_reports_user_id ON public.ai_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_reports_analyst ON public.ai_reports(analyst_assigned_id) WHERE analyst_assigned_id IS NOT NULL;

ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_reports_own_select" ON public.ai_reports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ai_reports_admin_all" ON public.ai_reports
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ai_reports_analyst_assigned" ON public.ai_reports
  FOR SELECT USING (auth.uid() = analyst_assigned_id);

-- 3. audit_events table (append-only)
CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  actor_id UUID,
  resource_type TEXT,
  resource_id UUID,
  payload JSONB,
  ip_address TEXT,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON public.audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON public.audit_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_type_time ON public.audit_events(event_type, occurred_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_events_own_select" ON public.audit_events
  FOR SELECT USING (auth.uid() = actor_id);

CREATE POLICY "audit_events_admin_select" ON public.audit_events
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "audit_events_authenticated_insert" ON public.audit_events
  FOR INSERT WITH CHECK (auth.uid() = actor_id OR actor_id IS NULL);

-- No UPDATE or DELETE policies — append-only by design.
