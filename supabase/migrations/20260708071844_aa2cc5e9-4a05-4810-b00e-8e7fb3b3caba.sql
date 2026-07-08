-- Relax legacy CHECK constraints on public.answers so the unified RA video
-- composer can publish General (free) and non-YouTube/upload/record videos.
-- Preserves stock_specific paid+stock invariant. Rerunnable.

ALTER TABLE public.answers DROP CONSTRAINT IF EXISTS answers_video_shape_chk;
ALTER TABLE public.answers DROP CONSTRAINT IF EXISTS answers_source_kind_check;

ALTER TABLE public.answers
  ADD CONSTRAINT answers_source_kind_check CHECK (
    source_kind IS NULL
    OR source_kind = ANY (ARRAY['upload','record','external','external_link'])
  );

ALTER TABLE public.answers
  ADD CONSTRAINT answers_video_shape_chk CHECK (
    answer_type <> 'video'
    OR (
      -- Must expose at least one playable source
      (
        paid_video_storage_path IS NOT NULL
        OR external_url IS NOT NULL
        OR youtube_video_id IS NOT NULL
        OR video_url IS NOT NULL
      )
      -- Category-aware price + stock rules. NULL category = legacy rows, untouched.
      AND (
        category IS NULL
        OR (
          category = 'general'
          AND (unlock_price_credits IS NULL OR unlock_price_credits = 0)
        )
        OR (
          category = 'stock_specific'
          AND unlock_price_credits IS NOT NULL
          AND unlock_price_credits > 0
          AND stock_master_id IS NOT NULL
        )
      )
    )
  );