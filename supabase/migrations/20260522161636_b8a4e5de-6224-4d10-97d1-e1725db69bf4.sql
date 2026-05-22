
CREATE TABLE public.session_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  analyst_id uuid NOT NULL,
  tier text NOT NULL,
  amount_paise integer NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_id uuid,
  meeting_link text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_bookings_user_select ON public.session_bookings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY session_bookings_user_insert ON public.session_bookings
  FOR INSERT WITH CHECK (auth.uid() = user_id AND amount_paise > 0 AND amount_paise <= 1000000);

CREATE POLICY session_bookings_analyst_select ON public.session_bookings
  FOR SELECT USING (auth.uid() = analyst_id);

CREATE POLICY session_bookings_analyst_update ON public.session_bookings
  FOR UPDATE USING (auth.uid() = analyst_id);

CREATE POLICY session_bookings_admin_all ON public.session_bookings
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER session_bookings_updated_at
  BEFORE UPDATE ON public.session_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_session_bookings_user ON public.session_bookings(user_id, created_at DESC);
CREATE INDEX idx_session_bookings_analyst ON public.session_bookings(analyst_id, scheduled_for);
