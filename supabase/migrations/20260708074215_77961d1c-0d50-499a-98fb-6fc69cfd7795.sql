-- Relax general_answer_invariant: general can now carry stock_master_id
-- (product intent — general videos may be tagged to a stock). query_id must
-- still be NULL for general rows. Stock-specific invariants unchanged.
CREATE OR REPLACE FUNCTION public.fn_answers_enforce_invariant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_q_stock uuid;
BEGIN
  IF NEW.category IS NULL THEN RETURN NEW; END IF;
  IF NEW.category = 'general' THEN
    IF NEW.query_id IS NOT NULL THEN
      RAISE EXCEPTION 'general_answer_invariant — general rows must have query_id=NULL';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.category = 'stock_specific' THEN
    IF NEW.stock_master_id IS NULL THEN
      RAISE EXCEPTION 'stock_specific_invariant — stock_master_id required';
    END IF;
    IF NEW.query_id IS NOT NULL THEN
      SELECT stock_master_id INTO v_q_stock FROM public.queries WHERE id = NEW.query_id;
      IF v_q_stock IS NOT NULL AND v_q_stock <> NEW.stock_master_id THEN
        RAISE EXCEPTION 'stock_master_id_mismatch — answers.stock_master_id must equal queries.stock_master_id';
      END IF;
    END IF;
    IF NEW.source_kind = 'external_link'
       AND NEW.external_url IS NOT NULL
       AND NEW.external_url ~* '(^|//)(www\.)?(youtube\.com|youtu\.be)/' THEN
      RAISE EXCEPTION 'youtube_paywall_forbidden — YouTube ToS forbids embedding YouTube content behind a paywall';
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

-- Backfill for the M&M general video (idempotent).
DO $$
DECLARE
  v_answer_id uuid := '90683d05-715c-4f4e-8acb-ce4f0aae102e';
  v_stock_id  uuid;
  v_symbol    text;
  v_exchange  text;
  v_title     text;
  v_desc      text;
  v_expert    uuid;
BEGIN
  SELECT id, symbol, exchange
    INTO v_stock_id, v_symbol, v_exchange
  FROM public.stock_master
  WHERE symbol = 'M&M' AND exchange = 'NSE'
  ORDER BY id
  LIMIT 1;

  IF v_stock_id IS NOT NULL THEN
    UPDATE public.answers
       SET stock_master_id = v_stock_id
     WHERE id = v_answer_id
       AND stock_master_id IS DISTINCT FROM v_stock_id;
  END IF;

  SELECT video_title, video_description, expert_id
    INTO v_title, v_desc, v_expert
  FROM public.answers
  WHERE id = v_answer_id;

  IF v_title IS NOT NULL THEN
    DELETE FROM public.library_items
     WHERE source_table = 'answers' AND source_id = v_answer_id;

    INSERT INTO public.library_items (
      kind, source_id, source_table, answer_id,
      symbol, symbol_exchange, title, verdict,
      analyst_id, body_excerpt,
      is_public, is_tombstoned, published_at
    ) VALUES (
      'video', v_answer_id, 'answers', v_answer_id,
      v_symbol, v_exchange, v_title, NULL,
      v_expert, left(coalesce(v_desc, ''), 300),
      true, false, now()
    );
  END IF;
END $$;