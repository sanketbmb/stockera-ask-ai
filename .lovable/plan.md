
# L1 — Public Research Library: Backend Foundation (PLAN ONLY, Rev 2)

Refinements A, B, C baked in. No files written. No migrations run. After review, send **"EXECUTE PLAN"** and a separate BUILD prompt will translate this into one migration + types regen.

---

## Pre-flight findings (PR-1)

**Supabase connection:** project `pwicwmnutyahscbreqvg` connected. `supabase/migrations/` exists (88 migrations).

**`public.queries` columns (38):** `id, user_id, stock_name, stock_symbol, buy_price, current_price, query_text, query_type, assigned_analyst_id, status, ai_report (jsonb), created_at, updated_at, intent, pnl_state, video_requested, video_payment_id, engine_version, engine_source, horizon, custom_question, orchestrator_response_id, regenerated_from_uuid, frozen_at, report_artifact_status, entry_price, qty, position_state, profit_loss_pct, addendum_used, router_meta, sector_canonical, sector_macro_state, concept_canonical, educational_difficulty, secondary_asks, secondary_answers, mixed_query_meta`. There is NO `ai_draft`, NO `verdict`, NO `video_url`, NO `sources_used`, NO `ai_followups` column. AI output lives in `ai_report` (jsonb); analyst id in `assigned_analyst_id`.

**`public.answers` EXISTS** (this is the analyst-answer / video table — the brief's `analyst_videos` does not exist). Columns: `id, query_id, expert_id, answer_type, body, video_url, video_thumbnail, duration_seconds, is_published, created_at, verdict, key_level, time_horizon, risk_note, report_url, report_filename, report_mime, report_size_bytes, report_label`.

**`public.analyst_profiles` EXISTS** — suitable as FK target for `library_items.analyst_id`.

**`public.analyst_videos` does NOT exist.** L1 video projections will source from `public.answers` where `answer_type='video' AND is_published=true AND video_url IS NOT NULL`. The trigger function is named `fn_project_answer_to_library` and fires on `answers`.

**`public.community_questions` does NOT exist.** `kind='community_query'` is reserved in the CHECK enum but no projection path exists in L1.

**Existing RLS on `queries`:** `admin_full_access (ALL)`, `queries_admin_read_all (SELECT)`, `queries_analyst_read (SELECT, assigned_analyst_id)`, `queries_analyst_update (UPDATE)`, `queries_own (ALL, user_id)`, `queries_own_insert (INSERT, no qual)`, `queries_own_update (UPDATE, user_id)`. Untouched by L1.

**Extensions:** `pgcrypto` enabled. `pg_trgm` NOT enabled — migration must `CREATE EXTENSION IF NOT EXISTS pg_trgm`.

**Locked deviations from brief:** library projection's verdict/video source is `answers`, not a column on `queries`. `fn_project_analyst_video_to_library` is renamed `fn_project_answer_to_library` and fires on `public.answers`.

---

## P-1 — `public.library_items`

```sql
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
```

`source_table` CHECK substitutes `'answers'` for `'analyst_videos'` (the latter does not exist). Writes blocked by RLS in P-3.

---

## P-2 — Indexes

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

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
```

---

## P-3 — RLS on `library_items`

```sql
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.library_items FROM anon, authenticated;

-- SELECT visibility on library_items for non-'queries' kinds
-- (video / analyst / community_query) is governed SOLELY by
-- is_public = true. There is intentionally no per-user
-- 'my private projection' concept for these kinds. The CASE
-- returns NULL for non-'queries' kinds, and auth.uid() = NULL
-- evaluates to NULL, which Postgres RLS treats as deny — this
-- is the correct behavior. Do NOT 'fix' this branch.
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
```
No INSERT/UPDATE/DELETE policies — only `service_role` and `SECURITY DEFINER` triggers can write.

---

## P-4 — `public.library_item_views`

```sql
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
CREATE POLICY views_insert_any  ON public.library_item_views FOR INSERT WITH CHECK (true);
CREATE POLICY views_select_admin ON public.library_item_views FOR SELECT USING (has_role(auth.uid(),'admin'));
```
Aggregation pg_cron → `library_items.view_count` every 5 min: **deferred to L2** (see PR-9 N-1 for retention).

---

## P-5 — `public.library_search_logs`

```sql
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
```
No IP, no user-agent.

---

## P-6 — `public.symbol_aliases`

```sql
CREATE TABLE public.symbol_aliases (
  alias             text PRIMARY KEY,
  canonical_symbol  text NOT NULL,
  notes             text
);
GRANT SELECT ON public.symbol_aliases TO anon, authenticated;
GRANT ALL    ON public.symbol_aliases TO service_role;
ALTER TABLE public.symbol_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY aliases_select_all ON public.symbol_aliases FOR SELECT USING (true);
```
Seed (~30, lowercase aliases): `'hdfc bank'→HDFCBANK, 'bajaj fin'→BAJFINANCE, 'sbi'→SBIN, 'reliance'→RELIANCE, 'tcs'→TCS, 'tata motors'→TATAMOTORS, 'm&m'→M&M, 'l&t'→LT, 'icici bank'→ICICIBANK, 'kotak bank'→KOTAKBANK, 'axis bank'→AXISBANK, 'wipro'→WIPRO, 'infy'→INFY, 'infosys'→INFY, 'adani green'→ADANIGREEN, 'adani ports'→ADANIPORTS, 'suzlon'→SUZLON, 'inox wind'→INOXWIND, 'tata power'→TATAPOWER, 'ntpc'→NTPC, 'ongc'→ONGC, 'bharti airtel'→BHARTIARTL, 'airtel'→BHARTIARTL, 'jio fin'→JIOFIN, 'maruti'→MARUTI, 'bajaj auto'→BAJAJ-AUTO, 'hero moto'→HEROMOTOCO, 'eicher'→EICHERMOT, 'asian paints'→ASIANPAINT, 'pidilite'→PIDILITIND`.

---

## P-7 — Consent columns on `public.queries`

```sql
ALTER TABLE public.queries
  ADD COLUMN is_public_library         bool NOT NULL DEFAULT false,
  ADD COLUMN public_consent_at         timestamptz,
  ADD COLUMN public_consent_anonymized bool NOT NULL DEFAULT false,
  ADD COLUMN library_tombstoned_at     timestamptz;
```
Opt-in defaults.

---

## P-7b — `public.library_consent_events` (SEBI audit log) — REFINEMENT C

```sql
CREATE TABLE public.library_consent_events (
  id          bigserial PRIMARY KEY,
  query_id    uuid REFERENCES public.queries(id) ON DELETE SET NULL,  -- nullable; survives query deletion
  user_id     uuid NOT NULL,                                          -- denormalized, always attributable
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
```
**Refinement C:** `query_id` is now nullable with `ON DELETE SET NULL` so consent rows survive a hard-delete of the underlying query (GDPR/DPDP, admin cleanup). `user_id` remains NOT NULL, fully attributable: "user X consented at Y for query [now deleted]."

---

## P-8 — Trigger functions (all `SECURITY DEFINER`, `SET search_path = public`)

### `fn_project_query_to_library()`
`AFTER UPDATE ON queries WHEN OLD.is_public_library IS DISTINCT FROM NEW.is_public_library AND NEW.is_public_library = true`.

```sql
IF NOT EXISTS (
  SELECT 1 FROM public.answers a
  WHERE a.query_id = NEW.id AND a.is_published = true AND a.video_url IS NOT NULL
) THEN RETURN NEW; END IF;  -- opt-in-then-answer flow: handled by fn_project_answer_to_library later

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
  SET is_public = true, is_tombstoned = false, updated_at = now(),
      title = EXCLUDED.title, verdict = EXCLUDED.verdict,
      analyst_id = EXCLUDED.analyst_id, body_excerpt = EXCLUDED.body_excerpt,
      symbol = EXCLUDED.symbol,
      published_at = coalesce(library_items.published_at, EXCLUDED.published_at);
```

### `fn_tombstone_query_from_library()`
`AFTER UPDATE ON queries WHEN OLD.is_public_library = true AND NEW.is_public_library = false`.

```sql
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
```

### `fn_project_answer_to_library()` — REFINEMENT A (two projection blocks)
`AFTER INSERT OR UPDATE ON answers WHEN NEW.is_published = true AND NEW.answer_type = 'video' AND NEW.video_url IS NOT NULL`.

**Block 1 — project the video itself:**
```sql
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
```

**Block 2 — also project parent query as a 'report' row when user has already opted in (Refinement A):**
```sql
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
```

Both flows — **opt-in-then-answer** (Block 2 fires now) and **answer-then-opt-in** (`fn_project_query_to_library` fires on the consent flip) — produce identical end-state in `library_items`. The `library_tombstoned_at IS NULL` guard prevents Block 2 from un-tombstoning a previously revoked query if a new answer is later published.

### `fn_log_consent_event()`
`AFTER UPDATE ON queries WHEN (OLD.is_public_library, OLD.public_consent_anonymized) IS DISTINCT FROM (NEW.is_public_library, NEW.public_consent_anonymized)`.

```sql
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
  ELSE RETURN NEW;
  END IF;
  INSERT INTO public.library_consent_events (query_id, user_id, event_type)
    VALUES (NEW.id, NEW.user_id, ev);
  RETURN NEW;
END;
```

All trigger functions: `SECURITY DEFINER`, `SET search_path = public`. None touch `search_tsv` / `trgm_blob` (both GENERATED).

---

## P-9 — Hot-path guarantee

`INSERT INTO queries` is unaffected. `is_public_library` defaults to `false`, no projection trigger fires on INSERT, no consent-log row written. Library writes only on explicit consent UPDATE or on answer publication (and Block 2 only after a prior consent). Query-creation latency unchanged.

---

## P-10 — `fn_normalize_symbol(raw text) RETURNS text` — REFINEMENT B

```sql
CREATE FUNCTION public.fn_normalize_symbol(raw text) RETURNS text
LANGUAGE plpgsql STABLE AS $$       -- STABLE, not IMMUTABLE: reads symbol_aliases
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
```
**Refinement B:** declared `STABLE`. The function reads a mutable table (`symbol_aliases`); IMMUTABLE would let the planner cache stale results. We do not build an expression index on the function output, so STABLE costs us nothing.

---

## P-11 — Types regen (post-EXECUTE)

`supabase gen types typescript --linked > src/integrations/supabase/types.ts` (correct path in this repo — NOT `src/types/database.ts`). All additions are additive; no existing imports break.

---

## P-12 — Rollback (verbatim)

```sql
DROP TRIGGER IF EXISTS trg_project_query_to_library     ON public.queries;
DROP TRIGGER IF EXISTS trg_tombstone_query_from_library ON public.queries;
DROP TRIGGER IF EXISTS trg_log_consent_event            ON public.queries;
DROP TRIGGER IF EXISTS trg_project_answer_to_library    ON public.answers;

DROP FUNCTION IF EXISTS public.fn_project_query_to_library()    CASCADE;
DROP FUNCTION IF EXISTS public.fn_tombstone_query_from_library() CASCADE;
DROP FUNCTION IF EXISTS public.fn_project_answer_to_library()   CASCADE;
DROP FUNCTION IF EXISTS public.fn_log_consent_event()           CASCADE;
DROP FUNCTION IF EXISTS public.fn_normalize_symbol(text)        CASCADE;

DROP TABLE IF EXISTS public.library_item_views     CASCADE;
DROP TABLE IF EXISTS public.library_search_logs    CASCADE;
DROP TABLE IF EXISTS public.library_consent_events CASCADE;
DROP TABLE IF EXISTS public.library_items          CASCADE;
DROP TABLE IF EXISTS public.symbol_aliases         CASCADE;

ALTER TABLE public.queries
  DROP COLUMN IF EXISTS is_public_library,
  DROP COLUMN IF EXISTS public_consent_at,
  DROP COLUMN IF EXISTS public_consent_anonymized,
  DROP COLUMN IF EXISTS library_tombstoned_at;
```

---

## P-13 — `STALE_VERDICT_DAYS` (frontend prep)

Not in L1. L2: add `export const STALE_VERDICT_DAYS = 60;` to `src/lib/firm-details.ts`.

---

# Plan-Mode Report

**PR-1 — Pre-flight findings:** see top section. Key deltas vs brief: `queries` has no `verdict/video_url/sources_used/ai_followups`; `answers` is the source for verdicts and videos; `analyst_videos` and `community_questions` do not exist; `pg_trgm` not installed; existing `queries` RLS unchanged.

**PR-2 — New tables (5):**
1. `library_items` — projection layer for public research.
2. `library_item_views` — view-count buffer (aggregation deferred to L2).
3. `library_search_logs` — PII-minimised search analytics.
4. `library_consent_events` — SEBI consent audit log (survives query deletion — Refinement C).
5. `symbol_aliases` — fuzzy company-name → ticker map (~30 seeds).

**PR-3 — New columns on `queries` (4):** `is_public_library bool NOT NULL DEFAULT false`, `public_consent_at timestamptz`, `public_consent_anonymized bool NOT NULL DEFAULT false`, `library_tombstoned_at timestamptz`.

**PR-4 — Trigger functions (5, all SECURITY DEFINER):**
1. `fn_project_query_to_library` — AFTER UPDATE ON queries (consent → true).
2. `fn_tombstone_query_from_library` — AFTER UPDATE ON queries (consent → false).
3. **`fn_project_answer_to_library` — AFTER INSERT OR UPDATE ON answers. Now contains TWO projection blocks: Block 1 always upserts the 'video' library row; Block 2 conditionally upserts the parent query's 'report' library row IFF `queries.is_public_library = true AND library_tombstoned_at IS NULL` (Refinement A — guarantees parity between opt-in-then-answer and answer-then-opt-in flows).**
4. `fn_log_consent_event` — AFTER UPDATE ON queries (consent columns change).
5. `fn_normalize_symbol(text)` — STABLE helper (Refinement B), not trigger-bound.

**PR-5 — Indexes (count: 10):**
- `library_items_source_uk` UNIQUE (source_table, source_id) — full.
- `library_items_tsv_gin` GIN (search_tsv).
- `library_items_trgm_gin` GIN (trgm_blob gin_trgm_ops).
- `library_items_symbol_pub` BTREE (symbol) WHERE is_public=true.
- `library_items_kind_pub_pubat` BTREE (kind, published_at DESC) WHERE is_public=true.
- `library_items_analyst_pub` BTREE (analyst_id) WHERE is_public=true.
- `library_item_views_item_time` BTREE (item_id, created_at).
- `library_search_logs_created` BTREE (created_at).
- `library_search_logs_normq` BTREE (normalized_query).
- `lce_query_time` BTREE (query_id, created_at) + `lce_user_time` BTREE (user_id, created_at).

**PR-6 — RLS policies:**
- `library_items` SELECT — `is_public=true OR auth.uid()=owner(CASE on source_table='queries')`. Writes: none (service_role + SECURITY DEFINER only).
- `library_item_views` INSERT — `true`; SELECT — `has_role(admin)`.
- `library_search_logs` INSERT — `true`; SELECT — `has_role(admin)`.
- `library_consent_events` SELECT — `has_role(admin)`. No INSERT policy (SECURITY DEFINER trigger only).
- `symbol_aliases` SELECT — `true`. No write policy.

**PR-7 — Tombstone scrub UPDATE (verbatim, unchanged from Rev 1):**
```sql
UPDATE public.library_items
SET is_tombstoned = true, is_public = true,
    title = '[Question removed at user request]',
    body_excerpt = NULL, verdict = NULL, analyst_id = NULL,
    updated_at = now()
WHERE source_table = 'queries' AND source_id = NEW.id;
```
Confirms title/body_excerpt/verdict/analyst_id are nulled (title replaced with removal stub); `symbol` preserved for SEO.

**PR-8 — Consent audit log coverage (unchanged from Rev 1):** `fn_log_consent_event` covers all four event types. (OLD.public, NEW.public, OLD.anon, NEW.anon → event):
- `(F, T, *, F)` → `opt_in`
- `(F, T, *, T)` → `opt_in_anonymized`
- `(T, F, *, *)` → `opt_out`
- `(T, T, T, F)` → `opt_in_deanonymized`
- `(T, T, F, T)` → `opt_in_anonymized`
Trigger condition: `(OLD.is_public_library, OLD.public_consent_anonymized) IS DISTINCT FROM (NEW.is_public_library, NEW.public_consent_anonymized)`.

**PR-9 — Risks / unknowns / assumptions + refinement summaries + forward notes:**

*Refinements baked in:*
- **Refinement A:** `fn_project_answer_to_library` now has two projection blocks (video + conditional report). Closes the opt-in-then-answer gap so both consent-ordering flows converge to the same library state. Guarded by `library_tombstoned_at IS NULL` so a later answer cannot resurrect a tombstoned query.
- **Refinement B:** `fn_normalize_symbol` declared `STABLE` (was `IMMUTABLE`). Honest volatility for a function that reads `symbol_aliases`; no index expression depends on it, so no perf cost.
- **Refinement C:** `library_consent_events.query_id` is nullable with `ON DELETE SET NULL`. `user_id` remains NOT NULL and denormalized, so consent rows remain attributable after a hard-delete of the underlying query — required posture for a SEBI/DPDP audit log.

*Forward notes (not implemented in L1):*
- **N-1:** `library_item_views` will accumulate fast under anon + bot traffic. L2 must add a TRUNCATE-after-aggregation step (or time-partitioning) alongside the 5-min aggregation cron. Acknowledged; not built in L1.
- **N-2:** `body_excerpt` regex `E'[#*_\`>]'` strips only basic Markdown specials. It does NOT strip Markdown link syntax `[text](url)` or HTML tags. Acceptable for L1 (excerpts are short); L2 should add a proper text-extraction / sanitisation pass.

*Standing risks / assumptions:*
- Assumption: `answers` is the canonical source for analyst videos/verdicts (verified). If a separate `analyst_videos` table is later added, `fn_project_answer_to_library` must be duplicated for it.
- Risk: `'simple'` tsvector config — no stemming/stopwords. Acceptable for Hinglish/Devanagari; trgm index compensates for English plural matching.
- Risk: analyst FK — `library_items.analyst_id REFERENCES analyst_profiles(id) ON DELETE SET NULL` is safe at delete time, but projection-time insert will fail if `assigned_analyst_id` points to a non-existent analyst. BUILD will guard with a `LEFT JOIN` / NULL fallback.
- Risk: `fn_normalize_symbol` edge cases (multi-word tickers, `M&M`, `BAJAJ-AUTO`) covered by alias seeds; unmapped multi-word names return NULL and the trigger stores NULL `symbol` (allowed).
- Unknown: `community_questions` not in scope; the enum slot is reserved.

*Blast radius & instant revert:* the biggest risk is the AFTER UPDATE triggers on `queries` — a bug there could break user-facing UPDATEs (consent toggle, status changes, etc.). Each trigger has an explicit `WHEN` condition tied to specific column transitions, so unrelated updates pass through. If anything misbehaves, run P-12 in full; it cascades through every new object and drops the four added columns, returning the schema to its current state with zero residue. The only mutation to an existing table is `queries.ADD COLUMN` with safe defaults, which is rollback-safe.

---

End of revised plan. Awaiting **"EXECUTE PLAN"** before any code is written.
