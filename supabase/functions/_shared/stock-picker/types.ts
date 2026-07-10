// =============================================================================

// SP-1 Shared Types — Stock Picker V1

// Location: supabase/functions/_shared/stock-picker/types.ts

// Frozen except for additive changes approved by phase-lead.

// =============================================================================

// --- Schema Version ---

export const SP1_REPLAY_SCHEMA_VERSION = 'sp1-replay-v1' as const;

export type SP1ReplaySchemaVersion = typeof SP1_REPLAY_SCHEMA_VERSION;

// --- Invoker ---

export type InvokedBy = 'bootstrap' | 'manual' | 'cron';

export const INVOKED_BY_VALUES = ['bootstrap', 'manual', 'cron'] as const;

// --- Batch ---

export type BatchType = 'live' | 'dry_run';

export const BATCH_TYPE_VALUES = ['live', 'dry_run'] as const;

export type BatchState = 'running' | 'aborted' | 'completed' | 'dry_run';

export const BATCH_STATE_VALUES = ['running', 'aborted', 'completed', 'dry_run'] as const;

// --- Exchange / Segment ---

export type Exchange = 'NSE' | 'BSE';

export const EXCHANGE_VALUES = ['NSE', 'BSE'] as const;

export type Segment = 'EQ' | 'BE' | 'SM' | 'SL';

export const SEGMENT_VALUES = ['EQ', 'BE', 'SM', 'SL'] as const;

// --- Exclusion Check IDs ---

export type ExclusionCheckId =

  | 'EX-ASM-1'

  | 'EX-GSM-1'

  | 'EX-T2T-1'

  | 'EX-PLEDGE-1'

  | 'EX-LIQ-1'

  | 'EX-LIQ-2'

  | 'EX-SUSPEND-1'

  | 'EX-SEGMENT-1';

export const EXCLUSION_CHECK_IDS: ExclusionCheckId[] = [

  'EX-ASM-1',

  'EX-GSM-1',

  'EX-T2T-1',

  'EX-PLEDGE-1',

  'EX-LIQ-1',

  'EX-LIQ-2',

  'EX-SUSPEND-1',

  'EX-SEGMENT-1',

];

export const CFG = {

  CRON_ENABLED:           'cron_enabled',

  DRY_RUN_ENABLED:        'dry_run_enabled',

  BOOTSTRAP_COMPLETED:    'bootstrap_completed',

  ACTIVE_SEED_VERSION:    'active_seed_version',

  ABORT_INSUF_DATA_PCT:   'abort_insufficient_data_pct',

  EN_EX_ASM_1:     'enable_check_ex_asm_1',

  EN_EX_GSM_1:     'enable_check_ex_gsm_1',

  EN_EX_T2T_1:     'enable_check_ex_t2t_1',

  EN_EX_PLEDGE_1:  'enable_check_ex_pledge_1',

  EN_EX_LIQ_1:     'enable_check_ex_liq_1',

  EN_EX_LIQ_2:     'enable_check_ex_liq_2',

  EN_EX_SUSPEND_1: 'enable_check_ex_suspend_1',

  EN_EX_SEGMENT_1: 'enable_check_ex_segment_1',

  THR_EX_PLEDGE_1_PCT: 'threshold_ex_pledge_1_pct',

  THR_EX_LIQ_1_ADV:    'threshold_ex_liq_1_adv',

  THR_EX_LIQ_2_ADT_RS: 'threshold_ex_liq_2_adt_rs',

} as const;

export const CHECK_CONFIG_MAP: Record<

  ExclusionCheckId,

  { enableKey: string; thresholdKey: string | null }

> = {

  'EX-ASM-1':     { enableKey: CFG.EN_EX_ASM_1,     thresholdKey: null },

  'EX-GSM-1':     { enableKey: CFG.EN_EX_GSM_1,     thresholdKey: null },

  'EX-T2T-1':     { enableKey: CFG.EN_EX_T2T_1,     thresholdKey: null },

  'EX-PLEDGE-1':  { enableKey: CFG.EN_EX_PLEDGE_1,  thresholdKey: CFG.THR_EX_PLEDGE_1_PCT },

  'EX-LIQ-1':     { enableKey: CFG.EN_EX_LIQ_1,     thresholdKey: CFG.THR_EX_LIQ_1_ADV },

  'EX-LIQ-2':     { enableKey: CFG.EN_EX_LIQ_2,     thresholdKey: CFG.THR_EX_LIQ_2_ADT_RS },

  'EX-SUSPEND-1': { enableKey: CFG.EN_EX_SUSPEND_1, thresholdKey: null },

  'EX-SEGMENT-1': { enableKey: CFG.EN_EX_SEGMENT_1, thresholdKey: null },

};

export interface UniverseMember {

  symbol: string;

  exchange: Exchange;

  segment: Segment;

  isin: string | null;

  dhan_security_id: string | null;

  sector_canonical: string | null;

  alternate_listings: string[];

  successor_applied: boolean;

}

export interface UniverseCanonicalInput {

  members: UniverseMember[];

}

export interface LiquidityRecord {

  symbol: string;

  exchange: Exchange;

  record_date: string;

  close: number;

  volume: number;

  turnover_rs: number;

  fetch_status: string;

  data_snapshot_at: string;

}

export interface LiquidityHashInput {

  symbol: string;

  exchange: Exchange;

  record_date: string;

  close: string;

  volume: string;

  turnover_rs: string;

}

export interface LiquidityCanonicalInput {

  records: LiquidityHashInput[];

}

export interface ExclusionCheckConfig {

  check_id: ExclusionCheckId;

  threshold_value: string;

  enabled: boolean;

}

export interface ExclusionCanonicalInput {

  checks: ExclusionCheckConfig[];

}

export interface CanonicalBundle {

  schema_version: SP1ReplaySchemaVersion;

  batch_id: string;

  seed_version: string;

  run_date_ist: string;

  universe_snapshot_hash: string;

  universe_members: UniverseCanonicalInput;

  liquidity_bundle: LiquidityCanonicalInput;

  exclusion_checks: ExclusionCanonicalInput;

  data_freshness_date: string;

}

export interface WriteAuditRowParams {

  p_batch_id: string;

  p_batch_type: BatchType;

  p_generated_at: string;

  p_symbol: string;

  p_exchange: Exchange;

  p_verdict: string;

  p_composite_score: number | null;

  p_pillar_scores: string | null;

  p_data_gaps_at_generation: string | null;

  p_code_commit_sha: string;

  p_replay_payload_hash: string | null;

  p_replay_payload_hash_version: SP1ReplaySchemaVersion;

  p_universe_snapshot_id: string;

  p_regulatory_status_at_generation: string;

  p_reg_no: string;

  p_legal_name: string;

  p_was_incumbent?: boolean;

  p_is_top_pick?: boolean;

  p_persistence_reason?: string | null;

}


export interface WriteBatchRejectionParams {

  p_batch_id: string;

  p_batch_type: BatchType;

  p_batch_state: BatchState;

  p_run_at: string;

  p_near_miss_symbols: string | null;

  p_rejected_symbols: string | null;

  p_insufficient_data_symbols: string | null;

  p_picks_issued_count: number;

  p_code_commit_sha: string;

  p_replay_payload_hash: string | null;

  p_replay_payload_hash_version: SP1ReplaySchemaVersion;

  p_data_gaps_at_generation: string | null;

  p_universe_snapshot_id: string;

  p_rejected_count: number;

  p_insufficient_count: number;

  p_total_universe_count: number;

  p_regulatory_status_at_generation: string;

  p_reg_no: string;

  p_legal_name: string;

}

export interface BuildUniverseResponse {

  ok: boolean;

  universe_snapshot_id: string;

  universe_size: number;

  universe_snapshot_hash: string;

  seed_source_doc_sha: string;

  reused_existing: boolean;

  members: UniverseMember[];

}