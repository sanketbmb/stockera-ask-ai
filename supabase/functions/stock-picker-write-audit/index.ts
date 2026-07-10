// =============================================================================
// SP-1 Write Audit — THE ONLY WRITER to append-only audit tables
// Location: supabase/functions/stock-picker-write-audit/index.ts
//
// SP-1.6 Step 4 hardening:
//   - Schema version locked to REPLAY_SCHEMA_VERSION from replay-hash.
//   - Internal-secret gate (x-sp1-internal-secret).
//   - (batch_type, batch_state) matrix enforcement.
//   - Async regulatory stamp + composite-score runtime flag.
//   - Idempotent writes: 23505 unique_violation -> ok+deduped, not error.
//   - Per-op result rows with { op, ok, id?, deduped?, error? }.
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type {
  WriteAuditRowParams,
  WriteBatchRejectionParams,
} from '../_shared/stock-picker/types.ts';
import { REPLAY_SCHEMA_VERSION } from '../_shared/stock-picker/replay-hash.ts';
import {
  currentRegulatoryStamp,
  isCompositeScoreWritesEnabled,
} from '../_shared/stock-picker/regulatory-status.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UQ_PICK_AUDIT = 'uq_pick_audit_batch_symbol';
const UQ_BATCH_REJECTION = 'uq_batch_rejection_batch_id';

const ALLOWED_MATRIX: ReadonlySet<string> = new Set<string>([
  'live/completed',
  'live/aborted',
  'dry_run/completed',
  'dry_run/aborted',
  'bootstrap/completed',
  'bootstrap/aborted',
]);

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LOWER_HEX_64 = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// Request envelope
// ---------------------------------------------------------------------------
type WriteOp =
  | {
      op: 'write_pick_audit';
      params: WriteAuditRowParams;
      // Phase 2R: per-batch persistence guard. NEVER persisted; never enters
      // the replay-hash payload. write-audit uses it to decide whether
      // composite_score becomes null (gate closed) or the supplied value
      // (gate open) before invoking the RPC.
      risk_profile_guard?: 'conservative' | 'moderate' | 'aggressive' | 'ultra';
    }
  | { op: 'write_batch_rejection'; params: WriteBatchRejectionParams };

interface WriteAuditRequest {
  invoked_by?: string;
  operations: WriteOp[];
}

interface OpResult {
  op: string;
  ok: boolean;
  id?: string;
  deduped?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`write-audit: required string field missing/empty: ${fieldName}`);
  }
  return value;
}

function assertUuid(value: unknown, fieldName: string): string {
  const v = assertNonEmptyString(value, fieldName);
  if (!UUID_RE.test(v)) {
    throw new Error(`write-audit: ${fieldName} must be a valid UUID, got '${v}'`);
  }
  return v;
}

function assertLowerHex64(value: unknown, fieldName: string): string {
  const v = assertNonEmptyString(value, fieldName);
  if (!LOWER_HEX_64.test(v)) {
    throw new Error(`write-audit: ${fieldName} must be 64-char lowercase hex SHA-256`);
  }
  return v;
}

function assertHashOrNullForAborted(
  hash: unknown,
  batchState: string,
  fieldName: string
): string | null {
  if (hash === null || hash === undefined) {
    if (batchState === 'aborted') return null;
    throw new Error(
      `write-audit: ${fieldName} cannot be null for batch_state='${batchState}' ` +
        `(only batch_state='aborted' permits null hash)`
    );
  }
  return assertLowerHex64(hash, fieldName);
}

function assertIso8601(value: unknown, fieldName: string): string {
  const v = assertNonEmptyString(value, fieldName);
  if (Number.isNaN(Date.parse(v))) {
    throw new Error(`write-audit: ${fieldName} must be ISO 8601, got '${v}'`);
  }
  return v;
}

function assertSchemaVersion(value: unknown): string {
  const v = assertNonEmptyString(value, 'p_replay_payload_hash_version');
  if (v !== REPLAY_SCHEMA_VERSION) {
    throw new Error(
      `replay schema version mismatch: expected ${REPLAY_SCHEMA_VERSION}, got ${v}`
    );
  }
  return v;
}

function assertMatrix(batchType: unknown, batchState: unknown): { type: string; state: string } {
  if (typeof batchType !== 'string' || typeof batchState !== 'string') {
    throw new Error(
      `invalid (batch_type, batch_state): ${String(batchType)}/${String(batchState)}`
    );
  }
  const key = `${batchType}/${batchState}`;
  if (!ALLOWED_MATRIX.has(key)) {
    throw new Error(`invalid (batch_type, batch_state): ${batchType}/${batchState}`);
  }
  return { type: batchType, state: batchState };
}

// ---------------------------------------------------------------------------
// Idempotency / error classification
// ---------------------------------------------------------------------------
interface PgErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

function isUniqueViolationOnConstraint(err: PgErrorLike | null | undefined, constraint: string): boolean {
  if (!err || err.code !== '23505') return false;
  const haystack = `${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`;
  return haystack.includes(constraint);
}

// ---------------------------------------------------------------------------
// write_pick_audit
// ---------------------------------------------------------------------------
async function runWritePickAudit(
  supabase: SupabaseClient,
  paramsIn: WriteAuditRowParams,
  stamp: { regulatory_status_at_generation: string; sebi_reg_no: string; firm_legal_name: string },
  effectiveCompositeOpen: boolean
): Promise<OpResult> {
  // NOTE: risk_profile_guard is intentionally NOT passed into this function.
  // The caller resolves the per-profile gate into effectiveCompositeOpen
  // and strips the guard before we build any p_* params. The guard never
  // enters the RPC, never enters the replay-hash payload, and never reaches
  // stock_picker_pick_audit.
  const params: WriteAuditRowParams = { ...paramsIn };

  assertUuid(params.p_batch_id, 'p_batch_id');

  // Matrix check: for pick_audit only batch_type is supplied; treat the row as
  // "completed" (per-stock verdicts only exist on successful batches).
  assertMatrix(params.p_batch_type, 'completed');

  assertIso8601(params.p_generated_at, 'p_generated_at');
  assertNonEmptyString(params.p_symbol, 'p_symbol');
  assertNonEmptyString(params.p_exchange, 'p_exchange');
  assertNonEmptyString(params.p_verdict, 'p_verdict');
  assertNonEmptyString(params.p_code_commit_sha, 'p_code_commit_sha');
  assertLowerHex64(params.p_replay_payload_hash, 'p_replay_payload_hash');
  assertSchemaVersion(params.p_replay_payload_hash_version);
  assertNonEmptyString(params.p_universe_snapshot_id, 'p_universe_snapshot_id');

  // SP-1.6 perf: stamp + composite flag are precomputed ONCE per request and
  // passed in. No per-op DB roundtrip to runtime_config.
  params.p_regulatory_status_at_generation = stamp.regulatory_status_at_generation;
  params.p_reg_no = stamp.sebi_reg_no;
  params.p_legal_name = stamp.firm_legal_name;

  // Phase 2R: batch-level persistence gate. effectiveCompositeOpen is
  //   global composite_score_writes_enabled
  //   && composite_score_persist_<risk_profile_guard> === true
  // If closed, force composite_score to null before the RPC call.
  if (params.p_composite_score !== null && params.p_composite_score !== undefined) {
    if (!effectiveCompositeOpen) {
      params.p_composite_score = null;
    }
  }

  const { data, error } = await supabase.rpc('stock_picker_write_audit_row', {
    p_batch_id: params.p_batch_id,
    p_batch_type: params.p_batch_type,
    p_generated_at: params.p_generated_at,
    p_symbol: params.p_symbol,
    p_exchange: params.p_exchange,
    p_verdict: params.p_verdict,
    p_composite_score: params.p_composite_score,
    p_pillar_scores: params.p_pillar_scores,
    p_data_gaps_at_generation: params.p_data_gaps_at_generation,
    p_code_commit_sha: params.p_code_commit_sha,
    p_replay_payload_hash: params.p_replay_payload_hash,
    p_replay_payload_hash_version: params.p_replay_payload_hash_version,
    p_universe_snapshot_id: params.p_universe_snapshot_id,
    p_regulatory_status_at_generation: params.p_regulatory_status_at_generation,
    p_reg_no: params.p_reg_no,
    p_legal_name: params.p_legal_name,
    p_was_incumbent: params.p_was_incumbent ?? false,
    p_is_top_pick: params.p_is_top_pick ?? false,
    p_persistence_reason: params.p_persistence_reason ?? null,
  });


  if (error) {
    if (isUniqueViolationOnConstraint(error as PgErrorLike, UQ_PICK_AUDIT)) {
      return { op: 'write_pick_audit', ok: true, deduped: true };
    }
    return {
      op: 'write_pick_audit',
      ok: false,
      error: `${error.code ?? 'no-code'} ${error.message}`,
    };
  }

  if (typeof data !== 'string' || data.length === 0) {
    return {
      op: 'write_pick_audit',
      ok: false,
      error: `stock_picker_write_audit_row returned non-uuid: ${JSON.stringify(data)}`,
    };
  }
  return { op: 'write_pick_audit', ok: true, id: data };
}


// ---------------------------------------------------------------------------
// write_batch_rejection
// ---------------------------------------------------------------------------
async function runWriteBatchRejection(
  supabase: SupabaseClient,
  paramsIn: WriteBatchRejectionParams,
  stamp: { regulatory_status_at_generation: string; sebi_reg_no: string; firm_legal_name: string }
): Promise<OpResult> {
  const params: WriteBatchRejectionParams = { ...paramsIn };

  assertUuid(params.p_batch_id, 'p_batch_id');
  const { state } = assertMatrix(params.p_batch_type, params.p_batch_state);
  assertIso8601(params.p_run_at, 'p_run_at');
  assertNonEmptyString(params.p_code_commit_sha, 'p_code_commit_sha');

  const hashOrNull = assertHashOrNullForAborted(
    params.p_replay_payload_hash,
    state,
    'p_replay_payload_hash'
  );
  assertSchemaVersion(params.p_replay_payload_hash_version);
  assertNonEmptyString(params.p_universe_snapshot_id, 'p_universe_snapshot_id');

  // SP-1.6 perf: stamp precomputed ONCE per request.
  params.p_regulatory_status_at_generation = stamp.regulatory_status_at_generation;
  params.p_reg_no = stamp.sebi_reg_no;
  params.p_legal_name = stamp.firm_legal_name;

  const { data, error } = await supabase.rpc('stock_picker_write_batch_rejection_row', {
    p_batch_id: params.p_batch_id,
    p_batch_type: params.p_batch_type,
    p_batch_state: params.p_batch_state,
    p_run_at: params.p_run_at,
    p_near_miss_symbols: params.p_near_miss_symbols,
    p_rejected_symbols: params.p_rejected_symbols,
    p_insufficient_data_symbols: params.p_insufficient_data_symbols,
    p_picks_issued_count: params.p_picks_issued_count,
    p_code_commit_sha: params.p_code_commit_sha,
    p_replay_payload_hash: hashOrNull,
    p_replay_payload_hash_version: params.p_replay_payload_hash_version,
    p_data_gaps_at_generation: params.p_data_gaps_at_generation,
    p_universe_snapshot_id: params.p_universe_snapshot_id,
    p_rejected_count: params.p_rejected_count,
    p_insufficient_count: params.p_insufficient_count,
    p_total_universe_count: params.p_total_universe_count,
    p_regulatory_status_at_generation: params.p_regulatory_status_at_generation,
    p_reg_no: params.p_reg_no,
    p_legal_name: params.p_legal_name,
  });

  if (error) {
    if (isUniqueViolationOnConstraint(error as PgErrorLike, UQ_BATCH_REJECTION)) {
      return { op: 'write_batch_rejection', ok: true, deduped: true };
    }
    return {
      op: 'write_batch_rejection',
      ok: false,
      error: `${error.code ?? 'no-code'} ${error.message}`,
    };
  }

  if (typeof data !== 'string' || data.length === 0) {
    return {
      op: 'write_batch_rejection',
      ok: false,
      error: `stock_picker_write_batch_rejection_row returned non-uuid: ${JSON.stringify(data)}`,
    };
  }
  return { op: 'write_batch_rejection', ok: true, id: data };
}


// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'method_not_allowed' });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { ok: false, error: 'missing_env' });
  }

  // Internal-secret gate
  const expectedSecret = Deno.env.get('SP1_INTERNAL_INVOCATION_SECRET');
  if (expectedSecret && expectedSecret.length > 0) {
    const headerSecret = req.headers.get('x-sp1-internal-secret');
    if (headerSecret !== expectedSecret) {
      return jsonResponse(401, { ok: false, error: 'unauthorized: invalid internal secret' });
    }
  } else {
    console.warn(
      'write-audit: SP1_INTERNAL_INVOCATION_SECRET not set; accepting request under migration grace period'
    );
  }

  let body: WriteAuditRequest;
  try {
    body = await req.json();
  } catch (_e) {
    return jsonResponse(400, { ok: false, error: 'invalid_json' });
  }

  if (!body || typeof body !== 'object' || !Array.isArray(body.operations)) {
    return jsonResponse(400, { ok: false, error: 'invalid_envelope' });
  }

  // Pre-flight: schema-version + matrix checks on every op -> HTTP 400 short-circuit
  for (const op of body.operations) {
    if (!op || typeof op !== 'object') {
      return jsonResponse(400, { ok: false, error: 'invalid_envelope' });
    }
    const params = (op as { params?: Record<string, unknown> }).params ?? {};
    const ver = params.p_replay_payload_hash_version;
    if (typeof ver !== 'string' || ver !== REPLAY_SCHEMA_VERSION) {
      return jsonResponse(400, {
        ok: false,
        error: `replay schema version mismatch: expected ${REPLAY_SCHEMA_VERSION}, got ${String(ver)}`,
      });
    }
    if (op.op === 'write_pick_audit') {
      try {
        assertMatrix(params.p_batch_type, 'completed');
      } catch (e) {
        return jsonResponse(400, {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    } else if (op.op === 'write_batch_rejection') {
      try {
        assertMatrix(params.p_batch_type, params.p_batch_state);
      } catch (e) {
        return jsonResponse(400, {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      return jsonResponse(400, {
        ok: false,
        error: `invalid op: ${JSON.stringify((op as { op: string }).op)}`,
      });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // SP-1.6 perf: compute regulatory stamp + composite flag ONCE per request.
  let stamp;
  let compositeEnabled = false;
  try {
    stamp = await currentRegulatoryStamp();
    compositeEnabled = await isCompositeScoreWritesEnabled();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse(500, { ok: false, error: `regulatory-status: ${msg}` });
  }

  // Phase 2R: ONE batched runtime_config read for per-profile persistence flags.
  // No per-row roundtrip. Defaults to false on missing rows.
  const persistByProfile: Record<string, boolean> = {
    conservative: false, moderate: false, aggressive: false, ultra: false,
  };
  try {
    const { data: cfgRows, error: cfgErr } = await supabase
      .from('stock_picker_runtime_config')
      .select('config_key, config_value')
      .in('config_key', [
        'composite_score_persist_conservative',
        'composite_score_persist_moderate',
        'composite_score_persist_aggressive',
        'composite_score_persist_ultra',
      ]);
    if (!cfgErr && cfgRows) {
      for (const r of cfgRows) {
        const k = (r as { config_key: string }).config_key;
        const v = (r as { config_value: unknown }).config_value;
        const b = v === true || v === 'true';
        const profile = k.replace('composite_score_persist_', '');
        if (profile in persistByProfile) persistByProfile[profile] = b;
      }
    }
  } catch (e) {
    console.warn(`write-audit: per-profile flag load failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`phase2r: gate global=${compositeEnabled} per_profile=${JSON.stringify(persistByProfile)}`);

  const results: OpResult[] = [];
  for (const op of body.operations) {
    try {
      if (op.op === 'write_pick_audit') {
        const guard = (op as { risk_profile_guard?: string }).risk_profile_guard;
        const profileOpen = guard && guard in persistByProfile ? persistByProfile[guard] : false;
        const effectiveCompositeOpen = compositeEnabled && profileOpen === true;
        results.push(await runWritePickAudit(supabase, op.params, stamp, effectiveCompositeOpen));
      } else {
        results.push(await runWriteBatchRejection(supabase, op.params, stamp));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ op: op.op, ok: false, error: msg });
    }
  }

  const allOk = results.every(r => r.ok === true);
  return jsonResponse(allOk ? 200 : 207, { ok: allOk, results });
});
