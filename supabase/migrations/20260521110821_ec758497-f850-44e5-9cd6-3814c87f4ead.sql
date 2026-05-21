
-- 1. Audit events: require authenticated + actor_id = auth.uid()
DROP POLICY IF EXISTS "audit_events_authenticated_insert" ON public.audit_events;
CREATE POLICY "audit_events_authenticated_insert"
ON public.audit_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = actor_id);

-- 2. Grievances: stricter insert
DROP POLICY IF EXISTS "grievances_public_insert" ON public.grievances;
CREATE POLICY "grievances_anon_insert"
ON public.grievances
FOR INSERT
TO anon
WITH CHECK (
  user_id IS NULL
  AND (
    against_analyst_id IS NULL
    OR EXISTS (SELECT 1 FROM public.analyst_profiles ap WHERE ap.id = against_analyst_id)
  )
);

CREATE POLICY "grievances_auth_insert"
ON public.grievances
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    against_analyst_id IS NULL
    OR EXISTS (SELECT 1 FROM public.analyst_profiles ap WHERE ap.id = against_analyst_id)
  )
);

-- 3. Queries analyst queue: restrict to admin only; analysts use queries_analyst_read for assigned
DROP POLICY IF EXISTS "queries_analyst_queue" ON public.queries;
CREATE POLICY "queries_admin_read_all"
ON public.queries
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. user_roles: restrictive policy to block non-admin inserts/updates/deletes
CREATE POLICY "user_roles_block_non_admin_writes"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. Revoke EXECUTE on has_role from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
