ALTER TABLE public.queries
  ADD COLUMN IF NOT EXISTS entry_price numeric,
  ADD COLUMN IF NOT EXISTS qty numeric,
  ADD COLUMN IF NOT EXISTS position_state text,
  ADD COLUMN IF NOT EXISTS profit_loss_pct numeric,
  ADD COLUMN IF NOT EXISTS addendum_used text;