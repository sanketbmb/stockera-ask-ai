-- Allow authenticated and anon roles to INSERT into pdf_generation_log.
-- The table is append-only logging; service_role already bypasses RLS,
-- but this lets server functions log even when running through the
-- user-scoped auth client. No SELECT/UPDATE/DELETE access is granted
-- to non-admins (existing pdf_log_admin_select policy remains).
GRANT INSERT ON public.pdf_generation_log TO anon, authenticated;

DROP POLICY IF EXISTS "pdf_log_insert_any" ON public.pdf_generation_log;
CREATE POLICY "pdf_log_insert_any"
ON public.pdf_generation_log
FOR INSERT
TO anon, authenticated
WITH CHECK (true);