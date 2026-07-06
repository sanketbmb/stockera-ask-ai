
-- 4F.3 APPLY-1: additive video-answer authoring fields + question_addressed projection

ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS question_addressed_override text,
  ADD COLUMN IF NOT EXISTS video_title text,
  ADD COLUMN IF NOT EXISTS video_description text;

-- Partial unique index: one YouTube ID per published-or-draft video answer row.
CREATE UNIQUE INDEX IF NOT EXISTS answers_youtube_video_id_unique
  ON public.answers (youtube_video_id)
  WHERE youtube_video_id IS NOT NULL AND answer_type = 'video';

-- Rewrite get_video_answer to project question_addressed on both branches.
CREATE OR REPLACE FUNCTION public.get_video_answer(p_answer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user     uuid := auth.uid();
  v_row      record;
  v_unlocked boolean;
  v_analyst  jsonb;
  v_question text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('status','unauthenticated');
  END IF;

  SELECT a.id, a.query_id, a.expert_id, a.answer_type, a.is_published,
         a.youtube_video_id, a.video_duration_sec, a.unlock_price_credits,
         a.created_at, a.verdict,
         a.question_addressed_override, a.video_title, a.video_description,
         q.stock_symbol, q.stock_name, q.query_text
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

  v_question := COALESCE(v_row.question_addressed_override, v_row.query_text);

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
      'video_title', v_row.video_title,
      'video_description', v_row.video_description,
      'question_addressed', v_question,
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
    'video_title', v_row.video_title,
    'video_description', v_row.video_description,
    'question_addressed', v_question,
    'unlock_price_credits', v_row.unlock_price_credits,
    'video_duration_sec', v_row.video_duration_sec,
    'poster_thumb', 'https://i.ytimg.com/vi/' || v_row.youtube_video_id || '/hqdefault.jpg',
    'published_at', v_row.created_at
  );
END;
$function$;

-- list_public_video_answers_for_symbol: signature change requires DROP + CREATE.
DROP FUNCTION IF EXISTS public.list_public_video_answers_for_symbol(text);

CREATE FUNCTION public.list_public_video_answers_for_symbol(p_symbol text)
RETURNS TABLE(
  answer_id uuid,
  query_id uuid,
  symbol text,
  stock_name text,
  verdict text,
  unlock_price_credits integer,
  video_duration_sec integer,
  poster_thumb text,
  analyst_id uuid,
  analyst_name text,
  analyst_sebi_reg_number text,
  video_title text,
  video_description text,
  question_addressed text,
  published_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
         a.video_title,
         a.video_description,
         COALESCE(a.question_addressed_override, q.query_text) AS question_addressed,
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
$function$;

GRANT EXECUTE ON FUNCTION public.list_public_video_answers_for_symbol(text) TO anon, authenticated, service_role;
