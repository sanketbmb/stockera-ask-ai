-- M1
ALTER TABLE public.stock_picker_pick_audit
  ADD COLUMN IF NOT EXISTS was_incumbent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_top_pick   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS persistence_reason text NULL;

ALTER TABLE public.stock_picker_pick_audit
  DROP CONSTRAINT IF EXISTS stock_picker_pick_audit_persistence_reason_chk;
ALTER TABLE public.stock_picker_pick_audit
  ADD CONSTRAINT stock_picker_pick_audit_persistence_reason_chk
  CHECK (persistence_reason IS NULL OR persistence_reason IN (
    'new_entry','incumbent_within_band','incumbent_tenure_hold','evicted_churn_cap'
  ));

CREATE INDEX IF NOT EXISTS idx_pick_audit_batch_top
  ON public.stock_picker_pick_audit(batch_id) WHERE is_top_pick = true;

COMMENT ON COLUMN public.stock_picker_pick_audit.is_top_pick IS
  'True for rows in the low-churn visible cohort (default unfiltered view). Bookkeeping only; never enters replay-hash.';
COMMENT ON COLUMN public.stock_picker_pick_audit.persistence_reason IS
  'KEPT-row reason only. NULL = natural retention when was_incumbent=true, OR new_entry when was_incumbent=false.';

CREATE OR REPLACE FUNCTION public.sp_pick_tenure_days(
  p_symbol text, p_exchange text, p_before_batch uuid, p_max_lookback int DEFAULT 20)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  WITH batches AS (
    SELECT DISTINCT batch_id, generated_at FROM stock_picker_pick_audit
     WHERE batch_type='live' AND batch_id <> p_before_batch
     ORDER BY generated_at DESC LIMIT p_max_lookback),
  m AS (
    SELECT b.batch_id, b.generated_at,
           EXISTS (SELECT 1 FROM stock_picker_pick_audit a
                    WHERE a.batch_id=b.batch_id AND a.symbol=p_symbol AND a.exchange=p_exchange
                      AND a.verdict='include' AND a.is_top_pick=true) AS present
      FROM batches b)
  SELECT COALESCE(SUM(CASE WHEN present THEN 1 ELSE 0 END), 0)::int
    FROM (SELECT present, bool_and(present) OVER (ORDER BY generated_at DESC) AS streak FROM m) x
   WHERE streak;
$$;
GRANT EXECUTE ON FUNCTION public.sp_pick_tenure_days(text,text,uuid,int) TO service_role;

-- M2 RPC v3
CREATE OR REPLACE FUNCTION public.stock_picker_write_audit_row(
  p_batch_id text, p_batch_type text, p_generated_at text, p_symbol text, p_exchange text,
  p_verdict text, p_composite_score numeric, p_pillar_scores text, p_data_gaps_at_generation text,
  p_code_commit_sha text, p_replay_payload_hash text, p_replay_payload_hash_version text,
  p_universe_snapshot_id text, p_regulatory_status_at_generation text, p_reg_no text, p_legal_name text,
  p_was_incumbent boolean DEFAULT false,
  p_is_top_pick boolean DEFAULT false,
  p_persistence_reason text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_id bigint;
BEGIN
  IF p_batch_type NOT IN ('live','dry_run') THEN
    RAISE EXCEPTION 'stock_picker: invalid batch_type %', p_batch_type;
  END IF;
  IF p_verdict NOT IN ('include','exclude','insufficient_data') THEN
    RAISE EXCEPTION 'stock_picker: invalid verdict %', p_verdict;
  END IF;
  IF p_replay_payload_hash_version IS DISTINCT FROM 'sp1-replay-v2' THEN
    RAISE EXCEPTION 'stock_picker: unsupported hash version %', p_replay_payload_hash_version;
  END IF;
  IF p_replay_payload_hash IS NOT NULL AND p_replay_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'stock_picker: invalid replay_payload_hash format';
  END IF;
  INSERT INTO stock_picker_pick_audit (
    batch_id, batch_type, generated_at, symbol, exchange, verdict, composite_score,
    pillar_scores, data_gaps_at_generation, code_commit_sha, replay_payload_hash,
    replay_payload_hash_version, universe_snapshot_id, regulatory_status_at_generation,
    reg_no, legal_name, was_incumbent, is_top_pick, persistence_reason
  ) VALUES (
    p_batch_id::uuid, p_batch_type, p_generated_at::timestamptz, p_symbol, p_exchange,
    p_verdict, p_composite_score, NULLIF(p_pillar_scores,'')::jsonb,
    NULLIF(p_data_gaps_at_generation,'')::jsonb, p_code_commit_sha, p_replay_payload_hash,
    p_replay_payload_hash_version, p_universe_snapshot_id::uuid,
    p_regulatory_status_at_generation, p_reg_no, p_legal_name,
    COALESCE(p_was_incumbent,false), COALESCE(p_is_top_pick,false), p_persistence_reason
  ) RETURNING id INTO v_id;
  RETURN v_id::text;
END;
$function$;

-- M3 rename (preserve kind)
INSERT INTO public.stock_picker_runtime_config (config_key, config_value, kind)
SELECT REPLACE(config_key, 'composite_score_persist_', 'composite_score_visible_'), config_value, kind
  FROM public.stock_picker_runtime_config
 WHERE config_key LIKE 'composite_score_persist_%'
ON CONFLICT (config_key) DO NOTHING;

DELETE FROM public.stock_picker_runtime_config
 WHERE config_key LIKE 'composite_score_persist_%';

-- M4 hysteresis defaults (kind=threshold per CHECK constraint)
INSERT INTO public.stock_picker_runtime_config (config_key, config_value, kind) VALUES
  ('hysteresis_display_n',            '10'::jsonb,  'threshold'),
  ('hysteresis_band_pts',             '2.0'::jsonb, 'threshold'),
  ('hysteresis_min_tenure_days',      '1'::jsonb,   'threshold'),
  ('hysteresis_daily_churn_cap_pct',  '30'::jsonb,  'threshold')
ON CONFLICT (config_key) DO NOTHING;