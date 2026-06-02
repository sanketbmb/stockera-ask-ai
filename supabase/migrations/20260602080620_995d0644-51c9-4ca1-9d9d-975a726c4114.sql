ALTER TABLE public.queries
  ADD COLUMN IF NOT EXISTS concept_canonical TEXT,
  ADD COLUMN IF NOT EXISTS educational_difficulty TEXT;