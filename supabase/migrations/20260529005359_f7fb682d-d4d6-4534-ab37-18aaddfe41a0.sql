
ALTER TABLE public.stock_master DROP CONSTRAINT IF EXISTS stock_master_segment_check;
ALTER TABLE public.stock_master ADD CONSTRAINT stock_master_segment_check
  CHECK (segment = ANY (ARRAY['NSE_EQ','BSE_EQ','IDX_I']));

INSERT INTO public.stock_master (symbol, company_name, dhan_security_id, exchange, segment, type) VALUES
  ('NIFTY','Nifty 50','13','NSE','IDX_I','INDEX'),
  ('BANKNIFTY','Bank Nifty','25','NSE','IDX_I','INDEX'),
  ('NIFTYIT','Nifty IT','29','NSE','IDX_I','INDEX'),
  ('NIFTYAUTO','Nifty Auto','27','NSE','IDX_I','INDEX'),
  ('NIFTYPHARMA','Nifty Pharma','33','NSE','IDX_I','INDEX'),
  ('NIFTYFMCG','Nifty FMCG','28','NSE','IDX_I','INDEX'),
  ('NIFTY100','Nifty 100','24','NSE','IDX_I','INDEX'),
  ('SENSEX','BSE Sensex','51','BSE','IDX_I','INDEX')
ON CONFLICT (dhan_security_id, segment) DO NOTHING;
