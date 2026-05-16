CREATE OR REPLACE FUNCTION public.deduct_wallet_balance(
  _user_id UUID,
  _amount INTEGER,
  _description TEXT,
  _query_id UUID DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance INTEGER;
  _new_balance INTEGER;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  SELECT wallet_balance INTO _current_balance
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF _current_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;

  IF _current_balance < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance', 'balance', _current_balance);
  END IF;

  _new_balance := _current_balance - _amount;

  UPDATE public.profiles
  SET wallet_balance = _new_balance, updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.wallet_transactions (user_id, amount, type, description, balance_after, query_id)
  VALUES (_user_id, -_amount, 'debit', _description, _new_balance, _query_id);

  RETURN json_build_object('success', true, 'new_balance', _new_balance);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deduct_wallet_balance(UUID, INTEGER, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_wallet_balance(UUID, INTEGER, TEXT, UUID) TO authenticated;