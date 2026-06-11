
CREATE OR REPLACE FUNCTION public.stock_picker_write_audit_row(p_batch_id text, p_batch_type text, p_generated_at text, p_symbol text, p_exchange text, p_verdict text, p_composite_score numeric, p_pillar_scores text, p_data_gaps_at_generation text, p_code_commit_sha text, p_replay_payload_hash text, p_replay_payload_hash_version text, p_universe_snapshot_id text, p_regulatory_status_at_generation text, p_reg_no text, p_legal_name text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    reg_no, legal_name
  ) VALUES (
    p_batch_id::uuid, p_batch_type, p_generated_at::timestamptz, p_symbol, p_exchange,
    p_verdict, p_composite_score, NULLIF(p_pillar_scores,'')::jsonb,
    NULLIF(p_data_gaps_at_generation,'')::jsonb, p_code_commit_sha, p_replay_payload_hash,
    p_replay_payload_hash_version, p_universe_snapshot_id::uuid,
    p_regulatory_status_at_generation, p_reg_no, p_legal_name
  ) RETURNING id INTO v_id;
  RETURN v_id::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stock_picker_write_batch_rejection_row(p_batch_id text, p_batch_type text, p_batch_state text, p_run_at text, p_near_miss_symbols text, p_rejected_symbols text, p_insufficient_data_symbols text, p_picks_issued_count integer, p_code_commit_sha text, p_replay_payload_hash text, p_replay_payload_hash_version text, p_data_gaps_at_generation text, p_universe_snapshot_id text, p_rejected_count integer, p_insufficient_count integer, p_total_universe_count integer, p_regulatory_status_at_generation text, p_reg_no text, p_legal_name text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id bigint;
BEGIN
  IF p_batch_type NOT IN ('live','dry_run') THEN
    RAISE EXCEPTION 'stock_picker: invalid batch_type %', p_batch_type;
  END IF;
  IF p_batch_state NOT IN ('running','aborted','completed','dry_run') THEN
    RAISE EXCEPTION 'stock_picker: invalid batch_state %', p_batch_state;
  END IF;
  IF p_replay_payload_hash_version IS DISTINCT FROM 'sp1-replay-v2' THEN
    RAISE EXCEPTION 'stock_picker: unsupported hash version %', p_replay_payload_hash_version;
  END IF;
  IF p_replay_payload_hash IS NOT NULL AND p_replay_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'stock_picker: invalid replay_payload_hash format';
  END IF;
  IF p_replay_payload_hash IS NULL AND p_batch_state <> 'aborted' THEN
    RAISE EXCEPTION 'stock_picker: replay_payload_hash cannot be null unless batch_state=aborted';
  END IF;
  INSERT INTO stock_picker_batch_rejection (
    batch_id, batch_type, batch_state, run_at, near_miss_symbols, rejected_symbols,
    insufficient_data_symbols, picks_issued_count, code_commit_sha, replay_payload_hash,
    replay_payload_hash_version, data_gaps_at_generation, universe_snapshot_id,
    rejected_count, insufficient_count, total_universe_count,
    regulatory_status_at_generation, reg_no, legal_name
  ) VALUES (
    p_batch_id::uuid, p_batch_type, p_batch_state, p_run_at::timestamptz,
    NULLIF(p_near_miss_symbols,'')::jsonb, NULLIF(p_rejected_symbols,'')::jsonb,
    NULLIF(p_insufficient_data_symbols,'')::jsonb, p_picks_issued_count, p_code_commit_sha,
    p_replay_payload_hash, p_replay_payload_hash_version,
    NULLIF(p_data_gaps_at_generation,'')::jsonb, p_universe_snapshot_id::uuid,
    p_rejected_count, p_insufficient_count, p_total_universe_count,
    p_regulatory_status_at_generation, p_reg_no, p_legal_name
  ) RETURNING id INTO v_id;
  RETURN v_id::text;
END;
$function$;
