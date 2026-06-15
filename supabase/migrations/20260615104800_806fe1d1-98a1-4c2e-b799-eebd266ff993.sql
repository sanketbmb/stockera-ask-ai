-- W1 — Points economy + analytics + subscriptions
-- Additive only. Legacy wallet remains untouched in W1.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-------------------------------------------------------------------------------
-- SECTION 1 — TABLES
-------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_type      text NOT NULL CHECK (entry_type IN (
                    'welcome_bonus','welcome_expired','topup','topup_bonus',
                    'first_topup_free_video','subscription_grant','subscription_rollover_capped',
                    'referral_referrer','referral_referee',
                    'debit_ai_report','debit_video_answer','debit_live_session',
                    'debit_sector_view','debit_stock_picker',
                    'admin_grant','admin_revoke','refund_quality','refund_failed_action'
                  )),
  amount          integer NOT NULL,
  source          text,
  query_type      text,
  query_id        uuid,
  expiry_at       timestamptz,
  idempotency_key text UNIQUE,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id   text NOT NULL,
  event_name   text NOT NULL,
  event_props  jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent   text,
  ip_hash      text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id                  text PRIMARY KEY,
  display_name        text NOT NULL,
  monthly_inr         integer NOT NULL,
  annual_inr          integer NOT NULL,
  monthly_points      integer NOT NULL,
  rollover_cap_points integer NOT NULL,
  free_video_count    integer NOT NULL DEFAULT 0,
  free_live_count     integer NOT NULL DEFAULT 0,
  perks               jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                  text NOT NULL REFERENCES public.subscription_plans(id),
  billing_cycle            text NOT NULL CHECK (billing_cycle IN ('monthly','annual')),
  status                   text NOT NULL CHECK (status IN ('active','cancelled','past_due','trialing')) DEFAULT 'active',
  current_period_start     timestamptz NOT NULL,
  current_period_end       timestamptz NOT NULL,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  razorpay_subscription_id text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.points_expiry_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points_expired  integer NOT NULL CHECK (points_expired > 0),
  reason          text NOT NULL,
  source_entry_id uuid REFERENCES public.wallet_ledger(id),
  expired_at      timestamptz NOT NULL DEFAULT now()
);

-------------------------------------------------------------------------------
-- SECTION 2 — VIEW
-------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.wallet_balances
WITH (security_invoker = true) AS
SELECT
  l.user_id,
  COALESCE(SUM(l.amount), 0)::bigint AS balance,
  COALESCE(SUM(
    CASE WHEN l.entry_type = 'welcome_bonus' AND l.expiry_at IS NOT NULL AND l.expiry_at > now()
         THEN l.amount ELSE 0 END
  ), 0)::bigint AS welcome_bonus_remaining,
  MIN(
    CASE WHEN l.entry_type = 'welcome_bonus' AND l.expiry_at IS NOT NULL AND l.expiry_at > now()
         THEN l.expiry_at ELSE NULL END
  ) AS welcome_bonus_expires_at,
  MAX(l.created_at) AS last_ledger_at
FROM public.wallet_ledger l
GROUP BY l.user_id;

COMMENT ON VIEW public.wallet_balances IS
'Per-user point balance computed from append-only wallet_ledger. Security invoker enabled.';

-------------------------------------------------------------------------------
-- SECTION 3 — APPEND-ONLY TRIGGER FUNCTION + TRIGGERS
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wallet_ledger_block_modify()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledger is append-only — UPDATE/DELETE not permitted (op=%)', TG_OP;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'wallet_ledger_no_update_trg' AND tgrelid = 'public.wallet_ledger'::regclass) THEN
    CREATE TRIGGER wallet_ledger_no_update_trg BEFORE UPDATE ON public.wallet_ledger
      FOR EACH ROW EXECUTE FUNCTION public.wallet_ledger_block_modify();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'wallet_ledger_no_delete_trg' AND tgrelid = 'public.wallet_ledger'::regclass) THEN
    CREATE TRIGGER wallet_ledger_no_delete_trg BEFORE DELETE ON public.wallet_ledger
      FOR EACH ROW EXECUTE FUNCTION public.wallet_ledger_block_modify();
  END IF;
END $$;

-------------------------------------------------------------------------------
-- SECTION 4 — RPCs (advisory lock namespaces 42001–42099)
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wallet_apply_debit(
  p_user_id uuid, p_action_key text, p_points integer,
  p_query_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
    ELSE NULL END;
  IF v_entry_type IS NULL THEN RAISE EXCEPTION 'unknown action_key: %', p_action_key; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.wallet_ledger WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('status','idempotent_replay','entry_id',v_existing_id);
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(42001, hashtextextended(p_user_id::text, 0)::int);

  SELECT COALESCE(SUM(amount),0) INTO v_balance FROM public.wallet_ledger WHERE user_id = p_user_id;
  IF v_balance < p_points THEN
    RETURN jsonb_build_object('status','insufficient_funds','balance',v_balance,'required',p_points);
  END IF;

  IF p_action_key = 'video_answer' THEN
    SELECT config_value INTO v_promo_cfg FROM public.stock_picker_runtime_config
      WHERE config_key = 'video_answer_promo' FOR UPDATE;
    IF v_promo_cfg IS NOT NULL THEN
      v_promo_active := COALESCE((v_promo_cfg->>'promo_active')::boolean, false);
      v_promo_cap := COALESCE((v_promo_cfg->>'redemptions_cap')::integer, 0);
      v_promo_used := COALESCE((v_promo_cfg->>'redemptions_used')::integer, 0);
      IF v_promo_active AND v_promo_used < v_promo_cap THEN
        UPDATE public.stock_picker_runtime_config
          SET config_value = jsonb_set(config_value,'{redemptions_used}',to_jsonb(v_promo_used + 1),false),
              updated_at = now()
          WHERE config_key = 'video_answer_promo';
        IF v_promo_used + 1 >= v_promo_cap THEN
          UPDATE public.stock_picker_runtime_config
            SET config_value = jsonb_set(config_value,'{promo_active}','false'::jsonb,false),
                updated_at = now()
            WHERE config_key = 'video_answer_promo';
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.wallet_ledger (user_id,entry_type,amount,source,query_type,query_id,idempotency_key,metadata)
  VALUES (p_user_id, v_entry_type, -p_points, p_action_key, p_action_key, p_query_id, p_idempotency_key,
          jsonb_build_object('debited_at', now()))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('status','ok','entry_id',v_new_id,'new_balance',v_balance - p_points);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wallet_apply_debit(uuid,text,integer,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.wallet_apply_debit(uuid,text,integer,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.grant_welcome_bonus(p_user_id uuid, p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_amount integer; v_expiry_days integer; v_already_user uuid; v_already_phone uuid; v_new_id uuid; v_cfg jsonb;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('status','skipped','reason','no_user'); END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RETURN jsonb_build_object('status','skipped','reason','no_phone'); END IF;

  PERFORM pg_advisory_xact_lock(42002, hashtextextended('welcome:' || p_phone, 0)::int);

  SELECT config_value INTO v_cfg FROM public.stock_picker_runtime_config WHERE config_key = 'welcome_bonus';
  v_amount      := COALESCE((v_cfg->>'points')::integer, 250);
  v_expiry_days := COALESCE((v_cfg->>'expiry_days')::integer, 30);

  SELECT id INTO v_already_user FROM public.wallet_ledger
    WHERE user_id = p_user_id AND entry_type = 'welcome_bonus' LIMIT 1;
  IF v_already_user IS NOT NULL THEN
    RETURN jsonb_build_object('status','skipped','reason','already_granted_user');
  END IF;

  SELECT l.id INTO v_already_phone FROM public.wallet_ledger l
    JOIN public.profiles p ON p.id = l.user_id
    WHERE l.entry_type = 'welcome_bonus' AND p.phone = p_phone LIMIT 1;
  IF v_already_phone IS NOT NULL THEN
    RETURN jsonb_build_object('status','skipped','reason','already_granted_phone');
  END IF;

  INSERT INTO public.wallet_ledger (user_id,entry_type,amount,source,expiry_at,idempotency_key,metadata)
  VALUES (p_user_id, 'welcome_bonus', v_amount, 'signup',
          now() + make_interval(days => v_expiry_days),
          'welcome:' || p_user_id::text,
          jsonb_build_object('phone', p_phone, 'expiry_days', v_expiry_days))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('status','ok','entry_id',v_new_id,'points',v_amount);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_welcome_bonus(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_welcome_bonus(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.grant_first_topup_bonus(p_user_id uuid, p_topup_amount_inr integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cfg jsonb; v_min integer; v_window_hrs integer; v_active boolean; v_free_video boolean;
  v_video_points integer; v_signup_at timestamptz; v_already uuid; v_new_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('status','skipped','reason','no_user'); END IF;

  SELECT config_value INTO v_cfg FROM public.stock_picker_runtime_config WHERE config_key = 'first_topup_bonus';
  IF v_cfg IS NULL THEN RETURN jsonb_build_object('status','skipped','reason','no_config'); END IF;

  v_active     := COALESCE((v_cfg->>'active')::boolean, false);
  v_min        := COALESCE((v_cfg->>'min_topup_inr')::integer, 500);
  v_window_hrs := COALESCE((v_cfg->>'within_hours')::integer, 24);
  v_free_video := COALESCE((v_cfg->>'free_video')::boolean, true);

  IF NOT v_active OR NOT v_free_video THEN RETURN jsonb_build_object('status','skipped','reason','disabled'); END IF;
  IF p_topup_amount_inr < v_min THEN RETURN jsonb_build_object('status','skipped','reason','below_threshold'); END IF;

  SELECT created_at INTO v_signup_at FROM auth.users WHERE id = p_user_id;
  IF v_signup_at IS NULL OR v_signup_at < now() - make_interval(hours => v_window_hrs) THEN
    RETURN jsonb_build_object('status','skipped','reason','outside_window');
  END IF;

  SELECT id INTO v_already FROM public.wallet_ledger
    WHERE user_id = p_user_id AND entry_type = 'first_topup_free_video' LIMIT 1;
  IF v_already IS NOT NULL THEN RETURN jsonb_build_object('status','skipped','reason','already_granted'); END IF;

  SELECT COALESCE((config_value->'video_answer'->>'points')::integer, 499)
    INTO v_video_points FROM public.stock_picker_runtime_config WHERE config_key = 'action_costs';

  INSERT INTO public.wallet_ledger (user_id,entry_type,amount,source,idempotency_key,metadata)
  VALUES (p_user_id, 'first_topup_free_video', v_video_points, 'first_topup_promo',
          'first_topup_free_video:' || p_user_id::text,
          jsonb_build_object('topup_inr', p_topup_amount_inr))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('status','ok','entry_id',v_new_id,'points',v_video_points);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_first_topup_bonus(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_first_topup_bonus(uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_welcome_bonus(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row record; v_balance bigint; v_to_expire bigint;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('status','skipped','reason','no_user'); END IF;

  PERFORM pg_advisory_xact_lock(42003, hashtextextended('expire:' || p_user_id::text, 0)::int);

  FOR v_row IN
    SELECT id, amount, expiry_at FROM public.wallet_ledger wl
    WHERE wl.user_id = p_user_id AND wl.entry_type = 'welcome_bonus'
      AND wl.expiry_at IS NOT NULL AND wl.expiry_at <= now()
      AND NOT EXISTS (SELECT 1 FROM public.points_expiry_log e WHERE e.source_entry_id = wl.id)
  LOOP
    SELECT COALESCE(SUM(amount),0) INTO v_balance FROM public.wallet_ledger WHERE user_id = p_user_id;
    v_to_expire := LEAST(v_row.amount, GREATEST(0, v_balance));
    IF v_to_expire > 0 THEN
      INSERT INTO public.wallet_ledger (user_id,entry_type,amount,source,idempotency_key,metadata)
      VALUES (p_user_id,'welcome_expired',-v_to_expire,'welcome_bonus_30d',
              'welcome_expired:' || v_row.id::text,
              jsonb_build_object('source_entry_id', v_row.id));
      INSERT INTO public.points_expiry_log (user_id,points_expired,reason,source_entry_id)
      VALUES (p_user_id, v_to_expire, 'welcome_bonus_30d', v_row.id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('status','ok');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_welcome_bonus(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_welcome_bonus(uuid) TO service_role;

-------------------------------------------------------------------------------
-- SECTION 5 — PROFILES TRIGGER
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profiles_grant_welcome_on_phone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND length(trim(NEW.phone)) > 0 THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.phone IS DISTINCT FROM NEW.phone) THEN
      PERFORM public.grant_welcome_bonus(NEW.id, NEW.phone);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_welcome_bonus_trg' AND tgrelid = 'public.profiles'::regclass) THEN
    CREATE TRIGGER profiles_welcome_bonus_trg
      AFTER INSERT OR UPDATE OF phone ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.profiles_grant_welcome_on_phone();
  END IF;
END $$;

-------------------------------------------------------------------------------
-- SECTION 6 — CONFIG SEEDS (kinds mapped to existing CHECK: enable_flag/threshold/operational/identifier)
-------------------------------------------------------------------------------

INSERT INTO public.stock_picker_runtime_config (config_key, kind, config_value, description, updated_at)
VALUES
  ('paywall_v1_enabled','enable_flag','false'::jsonb,
   'W1: master paywall flag — ship dark. Flip to true when ready to gate QueryForm.', now()),
  ('sebi_ra_registration','identifier','"INH000019071"'::jsonb,
   'W1: SEBI Research Analyst registration. Single source of truth for ribbon.', now()),
  ('action_costs','threshold',
   '{"ai_report":{"points":50},"video_answer":{"points":499},"live_session":{"points":999},"sector_view":{"points":30},"educational":{"points":0},"stock_picker":{"points":80}}'::jsonb,
   'W1: per-action point costs. 1 point = ₹1.', now()),
  ('topup_tiers','threshold',
   '{"tiers":[{"amount_inr":100,"credits":100,"bonus_credits":0,"label":"Starter"},{"amount_inr":250,"credits":250,"bonus_credits":25,"label":"Popular"},{"amount_inr":500,"credits":500,"bonus_credits":75,"label":"Best Value"},{"amount_inr":1000,"credits":1000,"bonus_credits":150,"label":"Power"}],"custom":{"min_inr":50,"max_inr":10000,"ratio":1}}'::jsonb,
   'W1: top-up tiers. Custom range 50–10000 INR at 1:1.', now()),
  ('welcome_bonus','threshold',
   '{"points":250,"expiry_days":30,"one_per_phone":true}'::jsonb,
   'W1: signup welcome bonus. Granted via profiles_welcome_bonus_trg.', now()),
  ('first_topup_bonus','operational',
   '{"active":true,"min_topup_inr":500,"within_hours":24,"free_video":true}'::jsonb,
   'W1: first-video-FREE if user tops up ≥₹500 within 24h of signup.', now()),
  ('video_answer_promo','operational',
   '{"promo_active":false,"promo_price_points":249,"regular_price_points":499,"redemptions_cap":100,"redemptions_used":0,"promo_ends_at":null,"label":"Launch offer"}'::jsonb,
   'W1: video answer launch promo. Founder flips promo_active=true on launch day.', now()),
  ('pro_launch_promo','operational',
   '{"promo_active":false,"promo_first_month_inr":149,"regular_first_month_inr":299,"redemptions_cap":200,"redemptions_used":0,"promo_ends_at":null}'::jsonb,
   'W1: Pro plan first-month launch discount. Founder flips on launch day.', now()),
  ('expert_launch_promo','operational',
   '{"promo_active":false,"promo_first_month_inr":399,"regular_first_month_inr":799,"redemptions_cap":50,"redemptions_used":0,"promo_ends_at":null}'::jsonb,
   'W1: Expert plan first-month launch discount. Founder flips on launch day.', now()),
  ('referral_config','operational',
   '{"active":false,"referrer_reward_points":50,"referee_signup_bonus_points":50,"cap_per_referrer":50,"one_referral_per_referee_phone":true,"trigger":"referee_first_debit"}'::jsonb,
   'W1: referral economics seed. Backend in W8.', now()),
  ('preferred_language_options','identifier','["en","hinglish","hi"]'::jsonb,
   'W1: future i18n options. Wired up in W6.5. Default = en.', now()),
  ('seo_config','identifier',
   '{"site_name":"Stockera","default_og_image_url":null,"twitter_handle":null,"production_domain":null,"tagline_en":"AI + SEBI-registered analyst answers for every Indian stock"}'::jsonb,
   'W1: SEO/OG metadata config. Populated in W3 (technical SEO foundation).', now())
ON CONFLICT (config_key) DO UPDATE
SET config_value = EXCLUDED.config_value,
    description  = EXCLUDED.description,
    updated_at   = now();

INSERT INTO public.subscription_plans (id,display_name,monthly_inr,annual_inr,monthly_points,rollover_cap_points,free_video_count,free_live_count,perks,sort_order)
VALUES
  ('free','Free',0,0,0,0,0,0,
   '["250 welcome points (30-day expiry)", "5 AI reports to start", "Community support"]'::jsonb, 10),
  ('pro','Pro',299,2699,400,800,1,0,
   '["400 points every month","Rollover up to 800 points","1 free video answer per month","Priority queue","PDF download","WhatsApp alerts"]'::jsonb, 20),
  ('expert','Expert',799,7199,1200,2400,2,1,
   '["1,200 points every month","Rollover up to 2,400 points","2 free video answers per month","1 free live session per month","Dedicated analyst","Same-day SLA"]'::jsonb, 30)
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    monthly_inr = EXCLUDED.monthly_inr,
    annual_inr = EXCLUDED.annual_inr,
    monthly_points = EXCLUDED.monthly_points,
    rollover_cap_points = EXCLUDED.rollover_cap_points,
    free_video_count = EXCLUDED.free_video_count,
    free_live_count = EXCLUDED.free_live_count,
    perks = EXCLUDED.perks,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-------------------------------------------------------------------------------
-- SECTION 7 — RLS
-------------------------------------------------------------------------------

ALTER TABLE public.wallet_ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_expiry_log  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='wallet_ledger' AND policyname='wallet_ledger_select_own') THEN
    CREATE POLICY wallet_ledger_select_own ON public.wallet_ledger
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='analytics_events' AND policyname='analytics_events_insert_own') THEN
    CREATE POLICY analytics_events_insert_own ON public.analytics_events
      FOR INSERT TO authenticated, anon WITH CHECK (user_id IS NULL OR user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='analytics_events' AND policyname='analytics_events_select_own') THEN
    CREATE POLICY analytics_events_select_own ON public.analytics_events
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='subscription_plans' AND policyname='subscription_plans_read_active') THEN
    CREATE POLICY subscription_plans_read_active ON public.subscription_plans
      FOR SELECT TO authenticated, anon USING (is_active = true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_subscriptions' AND policyname='user_subscriptions_select_own') THEN
    CREATE POLICY user_subscriptions_select_own ON public.user_subscriptions
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='points_expiry_log' AND policyname='points_expiry_log_select_own') THEN
    CREATE POLICY points_expiry_log_select_own ON public.points_expiry_log
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-------------------------------------------------------------------------------
-- SECTION 8 — INDEXES
-------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS wallet_ledger_user_created_idx ON public.wallet_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_ledger_entry_type_idx  ON public.wallet_ledger (entry_type);
CREATE INDEX IF NOT EXISTS wallet_ledger_query_id_idx    ON public.wallet_ledger (query_id) WHERE query_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_ledger_expiry_idx      ON public.wallet_ledger (expiry_at) WHERE expiry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_events_user_created_idx ON public.analytics_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx      ON public.analytics_events (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_idx         ON public.analytics_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS user_subscriptions_user_status_idx ON public.user_subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS user_subscriptions_period_end_idx  ON public.user_subscriptions (current_period_end);

CREATE INDEX IF NOT EXISTS points_expiry_log_user_idx ON public.points_expiry_log (user_id, expired_at DESC);