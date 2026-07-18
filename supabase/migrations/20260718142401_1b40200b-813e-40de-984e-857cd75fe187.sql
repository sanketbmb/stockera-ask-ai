
-- Trigger: block non-admin writes to sensitive profile columns
CREATE OR REPLACE FUNCTION public.fn_profiles_guard_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  -- service_role / superuser bypass (auth.uid() is NULL for service_role)
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.has_role(v_uid, 'admin');
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
    RAISE EXCEPTION 'wallet_balance can only be modified by privileged server functions'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'is_verified can only be modified by admins' USING ERRCODE = '42501';
  END IF;
  IF NEW.founder_beta IS DISTINCT FROM OLD.founder_beta THEN
    RAISE EXCEPTION 'founder_beta can only be modified by admins' USING ERRCODE = '42501';
  END IF;
  IF NEW.sebi_reg_number IS DISTINCT FROM OLD.sebi_reg_number THEN
    RAISE EXCEPTION 'sebi_reg_number can only be modified by admins' USING ERRCODE = '42501';
  END IF;
  IF NEW.sebi_type IS DISTINCT FROM OLD.sebi_type THEN
    RAISE EXCEPTION 'sebi_type can only be modified by admins' USING ERRCODE = '42501';
  END IF;
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'referred_by is immutable after signup' USING ERRCODE = '42501';
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'referral_code is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_sensitive_columns_trg ON public.profiles;
CREATE TRIGGER profiles_guard_sensitive_columns_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.fn_profiles_guard_sensitive_columns();

-- Trigger: block non-admin writes to sensitive analyst_profiles columns
CREATE OR REPLACE FUNCTION public.fn_analyst_profiles_guard_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.has_role(v_uid, 'admin');
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    RAISE EXCEPTION 'is_approved can only be modified by admins' USING ERRCODE = '42501';
  END IF;
  IF NEW.sebi_reg_number IS DISTINCT FROM OLD.sebi_reg_number THEN
    RAISE EXCEPTION 'sebi_reg_number can only be modified by admins' USING ERRCODE = '42501';
  END IF;
  IF NEW.sebi_type IS DISTINCT FROM OLD.sebi_type THEN
    RAISE EXCEPTION 'sebi_type can only be modified by admins' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS analyst_profiles_guard_sensitive_columns_trg ON public.analyst_profiles;
CREATE TRIGGER analyst_profiles_guard_sensitive_columns_trg
BEFORE UPDATE ON public.analyst_profiles
FOR EACH ROW
EXECUTE FUNCTION public.fn_analyst_profiles_guard_sensitive_columns();
