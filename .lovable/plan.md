# Stage 4G — APPLY-1 (Backend-only, LOCKED)

Scope: data model + guardrails + storage buckets + backend RPCs. **No UI changes.** Ends with a STOP for founder audit.

## Locked APPLY-1 refinements (from founder message)

1. **YouTube ToS enforcement (paid stock_specific)** — dual layer: Zod refine in the composer server fn AND a DB CHECK/trigger. Refusal message references YouTube ToS.
2. **Curated URL normalization + dedupe** — `fn_normalize_source_url(text)` immutable helper (lowercase host, strip fragment, strip known tracking params `utm_*`, `gclid`, `fbclid`, `mc_*`, `_hs*`, `ref`, `ref_src`, remove trailing `/`, preserve path + meaningful query). Stored in generated column `source_url_norm`. Unique index on `(source_url_norm, category) WHERE is_published = true`.
3. **Denorm integrity check** — one-shot SQL verification block at end of migration that raises if:
  - any `answers` row with `category='stock_specific'` has `stock_master_id IS NULL` or mismatched vs `queries.stock_master_id`;
  - any `answers` row with `category='general'` has `stock_master_id IS NOT NULL` or `query_id IS NOT NULL`.
   Runs as a DO block after backfill so we fail migration on inconsistency.
4. **Curated engagement counters clean** — increments only from explicit RPCs `record_curated_view(_id)` and `record_curated_click_through(_id)` gated by:
  - caller must be `authenticated` OR `anon` with a request header check (RPC skips if header `x-lovable-prefetch: 1` present — used by SSR/prefetch);
  - throttle: same `(coalesce(auth.uid(),'anon'::uuid), item_id)` no more than once per 10 minutes (tracked via `curated_view_events` append-only table with unique partial index);
  - admin/editor callers (has_role admin/analyst) do NOT increment (explicit guard).
5. **Signed URL redaction** — playback issuer never logs the signed URL. Server fn returns `{ url, expiresAt }` and logs only `{ answerId, userId, expiresInSec }`. Add a shared `redactSignedUrl(s)` helper (regex on `?token=` / `&token=` / storage host paths) used in any error path that might otherwise include the URL.

## Migration file (single migration)

`2026XXXX_stage_4g_apply1.sql` — additive, rerunnable where possible.

### 1. Answers table extension

- `ALTER TABLE public.answers ALTER COLUMN query_id DROP NOT NULL;`
- Add columns:
  - `category text CHECK (category IN ('stock_specific','general'))`
  - `source_kind text CHECK (source_kind IN ('upload','record','external_link'))`
  - `external_provider text` (`youtube|vimeo|other|null`)
  - `external_url text`
  - `custom_thumbnail_url text`
  - `stock_master_id uuid REFERENCES public.stock_master(id)`
  - `paid_video_storage_path text`
- Drop existing unique `(query_id, expert_id, answer_type)`; recreate as **partial** `WHERE query_id IS NOT NULL`.
- New indexes:
  - `idx_answers_general_published (created_at DESC) WHERE category='general' AND is_published=true`
  - `idx_answers_stock_master_published (stock_master_id, created_at DESC) WHERE is_published=true`

### 2. Answers invariant + YouTube ToS (dual-layer)

- Function `fn_answers_enforce_invariant()` (BEFORE INSERT OR UPDATE):
  - If `NEW.category='stock_specific'`:
    - require `NEW.stock_master_id IS NOT NULL`;
    - if `NEW.query_id IS NOT NULL`, require `NEW.stock_master_id = (SELECT stock_master_id FROM queries WHERE id=NEW.query_id)`;
    - if `NEW.source_kind='external_link'` AND `NEW.external_url ~* '(^|//)(www\.)?(youtube\.com|youtu\.be)/'` → RAISE `youtube_paywall_forbidden — YouTube ToS forbids embedding YouTube content behind a paywall`.
  - If `NEW.category='general'`: require `NEW.stock_master_id IS NULL` AND `NEW.query_id IS NULL`.
  - If `NEW.category IS NULL` (legacy rows): pass through.
- Trigger `trg_answers_enforce_invariant` on `answers`.

### 3. `unlock_video_answer` widened guard (signature unchanged)

- Rewrite to also require `category = 'stock_specific'` (via `COALESCE(category,'stock_specific')` so legacy rows still unlock). External callers unchanged.

### 4. `get_video_answer` + `list_public_video_answers_for_symbol` (additive fields)

- Return additional fields: `category`, `source_kind`, `external_provider`. On locked branch: strip `youtube_video_id`, `external_url`, `video_url`, `paid_video_storage_path` (return NULLs). Signature unchanged (jsonb).

### 5. Tighten downstream triggers

- `notify_expert_answer`: no-op when `NEW.category = 'general'` (skip notification since there is no per-user query).
- Any legacy auto-publish trigger: fire only when `NEW.category IS NULL`.
- `fn_project_answer_to_library`: skip projection when `NEW.category = 'general'` (the General tab is served by a dedicated RPC — no back-compat surface impact).

### 6. Queries table

- `ALTER TABLE public.queries ADD COLUMN stock_master_id uuid REFERENCES public.stock_master(id);`
- Best-effort backfill from `stock_symbol` via `stock_master` (NSE preferred, BSE fallback).
- Index `idx_queries_stock_master (stock_master_id) WHERE stock_master_id IS NOT NULL`.

### 7. Answers backfill

- Backfill `answers.stock_master_id` from linked query where present and consistent.
- Legacy rows keep `category = NULL`.

### 8. Curated Media table

```sql
CREATE TABLE public.curated_items (
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
```

- GRANTs:
  - `GRANT SELECT ON public.curated_items TO anon;` (RLS narrows to `is_published=true`)
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON public.curated_items TO authenticated;`
  - `GRANT ALL ON public.curated_items TO service_role;`
- `ENABLE ROW LEVEL SECURITY`.
- Policies:
  - `curated_public_read`: `SELECT TO anon, authenticated USING (is_published = true)`.
  - `curated_admin_manage`: `ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'))`.
  - `curated_editor_manage_own`: `ALL TO authenticated USING (posted_by = auth.uid() AND public.has_role(auth.uid(),'analyst')) WITH CHECK (posted_by = auth.uid() AND public.has_role(auth.uid(),'analyst'))`.
- Indexes:
  - `idx_curated_stock_published (stock_master_id, published_at DESC) WHERE is_published`
  - `idx_curated_category_published (category, published_at DESC) WHERE is_published`
  - `idx_curated_tags_gin` GIN on `tags`
  - `idx_curated_search_trgm` GIN trgm on `(title || ' ' || coalesce(description,''))`
  - `**uq_curated_norm_category` UNIQUE on `(source_url_norm, category) WHERE is_published = true**` (dedupe protection while allowing multiple drafts and cross-category duplicates)
- `updated_at` trigger via existing `set_updated_at()`.

### 9. `fn_normalize_source_url(text)` helper

- IMMUTABLE PARALLEL SAFE STRICT.
- Lowercase host, strip fragment, strip tracking params (`utm_*`, `gclid`, `fbclid`, `mc_*`, `_hs*`, `ref`, `ref_src`, `igshid`, `si`), remove trailing `/`, preserve remaining path + query.
- Falls back to trimmed input on parse failure.

### 10. Engagement RPCs (clean counters)

- Append-only table:
  ```sql
  CREATE TABLE public.curated_view_events (
    id bigserial PRIMARY KEY,
    item_id uuid NOT NULL REFERENCES public.curated_items(id) ON DELETE CASCADE,
    viewer_id uuid, -- auth.uid() or null for anon
    kind text NOT NULL CHECK (kind IN ('view','click_through')),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_cve_dedupe ON public.curated_view_events (item_id, viewer_id, kind, created_at DESC);
  ```
  GRANTs: authenticated INSERT via RPC only; anon has no direct grant; service_role ALL. RLS enabled, no permissive policies (writes go through SECURITY DEFINER RPC).
- `record_curated_view(_id uuid)` SECURITY DEFINER:
  - reject if caller is `admin` or `analyst` (via `has_role`);
  - reject if within 10 min for same `(viewer_id,item_id,kind='view')`;
  - insert event; increment `curated_items.view_count`.
- `record_curated_click_through(_id uuid)` SECURITY DEFINER: same shape, `kind='click_through'`, increments `click_through_count`.
- Both callable from `authenticated` and `anon`; server callers must NOT send them from SSR/prefetch paths (composer + Discover components skip on `?prefetch=1` and server-side render).

### 11. Discovery RPCs (empty-result-safe at this stage)

- `list_public_general_video_answers(_limit int, _offset int)`
- `list_curated_items_for_symbol(_symbol text, _limit int, _offset int)`
- `list_discover_feed(_kind_filter text[], _symbol text, _limit int, _offset int)` — unions published `general` answers + published curated + published AI reports, ranks per §I of PLAN v3 (freshness + engagement + type_prior + editorial_boost).
- `get_curated_item(_id uuid)` — returns row for embed/detail render (no side effects).
- All SECURITY DEFINER, anon-safe, `SET search_path = public`.

### 12. Denorm integrity verification (final DO block)

```sql
DO $$
DECLARE bad_ss int; bad_gen int;
BEGIN
  SELECT count(*) INTO bad_ss FROM public.answers a
   LEFT JOIN public.queries q ON q.id = a.query_id
   WHERE a.category = 'stock_specific'
     AND (a.stock_master_id IS NULL
          OR (a.query_id IS NOT NULL AND a.stock_master_id IS DISTINCT FROM q.stock_master_id));
  SELECT count(*) INTO bad_gen FROM public.answers
   WHERE category = 'general' AND (stock_master_id IS NOT NULL OR query_id IS NOT NULL);
  IF bad_ss > 0 OR bad_gen > 0 THEN
    RAISE EXCEPTION 'stock_master_id invariant broken: bad_ss=%, bad_gen=%', bad_ss, bad_gen;
  END IF;
END $$;
```

## Storage buckets (via `supabase--storage_create_bucket`)

- `paid-videos` — **private**. RLS on `storage.objects`:
  - INSERT/UPDATE/SELECT for authenticated where `(bucket_id='paid-videos' AND (storage.foldername(name))[1] = auth.uid()::text)` AND caller has role `admin`/`analyst`.
  - NO grant for anon.
  - End-user playback only via signed URL from server fn (APPLY-3).
- `video-thumbnails` — public read; admin/analyst write to own folder.
- `curated-thumbnails` — public read; admin/analyst write to own folder.

## Server fn stubs (APPLY-1 lands the file skeletons, no UI wiring)

Created but not wired to any route (safe additions):

- `src/lib/canonical-stock.ts` — `resolveStockBySymbol(symbol)` helper (client + server safe).
- `src/lib/discover.functions.ts` — thin wrappers over the three list RPCs.
- `src/lib/curated.functions.ts` — `recordCuratedView`, `recordCuratedClickThrough`, `getCuratedItem` wrappers (SSR-safe: no-op when `import.meta.env.SSR`).
- `src/lib/paid-video-playback.functions.ts` — `issuePaidVideoSignedUrl` with `requireSupabaseAuth`; verifies `video_entitlements` row; mints 90 s signed URL via `supabaseAdmin` (imported dynamically inside handler); returns `{ url, expiresAt }`; **never logs `url**`; uses `redactSignedUrl` helper on any error surface.
- `src/lib/log-redaction.ts` — `redactSignedUrl(s: string)` shared helper.

None of these are imported by any existing route/component in APPLY-1 → zero regression surface.

## UAT for APPLY-1 (backend-only)

Run via `supabase--read_query` and one Node script:

1. `SELECT column_name FROM information_schema.columns WHERE table_name='answers' AND column_name IN ('category','source_kind','external_provider','external_url','custom_thumbnail_url','stock_master_id','paid_video_storage_path');` → 7 rows.
2. `SELECT column_name FROM information_schema.columns WHERE table_name='queries' AND column_name='stock_master_id';` → 1 row.
3. Attempt INSERT into `answers` violating invariant → expect trigger EXCEPTION.
4. Attempt INSERT with `category='stock_specific'`, `source_kind='external_link'`, `external_url='https://youtu.be/abc'` → EXCEPTION `youtube_paywall_forbidden`.
5. `SELECT to_regprocedure('public.unlock_video_answer(uuid)');` → not null; call against a legacy stock_specific row unchanged.
6. `SELECT count(*) FROM public.curated_items;` → 0 (fresh table); RLS shows 0 rows for anon.
7. Attempt duplicate publish of same normalized source_url + category → unique index violation.
8. Call `record_curated_view` as admin → RPC returns `{status:'skipped', reason:'admin'}` and counter unchanged.
9. Call `record_curated_view` twice within 10 min for same anon → second returns `{status:'skipped', reason:'throttled'}`.
10. `SELECT bucket_id, public FROM storage.buckets WHERE id IN ('paid-videos','video-thumbnails','curated-thumbnails');` → `paid-videos` public=false, others public=true.
11. `SELECT to_regprocedure('public.list_discover_feed(text[],text,int,int)');` → not null; call returns empty array (no data yet), no error.
12. Denorm integrity DO block passed (migration succeeded).
13. No 4F.1 RPC signature drift (schema diff on `unlock_video_answer`, `get_video_answer`, `list_public_video_answers_for_symbol` — return shape widened additively).
14. No existing user-facing route imports the new server-fn files → confirmed via `rg`.
15. Legacy MP4 answers still SELECTable and viewable in MyQueries (spot check via SQL).

## Anti-regression firewall (proof to include in APPLY-1 report)

- 4F.1 RPCs: signatures unchanged, guards widened additively.
- 4F.2 anti-leak: locked payload strips `paid_video_storage_path` as well.
- Wallet / entitlement: no code path changed.
- Legacy MP4: `category IS NULL` bypass path in every new trigger/guard.
- ₹100 Book Analyst Video: no file in that flow touched.
- No UI file changed in APPLY-1.

## Deliverables in APPLY-1

1. One migration file (via `supabase--migration`).
2. Three storage buckets (via `supabase--storage_create_bucket`).
3. Regenerated `src/integrations/supabase/types.ts` (post-migration).
4. New backend-only source files listed under "Server fn stubs".
5. UAT report per checklist above.

**STOP for founder audit after APPLY-1. Do not proceed to APPLY-2.**  
  
**note  fro now:**  
Founder correction before APPLY-1 approval.

The 4G APPLY-1 backend-only plan is very close, but approval is blocked until these 3 corrections are incorporated explicitly.

1. Anonymous engagement throttling

Current design uses `viewer_id uuid` only in `curated_view_events`, which is insufficient for reliable anon dedupe/throttling because anon viewers will have `viewer_id = NULL`.

Revise the design to add:

- `viewer_key text NULL` (or equivalent anon fingerprint field)

Throttle logic must use:

- authenticated: `auth.uid()`

- anonymous: provided/stable `viewer_key`

The RPCs `record_curated_view` and `record_curated_click_through` must support this cleanly.

Do not rely on NULL `viewer_id` alone for anon throttling.

2. Answers RLS / policy audit for `general` rows with `query_id = NULL`

Since APPLY-1 drops `answers.query_id NOT NULL`, the plan must explicitly state one of:

- existing `answers` insert/update policies already permit admin/analyst creation of `category='general'` rows with `query_id = NULL`, OR

- APPLY-1 adds the minimal additive policy required for that case

This must be surfaced clearly now, not deferred, otherwise APPLY-2 composer may fail later.

3. pg_trgm extension

Because APPLY-1 creates `idx_curated_search_trgm`, the migration must explicitly include:

- `CREATE EXTENSION IF NOT EXISTS pg_trgm;`

or clearly prove the extension already exists before creating the index.

Keep all other APPLY-1 scope unchanged.

Return the corrected APPLY-1 plan only, then founder will approve.

Do not start execution yet.

&nbsp;