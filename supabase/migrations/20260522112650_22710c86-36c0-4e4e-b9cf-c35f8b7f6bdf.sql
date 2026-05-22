
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  query_id UUID,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  purpose TEXT NOT NULL DEFAULT 'video_answer',
  order_id TEXT NOT NULL UNIQUE,
  payment_id TEXT UNIQUE,
  amount_paise INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created',
  signature TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_own_select ON public.payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY payments_admin_all ON public.payments
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS payments_user_idx ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS payments_query_idx ON public.payments(query_id);

ALTER TABLE public.queries
  ADD COLUMN IF NOT EXISTS video_requested BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_payment_id UUID REFERENCES public.payments(id);
