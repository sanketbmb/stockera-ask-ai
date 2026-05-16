-- Grievances table for SEBI-mandated complaint tracking
CREATE TABLE public.grievances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE DEFAULT ('GRV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6))),
  user_id UUID,
  complainant_name TEXT NOT NULL,
  complainant_email TEXT NOT NULL,
  complainant_phone TEXT,
  against_analyst_id UUID,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  sla_due_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  resolved_at TIMESTAMPTZ,
  escalated_to_scores BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_grievances_user ON public.grievances(user_id);
CREATE INDEX idx_grievances_analyst ON public.grievances(against_analyst_id);
CREATE INDEX idx_grievances_status ON public.grievances(status);
CREATE INDEX idx_grievances_created ON public.grievances(created_at);

ALTER TABLE public.grievances ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can file a grievance
CREATE POLICY grievances_public_insert ON public.grievances
  FOR INSERT WITH CHECK (true);

-- Users see their own grievances
CREATE POLICY grievances_own_select ON public.grievances
  FOR SELECT USING (auth.uid() = user_id);

-- Analysts see grievances filed against them
CREATE POLICY grievances_analyst_select ON public.grievances
  FOR SELECT USING (auth.uid() = against_analyst_id);

-- Admins see and manage everything
CREATE POLICY grievances_admin_all ON public.grievances
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_grievances_updated
  BEFORE UPDATE ON public.grievances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Public aggregate view of complaints per analyst (last 30 days) — SEBI requirement
CREATE OR REPLACE VIEW public.analyst_complaints_summary AS
SELECT
  against_analyst_id AS analyst_id,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS total_last_30d,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days' AND status = 'resolved') AS resolved_last_30d,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days' AND status <> 'resolved') AS pending_last_30d,
  COUNT(*) AS total_all_time,
  COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_all_time
FROM public.grievances
WHERE against_analyst_id IS NOT NULL
GROUP BY against_analyst_id;

GRANT SELECT ON public.analyst_complaints_summary TO anon, authenticated;