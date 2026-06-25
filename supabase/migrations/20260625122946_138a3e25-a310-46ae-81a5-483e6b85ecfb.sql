
-- ============================================================
-- L1 — Public Research Library: Backend Foundation
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------
-- P-6: symbol_aliases (created first; fn_normalize_symbol reads it)
-- ------------------------------------------------------------
CREATE TABLE public.symbol_aliases (
  alias             text PRIMARY KEY,
  canonical_symbol  text NOT NULL,
  notes             text
);
GRANT SELECT ON public.symbol_aliases TO anon, authenticated;
GRANT ALL    ON public.symbol_aliases TO service_role;
ALTER TABLE public.symbol_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY aliases_select_all ON public.symbol_aliases FOR SELECT USING (true);

INSERT INTO public.symbol_aliases (alias, canonical_symbol) VALUES
  ('hdfc bank','HDFCBANK'),('bajaj fin','BAJFINANCE'),('sbi','SBIN'),
  ('reliance','RELIANCE'),('tcs','TCS'),('tata motors','TATAMOTORS'),
  ('m&m','M&M'),('l&t','LT'),('icici bank','ICICIBANK'),
  ('kotak bank','KOTAKBANK'),('axis bank','AXISBANK'),('wipro','WIPRO'),
  ('infy','INFY'),('infosys','INFY'),('adani green','ADANIGREEN'),
  ('adani ports','ADANIPORTS'),('suzlon','SUZLON'),('inox wind','INOXWIND'),
  ('tata power','TATAPOWER'),('ntpc','NTPC'),('ongc','ONGC'),
  ('bharti airtel','BHARTIARTL'),('airtel','BHARTIARTL'),('jio fin','JIOFIN'),
  ('maruti','MARUTI'),('bajaj auto','BAJAJ-AUTO'),('hero moto','HEROMOTOCO'),
  ('eicher','EICHERMOT'),('asian paints','ASIANPAINT'),('pidilite','PIDILITIND');

-- ------------------------------------------------------------
-- P-10: fn_normalize_symbol (STABLE — reads symbol_aliases)
-- ------------------------------------------------------------
CREATE FUNCTION public.fn_normalize_symbol(raw text) RETURNS text
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE s text; alias_hit text;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  s := lower(trim(raw));
  s := regexp_replace(s, '[₹$]', '', 'g');
  s := regexp_replace(s, '\s+\d+(\.\d+)?$', '', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  SELECT canonical_symbol INTO alias_hit FROM public.symbol_aliases WHERE alias = s;
  IF alias_hit IS NOT NULL THEN RETURN alias_hit; END IF;
  s := upper(s);
  s := regexp_replace(s, '-(BE|BZ|SM|T0|BL)$', '', 'g');
  IF s ~ '^[A-Z0-9&\-]{1,20}$' THEN RETURN s; END IF;
  RETURN NULL;
END $$;

-- ------------------------------------------------------------
-- P-1: library_items
-- ------------------------------------------------------------
CREATE TABLE public.library_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('report','video','community_query','analyst')),
  source_id       uuid NOT NULL,
  source_table    text NOT NULL CHECK (source_table IN ('queries','answers','community_questions','analyst_profiles')),
  symbol          text,
  symbol_exchange text CHECK (symbol_exchange IN ('NSE','BSE') OR symbol_exchange IS NULL),
  title           text NOT NULL,
  verdict         text CHECK (verdict IN ('BUY','HOLD','AVERAGE','EXIT','PARTIAL_EXIT','WAIT') OR verdict IS NULL),
  sector          text,
  analyst_id      uuid REFERENCES public.analyst_profiles(id) ON DELETE SET NULL,
  body_excerpt    text,
  view_count      int NOT NULL DEFAULT 0,
  is_public       bool NOT NULL DEFAULT false,
  is_tombstoned   bool NOT NULL DEFAULT false,
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  search_tsv      tsvector GENERATED ALWAYS AS (
                    to_tsvector('simple',
                      coalesce(symbol,'')||' '||coalesce(title,'')||' '||
                      coalesce(verdict,'')||' '||coalesce(sector,'')||' '||
                      coalesce(body_excerpt,''))
                  ) STORED,
  trgm_blob       text GENERATED ALWAYS AS (
                    lower(coalesce(symbol,'')||' '||coalesce(title,'')||' '||coalesce(verdict,''))
                  ) STORED
);

GRANT SELECT ON public.library_items TO anon, authenticated;
GRANT ALL    ON public.library_items TO service_role;

-- P-2: indexes
CREATE UNIQUE INDEX library_items_source_uk
  ON public.library_items (source_table, source_id);
CREATE INDEX library_items_tsv_gin
  ON public.library_items USING gin (search_tsv);
CREATE INDEX library_items_trgm_gin
  ON public.library_items USING gin (trgm_blob gin_trgm_ops);
CREATE INDEX library_items_symbol_pub
  ON public.library_items (symbol) WHERE is_public = true;
CREATE INDEX library_items_kind_pub_pubat
  ON public.library_items (kind, published_at DESC) WHERE is_public = true;
CREATE INDEX library_items_analyst_pub
  ON public.library_items (analyst_id) WHERE is_public = true;

-- P-3: RLS
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.library_items FROM anon, authenticated;

-- Non-'queries' kinds (video/analyst/community_query) are visible
-- only when is_public=true. CASE returns NULL → auth.uid()=NULL is
-- NULL → RLS denies. This is intentional. Do NOT 'fix' this branch.
CREATE POLICY library_items_select_public_or_owner
  ON public.library_items FOR SELECT
  USING (
    is_public = true
    OR auth.uid() = (
      CASE source_table
        WHEN 'queries' THEN (SELECT user_id FROM public.queries WHERE id = source_id)
        ELSE NULL
      END
    )
  );

-- ------------------------------------------------------------
-- P-4: library_item_views
-- ------------------------------------------------------------
CREATE TABLE public.library_item_views (
  id              bigserial PRIMARY KEY,
  item_id         uuid NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  viewer_user_id  uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_item_views_item_time ON public.library_item_views (item_id, created_at);

GRANT INSERT ON public.library_item_views TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.library_item_views_id_seq TO anon, authenticated;
GRANT ALL ON public.library_item_views TO service_role;

ALTER TABLE public.library_item_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY views_insert_any   ON public.library_item_views FOR INSERT WITH CHECK (true);
CREATE POLICY views_select_admin ON public.library_item_views FOR SELECT USING (has_role(auth.uid(),'admin'));

-- ------------------------------------------------------------
-- P-5: library_search_logs
-- ------------------------------------------------------------
CREATE TABLE public.library_search_logs (
  id                bigserial PRIMARY KEY,
  query_text        text NOT NULL,
  normalized_query  text,
  result_count      int,
  clicked_item_id   uuid REFERENCES public.library_items(id) ON DELETE SET NULL,
  user_id           uuid,
  session_id        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_search_logs_created ON public.library_search_logs (created_at);
CREATE INDEX library_search_logs_normq   ON public.library_search_logs (normalized_query);

GRANT INSERT ON public.library_search_logs TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.library_search_logs_id_seq TO anon, authenticated;
GRANT ALL ON public.library_search_logs TO service_role;

ALTER TABLE public.library_search_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY srch_insert_any   ON public.library_search_logs FOR INSERT WITH CHECK (true);
CREATE POLICY srch_select_admin ON public.library_search_logs FOR SELECT USING (has_role(auth.uid(),'admin'));

-- ------------------------------------------------------------
-- P-7: consent columns on queries
-- ------------------------------------------------------------
ALTER TABLE public.queries
  ADD COLUMN is_public_library         bool NOT NULL DEFAULT false,
  ADD COLUMN public_consent_at         timestamptz,
  ADD COLUMN public_consent_anonymized bool NOT NULL DEFAULT false,
  ADD COLUMN library_tombstoned_at     timestamptz;

-- ------------------------------------------------------------
-- P-7b: library_consent_events (SEBI audit log) — REFINEMENT C
-- ------------------------------------------------------------
CREATE TABLE public.library_consent_events (
  id          bigserial PRIMARY KEY,
  query_id    uuid REFERENCES public.queries(id) ON DELETE SET NULL,
  user_id     uuid NOT NULL,
  event_type  text NOT NULL CHECK (event_type IN
                ('opt_in','opt_out','opt_in_anonymized','opt_in_deanonymized')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lce_query_time ON public.library_consent_events (query_id, created_at);
CREATE INDEX lce_user_time  ON public.library_consent_events (user_id,  created_at);

GRANT ALL ON public.library_consent_events TO service_role;
ALTER TABLE public.library_consent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY lce_select_admin ON public.library_consent_events FOR SELECT
  USING (has_role(auth.uid(),'admin'));
-- No INSERT policy; only SECURITY DEFINER fn_log_consent_event writes.

-- ============================================================
-- P-8: trigger functions
-- ============================================================

-- fn_project_query_to_library: AFTER UPDATE on queries (consent → true)
CREATE FUNCTION public.fn_project_query_to_library() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.answers a
    WHERE a.query_id = NEW.id AND a.is_published = true AND a.video_url IS NOT NULL
  ) THEN
    RETURN NEW;  -- opt-in-then-answer: handled later by fn_project_answer_to_library
  END IF;

  INSERT INTO public.library_items
    (kind, source_id, source_table, symbol, title, verdict, analyst_id,
     body_excerpt, is_public, is_tombstoned, published_at)
  SELECT 'report', NEW.id, 'queries',
         public.fn_normalize_symbol(coalesce(NEW.stock_symbol, NEW.stock_name)),
         CASE WHEN NEW.public_consent_anonymized
              THEN 'Question about ' || coalesce(NEW.stock_name,'a stock')
              ELSE left(coalesce(NEW.query_text, NEW.stock_name), 140) END,
         a.verdict, NEW.assigned_analyst_id,
         left(regexp_replace(coalesce(a.body, NEW.query_text, ''), E'[#*_`>]', '', 'g'), 280),
         true, false, now()
  FROM public.answers a
  WHERE a.query_id = NEW.id AND a.is_published = true AND a.video_url IS NOT NULL
  ORDER BY a.created_at DESC LIMIT 1
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

  RETURN NEW;
END $$;

CREATE TRIGGER trg_project_query_to_library
  AFTER UPDATE ON public.queries
  FOR EACH ROW
  WHEN (OLD.is_public_library IS DISTINCT FROM NEW.is_public_library AND NEW.is_public_library = true)
  EXECUTE FUNCTION public.fn_project_query_to_library();

-- fn_tombstone_query_from_library: AFTER UPDATE on queries (consent → false)
CREATE FUNCTION public.fn_tombstone_query_from_library() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.library_items
  SET is_tombstoned = true,
      is_public     = true,
      title         = '[Question removed at user request]',
      body_excerpt  = NULL,
      verdict       = NULL,
      analyst_id    = NULL,
      updated_at    = now()
  WHERE source_table = 'queries' AND source_id = NEW.id;

  UPDATE public.queries SET library_tombstoned_at = now() WHERE id = NEW.id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_tombstone_query_from_library
  AFTER UPDATE ON public.queries
  FOR EACH ROW
  WHEN (OLD.is_public_library = true AND NEW.is_public_library = false)
  EXECUTE FUNCTION public.fn_tombstone_query_from_library();

-- fn_project_answer_to_library: AFTER INSERT/UPDATE on answers — REFINEMENT A (two blocks)
CREATE FUNCTION public.fn_project_answer_to_library() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Block 1: always project the video itself
  INSERT INTO public.library_items
    (kind, source_id, source_table, symbol, title, verdict, analyst_id,
     body_excerpt, is_public, published_at)
  SELECT 'video', NEW.id, 'answers',
         public.fn_normalize_symbol(coalesce(q.stock_symbol, q.stock_name)),
         'Analyst video on ' || coalesce(q.stock_name,'stock'),
         NEW.verdict, NEW.expert_id,
         left(regexp_replace(coalesce(NEW.body,''), E'[#*_`>]', '', 'g'), 280),
         true, now()
  FROM public.queries q WHERE q.id = NEW.query_id
  ON CONFLICT (source_table, source_id) DO UPDATE
    SET title = EXCLUDED.title, verdict = EXCLUDED.verdict,
        analyst_id = EXCLUDED.analyst_id, body_excerpt = EXCLUDED.body_excerpt,
        symbol = EXCLUDED.symbol, updated_at = now();

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
END $$;

CREATE TRIGGER trg_project_answer_to_library
  AFTER INSERT OR UPDATE ON public.answers
  FOR EACH ROW
  WHEN (NEW.is_published = true AND NEW.answer_type = 'video' AND NEW.video_url IS NOT NULL)
  EXECUTE FUNCTION public.fn_project_answer_to_library();

-- fn_log_consent_event: AFTER UPDATE on queries (consent columns change)
CREATE FUNCTION public.fn_log_consent_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ev text;
BEGIN
  IF OLD.is_public_library = false AND NEW.is_public_library = true THEN
    ev := CASE WHEN NEW.public_consent_anonymized THEN 'opt_in_anonymized' ELSE 'opt_in' END;
  ELSIF OLD.is_public_library = true AND NEW.is_public_library = false THEN
    ev := 'opt_out';
  ELSIF OLD.is_public_library = true AND NEW.is_public_library = true
        AND OLD.public_consent_anonymized = true AND NEW.public_consent_anonymized = false THEN
    ev := 'opt_in_deanonymized';
  ELSIF OLD.is_public_library = true AND NEW.is_public_library = true
        AND OLD.public_consent_anonymized = false AND NEW.public_consent_anonymized = true THEN
    ev := 'opt_in_anonymized';
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO public.library_consent_events (query_id, user_id, event_type)
    VALUES (NEW.id, NEW.user_id, ev);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_consent_event
  AFTER UPDATE ON public.queries
  FOR EACH ROW
  WHEN ((OLD.is_public_library, OLD.public_consent_anonymized)
        IS DISTINCT FROM
        (NEW.is_public_library, NEW.public_consent_anonymized))
  EXECUTE FUNCTION public.fn_log_consent_event();
