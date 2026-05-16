
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
    CASE WHEN _amount >= 0 THEN 'credit'::wallet_tx_type ELSE 'debit'::wallet_tx_type END,
    'Admin adjustment: ' || COALESCE(_reason, 'no reason'),
    _new_bal
  );

  RETURN json_build_object('success', true, 'new_balance', _new_bal);
END;
$$;
