
-- 1. Grievances: remove analyst access to complainant PII
DROP POLICY IF EXISTS "grievances_analyst_select" ON public.grievances;

-- 2. Referrals: allow referred user to view their record
CREATE POLICY "referrals_referred_select" ON public.referrals
  FOR SELECT TO authenticated
  USING (auth.uid() = referred_id);

-- 3. Payments: tighten insert policy
DROP POLICY IF EXISTS "payments_own_insert" ON public.payments;
CREATE POLICY "payments_own_insert" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND amount_paise > 0
    AND amount_paise <= 100000
    AND purpose IN ('video_answer')
    AND status IN ('pending', 'paid')
  );

-- 4. Audit events: explicit restrictive deny for non-admin update/delete
CREATE POLICY "audit_events_no_update_non_admin" ON public.audit_events
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "audit_events_no_delete_non_admin" ON public.audit_events
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
