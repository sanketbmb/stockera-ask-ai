# Complete Admin System — 4 Parts

## Preservation guarantees
Will NOT touch: `src/lib/report.functions.ts`, `supabase/functions/generate-ai-report/`, `supabase/functions/gemini-analysis/`, `supabase/functions/fetch-stock-data/`, `src/contexts/AuthContext.tsx`, `src/integrations/supabase/auth-middleware.ts`, `src/integrations/supabase/auth-attacher.ts`, `src/router.tsx`, `src/server.ts`, `src/start.ts`. Existing AI Engine Health Check card on `/admin/super` is preserved. All DB changes are additive (`ADD COLUMN IF NOT EXISTS`, `CREATE POLICY IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`). No drops, no type changes, no data resets.

---

## SQL diff (full)

```sql
-- ============ MIGRATION 1: admin_full_access policies ============
-- 12 tables: profiles, user_roles, queries, analyst_profiles, answers,
-- wallet_transactions, referrals, ai_reports, audit_events, grievances,
-- user_portfolio, notifications.
-- Pattern (repeated per table):
CREATE POLICY IF NOT EXISTS "admin_full_access" ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
-- (repeat for each table listed)

-- ============ MIGRATION 2: answers compliance fields ============
ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS verdict       TEXT,
  ADD COLUMN IF NOT EXISTS key_level     TEXT,
  ADD COLUMN IF NOT EXISTS time_horizon  TEXT,
  ADD COLUMN IF NOT EXISTS risk_note     TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS
  answers_one_draft_per_expert_per_query
  ON public.answers (query_id, expert_id, answer_type)
  WHERE is_published = false;

-- ============ MIGRATION 3: expert-videos bucket policies ============
INSERT INTO storage.buckets (id, name, public)
  VALUES ('expert-videos', 'expert-videos', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY IF NOT EXISTS "expert_videos_analyst_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expert-videos'
              AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY IF NOT EXISTS "expert_videos_analyst_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'expert-videos'
         AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY IF NOT EXISTS "expert_videos_owner_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expert-videos'
         AND EXISTS (
           SELECT 1 FROM public.answers a
           JOIN public.queries q ON q.id = a.query_id
           WHERE a.video_url LIKE '%' || storage.objects.name
             AND a.is_published = true
             AND q.user_id = auth.uid()
         ));

CREATE POLICY IF NOT EXISTS "expert_videos_admin_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expert-videos'
         AND public.has_role(auth.uid(), 'admin'::public.app_role));
```

Note: Postgres only added native `CREATE POLICY IF NOT EXISTS` in 16. Will wrap each policy creation in a `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` block so the migration is safe on older versions.

Note 2: `expert-videos` bucket currently exists as **public**. Plan keeps it public to avoid breaking existing video URLs (matches schema). RLS policies will still be added for defensive depth; signed URLs in Part 4 still work on public buckets.

---

## Files to create

**Edge function**
- `supabase/functions/bootstrap-admin/index.ts` — reads `ADMIN_EMAIL` + `ADMIN_INITIAL_PASSWORD` from secrets, idempotent guard via `user_roles` admin count, creates auth user + profile + role + audit row, no PII in logs, CORS + error wrapper.

**Server functions (TanStack)**
- `src/lib/admin.functions.ts` — `getAllQueriesForAdmin`, `getAllUsersForAdmin`, `assignQueryToAnalyst`, `approveAnalyst`, `rejectAnalyst`, `suspendAnalyst`, `reactivateAnalyst`, `getAdminOverviewStats`, `getPlatformStats`, `getQueriesPerDay14d`. All `.middleware([requireSupabaseAuth])` and check `has_role(uid,'admin')` via `supabaseAdmin` before any work. Each mutating fn also inserts the audit_event row.

**Components**
- `src/components/admin/AnalystAnswerPanel.tsx` — inline Collapsible verdict chips + textarea + word counter + optional fields + disclaimer + Save Draft / Publish.
- `src/components/admin/AssignAnalystMenu.tsx` — dropdown of available approved analysts.
- `src/components/admin/PendingAnalystCard.tsx` — approve / reject (with reason modal).
- `src/components/admin/AdminQueryRow.tsx` — row + expandable drawer.
- `src/components/report/ExpertAnswerSection.tsx` — handles all 4 cases (none / text / video / both), signed URL for video, SEBI disclaimer.

**Migrations** (3 files under `supabase/migrations/`)
- `admin_full_access_policies.sql`
- `answers_compliance_fields.sql`
- `expert_videos_storage_policies.sql`

## Files to modify

- `src/pages/admin/SuperAdmin.tsx` — rebuild with 5 tabs (Overview, Analyst Applications [red pending badge], All Queries, All Users, Platform Stats). AI Engine Health Check stays at top of Platform Stats tab unchanged.
- `src/pages/admin/AdminDashboard.tsx` — pending-application lockout banner if `analyst_profiles.is_approved = false`; otherwise inject `AnalystAnswerPanel` into each query card and a button → `/admin/upload-answer/$queryId`.
- `src/pages/admin/AdminLogin.tsx` — post-login: if admin → `/admin/super`, else if analyst → `/admin/dashboard`, else sign out + toast.
- `src/pages/admin/VideoAnswerUpload.tsx` — raise limits to 200 MB / 10 min; on publish insert audit_event + notification.
- `src/routes/report.$queryId.tsx` — render `ExpertAnswerSection` with anchors `#expert-analysis` and `#expert-video`.
- `src/pages/MyQueries.tsx` — answer status badges + deep-link buttons.

## Files NOT touched (preservation list confirmed)
`src/lib/report.functions.ts`, `supabase/functions/{generate-ai-report,gemini-analysis,fetch-stock-data}/`, `src/contexts/AuthContext.tsx`, `src/integrations/supabase/auth-{middleware,attacher}.ts`, `src/router.tsx`, `src/server.ts`, `src/start.ts`. Existing rows in `analyst_profiles`, `queries`, `answers`, `ai_reports`, `profiles`, `user_roles` left intact.

---

## Key implementation notes

- **No hardcoded admin creds anywhere.** Bootstrap function reads from Edge Function secrets only; idempotent via `SELECT 1 FROM user_roles WHERE role='admin' LIMIT 1`.
- **All admin table access from frontend goes through serverFns** that gate on `has_role(uid,'admin')` and use `supabaseAdmin`. Service role key never reaches browser.
- **Audit events** inserted explicitly inside every privileged handler (admin approve/reject/suspend/assign/wallet-adjust + analyst publish text/video + bootstrap). `event_type` + `payload.action` per spec.
- **Analyst approve flow**: upserts `user_roles` row `('analyst')` with `ON CONFLICT (user_id, role) DO NOTHING`; user keeps existing `'user'` role. Reject deletes only the `'analyst'` row.
- **Answer upsert**: relies on the partial unique index `(query_id, expert_id, answer_type) WHERE is_published=false` so Save Draft = `INSERT ... ON CONFLICT DO UPDATE`.
- **Status transitions**: `queries.status` flips to `expert_answered` on first published answer; subsequent publishes don't downgrade.
- **Verdict color map** shared between analyst picker and `ExpertAnswerSection` (single constant in `@/lib/verdict.ts`).

## After Lovable applies (manual steps user does)
1. Supabase dashboard → Edge Functions → Secrets: add `ADMIN_EMAIL` + `ADMIN_INITIAL_PASSWORD`.
2. Invoke `bootstrap-admin` once (any HTTP client).
3. Delete `ADMIN_INITIAL_PASSWORD` secret.
4. Log in at `/admin/login`, rotate password.

---

## Open question before I build

Reply **"apply"** to proceed and I'll create all migrations + files in one batch. If you want any tweak (e.g. keep bucket private vs public, different verdict labels, different word-count bounds), say so now.
