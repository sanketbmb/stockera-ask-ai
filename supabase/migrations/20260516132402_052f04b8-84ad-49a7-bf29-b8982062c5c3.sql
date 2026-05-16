CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.user_portfolio (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stock_symbol TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  buy_price NUMERIC NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  target NUMERIC,
  stop_loss NUMERIC,
  added_from_query_id UUID,
  target_hit_notified BOOLEAN NOT NULL DEFAULT false,
  stop_loss_hit_notified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_portfolio_user ON public.user_portfolio(user_id);
CREATE INDEX idx_user_portfolio_symbol ON public.user_portfolio(stock_symbol);

ALTER TABLE public.user_portfolio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_own_select" ON public.user_portfolio FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "portfolio_own_insert" ON public.user_portfolio FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "portfolio_own_update" ON public.user_portfolio FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "portfolio_own_delete" ON public.user_portfolio FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_portfolio_updated
BEFORE UPDATE ON public.user_portfolio
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();