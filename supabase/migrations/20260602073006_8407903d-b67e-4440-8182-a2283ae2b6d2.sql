ALTER TABLE public.queries
  ADD COLUMN IF NOT EXISTS sector_canonical TEXT,
  ADD COLUMN IF NOT EXISTS sector_macro_state TEXT;