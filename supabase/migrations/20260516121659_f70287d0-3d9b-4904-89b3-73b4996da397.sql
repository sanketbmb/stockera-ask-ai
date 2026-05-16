CREATE OR REPLACE FUNCTION public.add_demo_credits(_amount INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _new_bal INTEGER;
BEGIN
  IF _uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid amount');
  END IF;
  IF _amount > 500 THEN
    RETURN json_build_object('success', false, 'error', 'Demo limit ₹500');
  END IF;

  UPDATE public.profiles
  SET wallet_balance = wallet_balance + _amount, updated_at = now()
  WHERE id = _uid
  RETURNING wallet_balance INTO _new_bal;

  INSERT INTO public.wallet_transactions (user_id, amount, type, description, balance_after)
  VALUES (_uid, _amount, 'credit', 'Demo credit top-up', _new_bal);

  RETURN json_build_object('success', true, 'new_balance', _new_bal);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_demo_credits(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_demo_credits(INTEGER) TO authenticated;