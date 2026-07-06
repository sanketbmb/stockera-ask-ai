
-- Stage 4G APPLY-1: backend-only unification (LOCKED)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Answers table extension
ALTER TABLE public.answers ALTER COLUMN query_id DROP NOT NULL;

ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS category text
    CHECK (category IN ('stock_specific','general')),
  ADD COLUMN IF NOT EXISTS source_kind text
    CHECK (source_kind IN ('upload','record','external_link')),
  ADD COLUMN IF NOT EXISTS external_provider text,
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS custom_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS stock_master_id uuid REFERENCES public.stock_master(id),
  ADD COLUMN IF NOT EXISTS paid_video_storage_path text;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.answers'::regclass AND contype='u'
      AND pg_get_constraintdef(oid) ILIKE '%(query_id, expert_id, answer_type)%'
  LOOP EXECUTE format('ALTER TABLE public.answers DROP CONSTRAINT %I', r.conname); END LOOP;
  FOR r IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename='answers'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(query_id, expert_id, answer_type)%'
  LOOP EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname); END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS answers_unique_query_answer
  ON public.answers(query_id, expert_id, answer_type) WHERE query_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_answers_general_published
  ON public.answers(created_at DESC) WHERE category='general' AND is_published=true;
CREATE INDEX IF NOT EXISTS idx_answers_stock_master_published
  ON public.answers(stock_master_id, created_at DESC) WHERE is_published=true;

-- 2. Queries table + backfill
ALTER TABLE public.queries
  ADD COLUMN IF NOT EXISTS stock_master_id uuid REFERENCES public.stock_master(id);
CREATE INDEX IF NOT EXISTS idx_queries_stock_master
  ON public.queries(stock_master_id) WHERE stock_master_id IS NOT NULL;

UPDATE public.queries q SET stock_master_id = sm.id
FROM (
  SELECT DISTINCT ON (upper(symbol)) id, upper(symbol) AS sym, exchange
  FROM public.stock_master WHERE exchange IN ('NSE','BSE')
  ORDER BY upper(symbol), CASE exchange WHEN 'NSE' THEN 1 WHEN 'BSE' THEN 2 ELSE 3 END
) sm
WHERE q.stock_master_id IS NULL
  AND upper(coalesce(q.stock_symbol, q.stock_name)) = sm.sym;

UPDATE public.answers a SET stock_master_id = q.stock_master_id
FROM public.queries q
WHERE a.query_id = q.id AND a.stock_master_id IS NULL AND q.stock_master_id IS NOT NULL;

-- 3. Invariant + YouTube ToS enforcement
CREATE OR REPLACE FUNCTION public.fn_answers_enforce_invariant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_q_stock uuid;
BEGIN
  IF NEW.category IS NULL THEN RETURN NEW; END IF;
  IF NEW.category = 'general' THEN
    IF NEW.stock_master_id IS NOT NULL OR NEW.query_id IS NOT NULL THEN
      RAISE EXCEPTION 'general_answer_invariant — general rows must have query_id=NULL and stock_master_id=NULL';
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
END; $$;

DROP TRIGGER IF EXISTS trg_answers_enforce_invariant ON public.answers;
CREATE TRIGGER trg_answers_enforce_invariant
  BEFORE INSERT OR UPDATE ON public.answers
  FOR EACH ROW EXECUTE FUNCTION public.fn_answers_enforce_invariant();

-- 4. unlock_video_answer: widen guard, signature unchanged
CREATE OR REPLACE FUNCTION public.unlock_video_answer(p_answer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := auth.uid();
  v_price integer; v_existing uuid; v_debit jsonb;
  v_entry_id uuid; v_new_ent uuid; v_idem text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('status','unauthenticated'); END IF;
  SELECT unlock_price_credits INTO v_price FROM public.answers
   WHERE id = p_answer_id AND answer_type = 'video' AND is_published = true
     AND coalesce(category, 'stock_specific') = 'stock_specific';
  IF v_price IS NULL THEN RETURN jsonb_build_object('status','not_found'); END IF;
  SELECT id INTO v_existing FROM public.video_entitlements
   WHERE user_id = v_user AND answer_id = p_answer_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_unlocked','entitlement_id',v_existing);
  END IF;
  v_idem := 'video_unlock:' || v_user::text || ':' || p_answer_id::text;
  v_debit := public.wallet_apply_debit(v_user, 'video_answer', v_price, NULL, v_idem);
  IF v_debit->>'status' NOT IN ('ok','idempotent_replay') THEN RETURN v_debit; END IF;
  v_entry_id := NULLIF(v_debit->>'entry_id','')::uuid;
  INSERT INTO public.video_entitlements (user_id, answer_id, credits_used, ledger_entry_id)
  VALUES (v_user, p_answer_id, v_price, v_entry_id)
  ON CONFLICT (user_id, answer_id) DO NOTHING RETURNING id INTO v_new_ent;
  IF v_new_ent IS NULL THEN
    SELECT id INTO v_new_ent FROM public.video_entitlements
     WHERE user_id = v_user AND answer_id = p_answer_id;
  END IF;
  RETURN jsonb_build_object('status','ok','entitlement_id',v_new_ent,
                            'credits_used',v_price,'new_balance',v_debit->'new_balance');
END; $$;

-- 5. notify_expert_answer: skip general + null query_id
CREATE OR REPLACE FUNCTION public.notify_expert_answer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _query_user UUID; _stock TEXT;
BEGIN
  IF NEW.category = 'general' OR NEW.query_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.is_published = true AND (OLD.is_published IS NULL OR OLD.is_published = false) THEN
    SELECT user_id, stock_name INTO _query_user, _stock FROM public.queries WHERE id = NEW.query_id;
    IF _query_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (_query_user,
              'Expert answered your ' || coalesce(_stock,'stock') || ' query',
              CASE WHEN NEW.answer_type='video' THEN 'Video answer is ready to watch.' ELSE 'Read the expert''s analysis.' END,
              'expert_answer', '/my-queries');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- 6. source_url normalization
CREATE OR REPLACE FUNCTION public.fn_normalize_source_url(p_url text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  s text; scheme text; host_and_path text; host text; path text; query text;
  parts text[]; kept text[]; kv text; key text;
BEGIN
  IF p_url IS NULL THEN RETURN NULL; END IF;
  s := btrim(p_url);
  IF s = '' THEN RETURN NULL; END IF;
  s := regexp_replace(s, '#.*$', '');
  IF s ~ '^[a-zA-Z][a-zA-Z0-9+.\-]*://' THEN
    scheme := lower(substring(s from '^([a-zA-Z][a-zA-Z0-9+.\-]*)://'));
    host_and_path := regexp_replace(s, '^[a-zA-Z][a-zA-Z0-9+.\-]*://', '');
  ELSE
    scheme := 'https';
    host_and_path := s;
  END IF;
  IF position('?' in host_and_path) > 0 THEN
    query := split_part(host_and_path, '?', 2);
    host_and_path := split_part(host_and_path, '?', 1);
  ELSE query := NULL; END IF;
  IF position('/' in host_and_path) > 0 THEN
    host := lower(split_part(host_and_path, '/', 1));
    path := substring(host_and_path from position('/' in host_and_path));
  ELSE host := lower(host_and_path); path := ''; END IF;
  IF length(path) > 1 THEN path := regexp_replace(path, '/+$', ''); END IF;
  IF query IS NOT NULL AND length(query) > 0 THEN
    parts := string_to_array(query, '&');
    kept := ARRAY[]::text[];
    FOREACH kv IN ARRAY parts LOOP
      key := lower(split_part(kv, '=', 1));
      IF key = '' OR key LIKE 'utm_%'
         OR key IN ('gclid','fbclid','ref','ref_src','igshid','si','mc_cid','mc_eid')
         OR key LIKE 'mc_%' OR key LIKE '_hs%' THEN CONTINUE; END IF;
      kept := kept || kv;
    END LOOP;
    IF array_length(kept,1) IS NULL THEN query := NULL;
    ELSE SELECT string_agg(x, '&' ORDER BY x) INTO query FROM unnest(kept) x; END IF;
  END IF;
  RETURN scheme || '://' || host || path || COALESCE('?' || query, '');
EXCEPTION WHEN OTHERS THEN RETURN lower(btrim(p_url));
END; $$;

-- 7. Curated Media table
CREATE TABLE IF NOT EXISTS public.curated_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  custom_thumbnail_url text,
  source_url text NOT NULL,
  source_url_norm text GENERATED ALWAYS AS (public.fn_normalize_source_url(source_url)) STORED,
  source_provider text NOT NULL CHECK (source_provider IN ('youtube','instagram','twitter','article','podcast','other')),
  embed_kind text NOT NULL CHECK (embed_kind IN ('embed_iframe','link_out_only')),
  tags text[] NOT NULL DEFAULT '{}',
  sector text,
  stock_master_id uuid REFERENCES public.stock_master(id),
  category text NOT NULL CHECK (category IN ('stock_specific','general')) DEFAULT 'general',
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  editorial_boost int NOT NULL DEFAULT 0,
  view_count int NOT NULL DEFAULT 0,
  save_count int NOT NULL DEFAULT 0,
  click_through_count int NOT NULL DEFAULT 0,
  posted_by uuid NOT NULL REFERENCES auth.users(id),
  og_scrape_meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.curated_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curated_items TO authenticated;
GRANT ALL ON public.curated_items TO service_role;
ALTER TABLE public.curated_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS curated_public_read ON public.curated_items;
CREATE POLICY curated_public_read ON public.curated_items
  FOR SELECT TO anon, authenticated USING (is_published = true);

DROP POLICY IF EXISTS curated_admin_manage ON public.curated_items;
CREATE POLICY curated_admin_manage ON public.curated_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS curated_editor_manage_own ON public.curated_items;
CREATE POLICY curated_editor_manage_own ON public.curated_items
  FOR ALL TO authenticated
  USING (posted_by = auth.uid() AND public.has_role(auth.uid(), 'analyst'))
  WITH CHECK (posted_by = auth.uid() AND public.has_role(auth.uid(), 'analyst'));

CREATE INDEX IF NOT EXISTS idx_curated_stock_published
  ON public.curated_items(stock_master_id, published_at DESC) WHERE is_published;
CREATE INDEX IF NOT EXISTS idx_curated_category_published
  ON public.curated_items(category, published_at DESC) WHERE is_published;
CREATE INDEX IF NOT EXISTS idx_curated_tags_gin
  ON public.curated_items USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_curated_search_trgm
  ON public.curated_items USING GIN ((title || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS uq_curated_norm_category
  ON public.curated_items (source_url_norm, category) WHERE is_published = true;

DROP TRIGGER IF EXISTS trg_curated_items_set_updated_at ON public.curated_items;
CREATE TRIGGER trg_curated_items_set_updated_at
  BEFORE UPDATE ON public.curated_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. Curated engagement events (anon-safe via viewer_key)
CREATE TABLE IF NOT EXISTS public.curated_view_events (
  id bigserial PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.curated_items(id) ON DELETE CASCADE,
  viewer_id uuid,
  viewer_key text,
  kind text NOT NULL CHECK (kind IN ('view','click_through')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.curated_view_events TO service_role;
ALTER TABLE public.curated_view_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cve_dedupe_auth
  ON public.curated_view_events (item_id, viewer_id, kind, created_at DESC)
  WHERE viewer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cve_dedupe_anon
  ON public.curated_view_events (item_id, viewer_key, kind, created_at DESC)
  WHERE viewer_id IS NULL AND viewer_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public._record_curated_engagement(
  p_id uuid, p_kind text, p_viewer_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_recent boolean := false;
BEGIN
  IF p_id IS NULL OR p_kind NOT IN ('view','click_through') THEN
    RETURN jsonb_build_object('status','skipped','reason','invalid_args');
  END IF;
  IF v_uid IS NOT NULL AND (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'analyst')) THEN
    RETURN jsonb_build_object('status','skipped','reason','staff');
  END IF;
  IF v_uid IS NULL AND (p_viewer_key IS NULL OR length(btrim(p_viewer_key)) < 8) THEN
    RETURN jsonb_build_object('status','skipped','reason','no_viewer_key');
  END IF;
  IF v_uid IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.curated_view_events
      WHERE item_id = p_id AND kind = p_kind AND viewer_id = v_uid
        AND created_at > now() - interval '10 minutes') INTO v_recent;
  ELSE
    SELECT EXISTS(SELECT 1 FROM public.curated_view_events
      WHERE item_id = p_id AND kind = p_kind AND viewer_id IS NULL
        AND viewer_key = p_viewer_key
        AND created_at > now() - interval '10 minutes') INTO v_recent;
  END IF;
  IF v_recent THEN RETURN jsonb_build_object('status','skipped','reason','throttled'); END IF;
  INSERT INTO public.curated_view_events (item_id, viewer_id, viewer_key, kind)
  VALUES (p_id, v_uid, CASE WHEN v_uid IS NULL THEN p_viewer_key ELSE NULL END, p_kind);
  IF p_kind = 'view' THEN
    UPDATE public.curated_items SET view_count = view_count + 1 WHERE id = p_id;
  ELSE
    UPDATE public.curated_items SET click_through_count = click_through_count + 1 WHERE id = p_id;
  END IF;
  RETURN jsonb_build_object('status','ok');
END; $$;

CREATE OR REPLACE FUNCTION public.record_curated_view(p_id uuid, p_viewer_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public._record_curated_engagement(p_id, 'view', p_viewer_key);
$$;

CREATE OR REPLACE FUNCTION public.record_curated_click_through(p_id uuid, p_viewer_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public._record_curated_engagement(p_id, 'click_through', p_viewer_key);
$$;

REVOKE ALL ON FUNCTION public._record_curated_engagement(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_curated_view(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_curated_click_through(uuid, text) TO anon, authenticated;

-- 9. Discovery / listing RPCs
CREATE OR REPLACE FUNCTION public.get_curated_item(p_id uuid)
RETURNS SETOF public.curated_items LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.curated_items WHERE id = p_id AND is_published = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_curated_item(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_public_general_video_answers(
  p_limit int DEFAULT 30, p_offset int DEFAULT 0
) RETURNS TABLE(
  answer_id uuid, video_title text, video_description text,
  question_addressed text, expert_id uuid, source_kind text,
  external_provider text, youtube_video_id text, custom_thumbnail_url text,
  video_duration_sec int, published_at timestamptz, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.video_title, a.video_description,
         coalesce(a.question_addressed_override, '') AS question_addressed,
         a.expert_id, a.source_kind, a.external_provider,
         a.youtube_video_id, a.custom_thumbnail_url,
         a.video_duration_sec, a.created_at, a.created_at
  FROM public.answers a
  WHERE a.category='general' AND a.is_published=true AND a.answer_type='video'
  ORDER BY a.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit,30), 100))
  OFFSET greatest(0, coalesce(p_offset,0));
$$;
GRANT EXECUTE ON FUNCTION public.list_public_general_video_answers(int, int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_curated_items_for_symbol(
  p_symbol text, p_limit int DEFAULT 30, p_offset int DEFAULT 0
) RETURNS SETOF public.curated_items LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.* FROM public.curated_items c
  JOIN public.stock_master sm ON sm.id = c.stock_master_id
  WHERE c.is_published=true AND upper(sm.symbol)=upper(coalesce(p_symbol,''))
  ORDER BY c.published_at DESC NULLS LAST, c.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit,30), 100))
  OFFSET greatest(0, coalesce(p_offset,0));
$$;
GRANT EXECUTE ON FUNCTION public.list_curated_items_for_symbol(text, int, int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_discover_feed(
  p_kind_filter text[] DEFAULT NULL, p_symbol text DEFAULT NULL,
  p_limit int DEFAULT 30, p_offset int DEFAULT 0
) RETURNS TABLE(
  item_id text, content_type text, title text, description text,
  thumbnail_url text, stock_master_id uuid, published_at timestamptz, score real
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ra AS (
    SELECT ('ra_video:' || a.id::text) AS item_id, 'ra_video'::text AS content_type,
           coalesce(a.video_title,'Analyst video') AS title,
           a.video_description AS description, a.custom_thumbnail_url AS thumbnail_url,
           NULL::uuid AS stock_master_id, a.created_at AS published_at
    FROM public.answers a
    WHERE a.category='general' AND a.is_published=true AND a.answer_type='video'
  ),
  cur AS (
    SELECT ('curated:' || c.id::text), 'curated'::text,
           c.title, c.description, c.custom_thumbnail_url,
           c.stock_master_id, coalesce(c.published_at, c.created_at)
    FROM public.curated_items c WHERE c.is_published=true
  ),
  ai AS (
    SELECT ('ai_report:' || r.id::text), 'ai_report'::text,
           coalesce(r.stock_symbol, 'AI report') AS title,
           NULL::text AS description, NULL::text AS thumbnail_url,
           NULL::uuid AS stock_master_id, r.created_at
    FROM public.ai_reports r WHERE r.created_at > now() - interval '90 days'
  ),
  unioned AS (SELECT * FROM ra UNION ALL SELECT * FROM cur UNION ALL SELECT * FROM ai),
  filtered AS (
    SELECT * FROM unioned u
    WHERE (p_kind_filter IS NULL OR u.content_type = ANY(p_kind_filter))
      AND (p_symbol IS NULL OR EXISTS (
        SELECT 1 FROM public.stock_master sm
        WHERE sm.id = u.stock_master_id AND upper(sm.symbol) = upper(p_symbol)
      ))
  )
  SELECT f.item_id, f.content_type, f.title, f.description, f.thumbnail_url,
         f.stock_master_id, f.published_at,
         (
           exp(-extract(epoch FROM (now() - f.published_at)) / 86400.0 / 4.0) * 0.5
           + CASE f.content_type WHEN 'ra_video' THEN 1.0 WHEN 'curated' THEN 0.85
             WHEN 'ai_report' THEN 0.7 ELSE 0.5 END * 0.15
         )::real AS score
  FROM filtered f
  ORDER BY score DESC NULLS LAST, f.published_at DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit,30), 100))
  OFFSET greatest(0, coalesce(p_offset,0));
$$;
GRANT EXECUTE ON FUNCTION public.list_discover_feed(text[], text, int, int) TO anon, authenticated;

-- 10. Denormalization integrity verification
DO $$
DECLARE bad_ss int; bad_gen int;
BEGIN
  SELECT count(*) INTO bad_ss FROM public.answers a
   LEFT JOIN public.queries q ON q.id = a.query_id
   WHERE a.category='stock_specific'
     AND (a.stock_master_id IS NULL
          OR (a.query_id IS NOT NULL AND q.stock_master_id IS NOT NULL
              AND a.stock_master_id IS DISTINCT FROM q.stock_master_id));
  SELECT count(*) INTO bad_gen FROM public.answers
   WHERE category='general' AND (stock_master_id IS NOT NULL OR query_id IS NOT NULL);
  IF bad_ss > 0 OR bad_gen > 0 THEN
    RAISE EXCEPTION 'stock_master_id invariant broken: bad_ss=%, bad_gen=%', bad_ss, bad_gen;
  END IF;
END $$;
