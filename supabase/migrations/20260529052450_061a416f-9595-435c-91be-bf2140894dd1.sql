INSERT INTO public.stock_master (symbol, company_name, dhan_security_id, exchange, segment, type) VALUES
  ('NIFTY',       'Nifty 50',     '13', 'NSE', 'IDX_I', 'INDEX'),
  ('BANKNIFTY',   'Nifty Bank',   '25', 'NSE', 'IDX_I', 'INDEX'),
  ('NIFTYIT',     'Nifty IT',     '27', 'NSE', 'IDX_I', 'INDEX'),
  ('NIFTYAUTO',   'Nifty Auto',   '35', 'NSE', 'IDX_I', 'INDEX'),
  ('NIFTYPHARMA', 'Nifty Pharma', '31', 'NSE', 'IDX_I', 'INDEX'),
  ('NIFTYFMCG',   'Nifty FMCG',   '23', 'NSE', 'IDX_I', 'INDEX'),
  ('NIFTY100',    'Nifty 100',    '17', 'NSE', 'IDX_I', 'INDEX'),
  ('SENSEX',      'BSE Sensex',   '51', 'BSE', 'IDX_I', 'INDEX')
ON CONFLICT (dhan_security_id, segment) DO UPDATE SET
  symbol = EXCLUDED.symbol,
  company_name = EXCLUDED.company_name,
  exchange = EXCLUDED.exchange,
  type = EXCLUDED.type,
  updated_at = now();