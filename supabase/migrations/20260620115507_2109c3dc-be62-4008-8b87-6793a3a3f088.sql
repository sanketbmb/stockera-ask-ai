
CREATE OR REPLACE FUNCTION public.wallet_apply_debit(p_user_id uuid, p_action_key text, p_points integer, p_query_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_balance bigint; v_entry_type text; v_existing_id uuid; v_new_id uuid;
  v_promo_cfg jsonb; v_promo_active boolean; v_promo_cap integer; v_promo_used integer;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'p_user_id is required'; END IF;
  IF p_points IS NULL OR p_points <= 0 THEN RAISE EXCEPTION 'p_points must be positive (got %)', p_points; END IF;
  v_entry_type := CASE p_action_key
    WHEN 'ai_report' THEN 'debit_ai_report'
    WHEN 'video_answer' THEN 'debit_video_answer'
    WHEN 'live_session' THEN 'debit_live_session'
    WHEN 'sector_view' THEN 'debit_sector_view'
    WHEN 'stock_picker' THEN 'debit_stock_picker'
    WHEN 'followup_open' THEN 'debit_followup_open'
    ELSE NULL END;
  IF v_entry_type IS NULL THEN RAISE EXCEPTION 'unknown action_key: %', p_action_key; END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.wallet_ledger WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('status','idempotent_replay','entry_id',v_existing_id);
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(42001, (abs(hashtextextended(p_user_id::text, 0)) % 2147483647)::int);
  SELECT COALESCE(SUM(amount), 0) INTO v_balance FROM public.wallet_ledger WHERE user_id = p_user_id;
  IF v_balance < p_points THEN
    RETURN jsonb_build_object('status','insufficient_funds','balance',v_balance,'required',p_points);
  END IF;
  IF p_action_key = 'video_answer' THEN
    SELECT config_value INTO v_promo_cfg FROM public.stock_picker_runtime_config WHERE config_key = 'video_answer_promo' FOR UPDATE;
    IF v_promo_cfg IS NOT NULL THEN
      v_promo_active := COALESCE((v_promo_cfg->>'promo_active')::boolean, false);
      v_promo_cap := COALESCE((v_promo_cfg->>'redemptions_cap')::integer, 0);
      v_promo_used := COALESCE((v_promo_cfg->>'redemptions_used')::integer, 0);
      IF v_promo_active AND v_promo_used < v_promo_cap THEN
        UPDATE public.stock_picker_runtime_config
          SET config_value = jsonb_set(config_value,'{redemptions_used}',to_jsonb(v_promo_used + 1),false), updated_at = now()
          WHERE config_key = 'video_answer_promo';
        IF v_promo_used + 1 >= v_promo_cap THEN
          UPDATE public.stock_picker_runtime_config
            SET config_value = jsonb_set(config_value,'{promo_active}','false'::jsonb,false), updated_at = now()
            WHERE config_key = 'video_answer_promo';
        END IF;
      END IF;
    END IF;
  END IF;
  INSERT INTO public.wallet_ledger
    (user_id, entry_type, amount, source, query_type, query_id, idempotency_key, metadata)
  VALUES
    (p_user_id, v_entry_type, -p_points, p_action_key, p_action_key, p_query_id, p_idempotency_key,
     jsonb_build_object('debited_at', now()))
  RETURNING id INTO v_new_id;
  RETURN jsonb_build_object('status','ok','entry_id',v_new_id,'new_balance', v_balance - p_points);
END;
$function$;

CREATE OR REPLACE FUNCTION public.credit_wallet_topup(
  p_user_id uuid, p_points int, p_source text,
  p_idempotency_key text, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public','pg_temp' AS $$
DECLARE v_existing uuid; v_balance bigint; v_new uuid;
BEGIN
  IF p_user_id IS NULL OR p_points IS NULL OR p_points <= 0
     OR p_source IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid args';
  END IF;
  PERFORM pg_advisory_xact_lock(42001, (abs(hashtextextended(p_user_id::text, 0)) % 2147483647)::int);
  SELECT id INTO v_existing FROM public.wallet_ledger WHERE idempotency_key = p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_balance FROM public.wallet_ledger WHERE user_id = p_user_id;
    RETURN jsonb_build_object('status','idempotent_replay','new_balance',v_balance);
  END IF;
  INSERT INTO public.wallet_ledger
    (user_id, entry_type, amount, source, idempotency_key, metadata)
  VALUES (p_user_id, 'topup', p_points, p_source, p_idempotency_key, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_new;
  SELECT COALESCE(SUM(amount), 0) INTO v_balance FROM public.wallet_ledger WHERE user_id = p_user_id;
  RETURN jsonb_build_object('status','ok','entry_id',v_new,'new_balance',v_balance);
END;$$;
REVOKE ALL ON FUNCTION public.credit_wallet_topup(uuid,int,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_wallet_topup(uuid,int,text,text,jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.credit_wallet_topup(uuid,int,text,text,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet_topup(uuid,int,text,text,jsonb) TO service_role;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS founder_beta boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.wallet_debit_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  assistant_row_id uuid,
  query_id uuid,
  action_key text NOT NULL,
  points_attempted integer NOT NULL,
  rpc_status text NOT NULL,
  rpc_payload jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_debit_failures TO authenticated;
GRANT ALL    ON public.wallet_debit_failures TO service_role;
ALTER TABLE public.wallet_debit_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own debit failures" ON public.wallet_debit_failures;
CREATE POLICY "users read own debit failures"
  ON public.wallet_debit_failures FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS wallet_debit_failures_user_idx
  ON public.wallet_debit_failures (user_id, created_at DESC);

INSERT INTO public.stock_picker_runtime_config (config_key, kind, config_value, description)
VALUES ('demo_topup', 'enable_flag', '{"enabled":true}'::jsonb, 'Stage 3A demo: enables founder_beta demo top-up via demo-topup-credit edge function')
ON CONFLICT (config_key) DO NOTHING;
