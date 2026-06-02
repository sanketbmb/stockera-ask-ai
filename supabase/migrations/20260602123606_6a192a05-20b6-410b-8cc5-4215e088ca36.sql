ALTER TABLE public.queries
  ADD COLUMN IF NOT EXISTS secondary_asks jsonb,
  ADD COLUMN IF NOT EXISTS secondary_answers jsonb,
  ADD COLUMN IF NOT EXISTS mixed_query_meta jsonb;