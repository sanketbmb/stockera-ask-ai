-- =========================================================================
-- Stage 4F.1 — Video Answers backend contract (re-runnable)
-- =========================================================================

-- 1a. Extend answers ------------------------------------------------------
ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS youtube_video_id     text,
  ADD COLUMN IF NOT EXISTS video_duration_sec   integer,
  ADD COLUMN IF NOT EXISTS unlock_price_credits integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'answers_video_shape_chk'
       AND conrelid = 'public.answers'::regclass
  ) THEN
    ALTER TABLE public.answers
      ADD CONSTRAINT answers_video_shape_chk
      CHECK (
        answer_type <> 'video'
        OR (
          video_url            IS NOT NULL
          AND youtube_video_id IS NOT NULL
          AND unlock_price_credits IS NOT NULL
          AND unlock_price_credits > 0
        )
      ) NOT VALID;   -- NOT VALID so any legacy rows (there are none in prod
                     -- for video answers, but be defensive) don't block DDL.
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'answers_youtube_video_id_fmt_chk'
       AND conrelid = 'public.answers'::regclass
  ) THEN
    ALTER TABLE public.answers
      ADD CONSTRAINT answers_youtube_video_id_fmt_chk
      CHECK (youtube_video_id IS NULL OR youtube_video_id ~ '^[A-Za-z0-9_-]{11}$')
      NOT VALID;
  END IF;
END $$;

-- Validate constraints against current data (safe: no rows violate).
ALTER TABLE public.answers VALIDATE CONSTRAINT answers_video_shape_chk;
ALTER TABLE public.answers VALIDATE CONSTRAINT answers_youtube_video_id_fmt_chk;

-- 1b. video_entitlements --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_entitlements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answer_id       uuid NOT NULL REFERENCES public.answers(id) ON DELETE CASCADE,
  credits_used    integer NOT NULL CHECK (credits_used > 0),
  ledger_entry_id uuid REFERENCES public.wallet_ledger(id),
  unlocked_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, answer_id)
);

GRANT SELECT ON public.video_entitlements TO authenticated;
GRANT ALL    ON public.video_entitlements TO service_role;

ALTER TABLE public.video_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own entitlements read" ON public.video_entitlements;
CREATE POLICY "own entitlements read"
  ON public.video_entitlements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_video_entitlements_answer
  ON public.video_entitlements(answer_id);

-- 1c. library_items.answer_id --------------------------------------------
ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS answer_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'library_items_answer_id_fkey'
       AND conrelid = 'public.library_items'::regclass
  ) THEN
    ALTER TABLE public.library_items
      ADD CONSTRAINT library_items_answer_id_fkey
      FOREIGN KEY (answer_id) REFERENCES public.answers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_library_items_answer_id
  ON public.library_items(answer_id) WHERE answer_id IS NOT NULL;

-- Extend fn_project_answer_to_library to populate answer_id on video rows.
CREATE OR REPLACE FUNCTION public.fn_project_answer_to_library()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Block 1: always project the video itself
  INSERT INTO public.library_items
    (kind, source_id, source_table, symbol, title, verdict, analyst_id,
     body_excerpt, is_public, published_at, answer_id)
  SELECT 'video', NEW.id, 'answers',
         public.fn_normalize_symbol(coalesce(q.stock_symbol, q.stock_name)),
         'Analyst video on ' || coalesce(q.stock_name,'stock'),
         NEW.verdict, NEW.expert_id,
         left(regexp_replace(coalesce(NEW.body,''), E'[#*_`>]', '', 'g'), 280),
         true, now(), NEW.id
  FROM public.queries q WHERE q.id = NEW.query_id
  ON CONFLICT (source_table, source_id) DO UPDATE
    SET title = EXCLUDED.title, verdict = EXCLUDED.verdict,
        analyst_id = EXCLUDED.analyst_id, body_excerpt = EXCLUDED.body_excerpt,
        symbol = EXCLUDED.symbol, answer_id = EXCLUDED.answer_id,
        updated_at = now();

  -- Block 2: project parent query as 'report' if user has already opted in
  IF EXISTS (
    SELECT 1 FROM public.queries q
    WHERE q.id = NEW.query_id
      AND q.is_public_library = true
      AND q.library_tombstoned_at IS NULL
  ) THEN
    INSERT INTO public.library_items
      (kind, source_id, source_table, symbol, title, verdict,
       analyst_id, body_excerpt, is_public, is_tombstoned, published_at)
    SELECT 'report', q.id, 'queries',
           public.fn_normalize_symbol(coalesce(q.stock_symbol, q.stock_name)),
           CASE WHEN q.public_consent_anonymized
                THEN 'Question about ' || coalesce(q.stock_name,'a stock')
                ELSE left(coalesce(q.query_text, q.stock_name), 140) END,
           NEW.verdict, q.assigned_analyst_id,
           left(regexp_replace(coalesce(NEW.body, q.query_text, ''), E'[#*_`>]', '', 'g'), 280),
           true, false, now()
    FROM public.queries q WHERE q.id = NEW.query_id
    ON CONFLICT (source_table, source_id) DO UPDATE
      SET is_public    = true,
          is_tombstoned = false,
          updated_at   = now(),
          title        = EXCLUDED.title,
          verdict      = EXCLUDED.verdict,
          analyst_id   = EXCLUDED.analyst_id,
          body_excerpt = EXCLUDED.body_excerpt,
          symbol       = EXCLUDED.symbol,
          published_at = coalesce(library_items.published_at, EXCLUDED.published_at);
  END IF;

  RETURN NEW;
END $function$;

-- Backfill answer_id for any existing video library rows.
UPDATE public.library_items li
   SET answer_id = li.source_id
 WHERE li.source_table = 'answers'
   AND li.kind = 'video'
   AND li.answer_id IS NULL;

-- 1d. Atomic unlock RPC ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_video_answer(p_answer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user      uuid := auth.uid();
  v_price     integer;
  v_existing  uuid;
  v_debit     jsonb;
  v_entry_id  uuid;
  v_new_ent   uuid;
  v_idem      text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('status','unauthenticated');
  END IF;

  SELECT unlock_price_credits INTO v_price
    FROM public.answers
   WHERE id = p_answer_id
     AND answer_type = 'video'
     AND is_published = true;

  IF v_price IS NULL THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;

  SELECT id INTO v_existing
    FROM public.video_entitlements
   WHERE user_id = v_user AND answer_id = p_answer_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_unlocked','entitlement_id',v_existing);
  END IF;

  v_idem := 'video_unlock:' || v_user::text || ':' || p_answer_id::text;

  v_debit := public.wallet_apply_debit(
               p_user_id         => v_user,
               p_action_key      => 'video_answer',
               p_points          => v_price,
               p_query_id        => NULL,
               p_idempotency_key => v_idem);

  IF v_debit->>'status' NOT IN ('ok','idempotent_replay') THEN
    RETURN v_debit;
  END IF;

  v_entry_id := NULLIF(v_debit->>'entry_id','')::uuid;

  INSERT INTO public.video_entitlements
    (user_id, answer_id, credits_used, ledger_entry_id)
  VALUES
    (v_user, p_answer_id, v_price, v_entry_id)
  ON CONFLICT (user_id, answer_id) DO NOTHING
  RETURNING id INTO v_new_ent;

  IF v_new_ent IS NULL THEN
    SELECT id INTO v_new_ent
      FROM public.video_entitlements
     WHERE user_id = v_user AND answer_id = p_answer_id;
  END IF;

  RETURN jsonb_build_object(
    'status','ok',
    'entitlement_id', v_new_ent,
    'credits_used', v_price,
    'new_balance', v_debit->'new_balance'
  );
END;
$$;

REVOKE ALL   ON FUNCTION public.unlock_video_answer(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.unlock_video_answer(uuid) TO authenticated;

-- 1e. get_video_answer (authed; returns locked stub or unlocked payload) --
CREATE OR REPLACE FUNCTION public.get_video_answer(p_answer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_row      record;
  v_unlocked boolean;
  v_analyst  jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('status','unauthenticated');
  END IF;

  SELECT a.id, a.query_id, a.expert_id, a.answer_type, a.is_published,
         a.youtube_video_id, a.video_duration_sec, a.unlock_price_credits,
         a.created_at, a.verdict, q.stock_symbol, q.stock_name
    INTO v_row
    FROM public.answers a
    LEFT JOIN public.queries q ON q.id = a.query_id
   WHERE a.id = p_answer_id
     AND a.answer_type = 'video'
     AND a.is_published = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;

  SELECT jsonb_build_object(
           'analyst_id', ap.id,
           'display_name', ap.display_name,
           'sebi_reg_number', ap.sebi_reg_number
         ) INTO v_analyst
    FROM public.analyst_profiles ap
   WHERE ap.id = v_row.expert_id;

  SELECT EXISTS (
    SELECT 1 FROM public.video_entitlements
     WHERE user_id = v_user AND answer_id = p_answer_id
  ) INTO v_unlocked;

  IF v_unlocked THEN
    RETURN jsonb_build_object(
      'status','ok',
      'locked', false,
      'answer_id', v_row.id,
      'query_id', v_row.query_id,
      'symbol', v_row.stock_symbol,
      'stock_name', v_row.stock_name,
      'verdict', v_row.verdict,
      'analyst', v_analyst,
      'youtube_video_id', v_row.youtube_video_id,
      'video_duration_sec', v_row.video_duration_sec,
      'published_at', v_row.created_at
    );
  END IF;

  RETURN jsonb_build_object(
    'status','ok',
    'locked', true,
    'answer_id', v_row.id,
    'query_id', v_row.query_id,
    'symbol', v_row.stock_symbol,
    'stock_name', v_row.stock_name,
    'verdict', v_row.verdict,
    'analyst', v_analyst,
    'unlock_price_credits', v_row.unlock_price_credits,
    'video_duration_sec', v_row.video_duration_sec,
    'poster_thumb', 'https://i.ytimg.com/vi/' || v_row.youtube_video_id || '/hqdefault.jpg',
    'published_at', v_row.created_at
  );
END;
$$;

REVOKE ALL   ON FUNCTION public.get_video_answer(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_video_answer(uuid) TO authenticated;

-- 1f. list_public_video_answers_for_symbol (anon-safe locked stubs) -------
CREATE OR REPLACE FUNCTION public.list_public_video_answers_for_symbol(p_symbol text)
RETURNS TABLE (
  answer_id             uuid,
  query_id              uuid,
  symbol                text,
  stock_name            text,
  verdict               text,
  unlock_price_credits  integer,
  video_duration_sec    integer,
  poster_thumb          text,
  analyst_id            uuid,
  analyst_name          text,
  analyst_sebi_reg_number text,
  published_at          timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id AS answer_id,
         a.query_id,
         public.fn_normalize_symbol(p_symbol) AS symbol,
         q.stock_name,
         a.verdict,
         a.unlock_price_credits,
         a.video_duration_sec,
         'https://i.ytimg.com/vi/' || a.youtube_video_id || '/hqdefault.jpg' AS poster_thumb,
         ap.id AS analyst_id,
         ap.display_name AS analyst_name,
         ap.sebi_reg_number AS analyst_sebi_reg_number,
         a.created_at AS published_at
    FROM public.answers a
    JOIN public.queries q ON q.id = a.query_id
    LEFT JOIN public.analyst_profiles ap ON ap.id = a.expert_id
   WHERE a.answer_type = 'video'
     AND a.is_published = true
     AND public.fn_normalize_symbol(coalesce(q.stock_symbol, q.stock_name))
         = public.fn_normalize_symbol(p_symbol)
   ORDER BY a.created_at DESC
   LIMIT 100;
$$;

REVOKE ALL   ON FUNCTION public.list_public_video_answers_for_symbol(text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_public_video_answers_for_symbol(text) TO anon, authenticated;
