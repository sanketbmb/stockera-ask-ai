
-- ============ Admin full access policies (idempotent) ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','user_roles','queries','analyst_profiles','answers',
    'wallet_transactions','referrals','ai_reports','audit_events',
    'grievances','user_portfolio','notifications'
  ] LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "admin_full_access" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role))',
        t
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ============ Answers: compliance fields + draft uniqueness ============
ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS verdict       TEXT,
  ADD COLUMN IF NOT EXISTS key_level     TEXT,
  ADD COLUMN IF NOT EXISTS time_horizon  TEXT,
  ADD COLUMN IF NOT EXISTS risk_note     TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS answers_one_draft_per_expert_per_query
  ON public.answers (query_id, expert_id, answer_type)
  WHERE is_published = false;

-- ============ Storage policies for expert-videos (bucket already exists, public) ============
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "expert_videos_analyst_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''expert-videos'' AND auth.uid()::text = (storage.foldername(name))[1])';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    EXECUTE 'CREATE POLICY "expert_videos_analyst_update_own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''expert-videos'' AND auth.uid()::text = (storage.foldername(name))[1])';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    EXECUTE 'CREATE POLICY "expert_videos_admin_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''expert-videos'' AND public.has_role(auth.uid(), ''admin''::public.app_role))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
