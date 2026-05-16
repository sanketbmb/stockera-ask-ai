
-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('expert-videos', 'expert-videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies
DROP POLICY IF EXISTS "expert_videos_public_read" ON storage.objects;
CREATE POLICY "expert_videos_public_read" ON storage.objects FOR SELECT
USING (bucket_id = 'expert-videos');

DROP POLICY IF EXISTS "expert_videos_analyst_insert" ON storage.objects;
CREATE POLICY "expert_videos_analyst_insert" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'expert-videos'
  AND (public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin'))
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "expert_videos_owner_update" ON storage.objects;
CREATE POLICY "expert_videos_owner_update" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'expert-videos'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
);

DROP POLICY IF EXISTS "expert_videos_owner_delete" ON storage.objects;
CREATE POLICY "expert_videos_owner_delete" ON storage.objects FOR DELETE
USING (
  bucket_id = 'expert-videos'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
);

-- Query policies
DROP POLICY IF EXISTS "queries_analyst_queue" ON public.queries;
CREATE POLICY "queries_analyst_queue" ON public.queries FOR SELECT
USING (public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "queries_analyst_update" ON public.queries;
CREATE POLICY "queries_analyst_update" ON public.queries FOR UPDATE
USING (auth.uid() = assigned_analyst_id OR public.has_role(auth.uid(), 'admin'));

-- Admin policies
DROP POLICY IF EXISTS "analyst_profiles_admin_all" ON public.analyst_profiles;
CREATE POLICY "analyst_profiles_admin_all" ON public.analyst_profiles FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_admin_read" ON public.user_roles;
CREATE POLICY "user_roles_admin_read" ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_admin_manage" ON public.user_roles;
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "profiles_admin_read" ON public.profiles;
CREATE POLICY "profiles_admin_read" ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "wallet_admin_read" ON public.wallet_transactions;
CREATE POLICY "wallet_admin_read" ON public.wallet_transactions FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Admin wallet adjust RPC
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(
  _target_user_id UUID,
  _amount INTEGER,
  _reason TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _new_bal INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF _amount IS NULL OR _amount = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  UPDATE public.profiles
  SET wallet_balance = wallet_balance + _amount, updated_at = now()
  WHERE id = _target_user_id
  RETURNING wallet_balance INTO _new_bal;

  IF _new_bal IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  INSERT INTO public.wallet_transactions (user_id, amount, type, description, balance_after)
  VALUES (
    _target_user_id,
    _amount,
    CASE WHEN _amount >= 0 THEN 'credit'::transaction_type ELSE 'debit'::transaction_type END,
    'Admin adjustment: ' || COALESCE(_reason, 'no reason'),
    _new_bal
  );

  RETURN json_build_object('success', true, 'new_balance', _new_bal);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_wallet(UUID, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_wallet(UUID, INTEGER, TEXT) TO authenticated;
