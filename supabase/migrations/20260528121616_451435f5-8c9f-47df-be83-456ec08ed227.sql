
CREATE TABLE public.stock_master (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  company_name TEXT,
  dhan_security_id TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('NSE','BSE')),
  segment TEXT NOT NULL CHECK (segment IN ('NSE_EQ','BSE_EQ')),
  isin TEXT,
  lot_size INTEGER,
  tick_size NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stock_master_secid_segment_uniq UNIQUE (dhan_security_id, segment)
);

CREATE INDEX idx_stock_master_symbol ON public.stock_master (symbol);
CREATE INDEX idx_stock_master_security_id ON public.stock_master (dhan_security_id);
CREATE INDEX idx_stock_master_isin ON public.stock_master (isin);
CREATE INDEX idx_stock_master_exchange_symbol ON public.stock_master (exchange, symbol);

GRANT SELECT ON public.stock_master TO anon, authenticated;
GRANT ALL ON public.stock_master TO service_role;

ALTER TABLE public.stock_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_master_public_read"
  ON public.stock_master FOR SELECT
  USING (true);
