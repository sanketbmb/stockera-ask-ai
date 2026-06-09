// =============================================================================
// SP-1 Write Audit — THE ONLY WRITER to append-only audit tables
// Location: supabase/functions/stock-picker-write-audit/index.ts
//
// SINGLE-WRITER INVARIANT:
//   This is the ONLY edge function that writes to stock_picker_pick_audit and
//   stock_picker_batch_rejection. All other SP-1 functions (build-universe,
//   exclusion-engine, daily-cron) call THIS function — never the tables.
//
// WRITE PATH:
//   This function calls the SECURITY DEFINER RPCs:
//     - stock_picker_write_audit_row()
//     - stock_picker_write_batch_rejection_row()
//   These RPCs use set_config('app.writer_role', ..., true) + INSERT atomically
//   within a single function-call transaction. The BEFORE INSERT trigger sees
//   the role in the same transaction and permits the write.
//
//   NEVER do a bare .from('stock_picker_pick_audit').insert(...) — the trigger
//   will reject it because SET LOCAL is transaction-scoped and a separate
//   supabase-js call uses a different pooled connection.
//
// REQUIRED PARAMETERS (no defaults):
//   p_generated_at                          — caller-supplied ISO 8601 (NOT now())
//   p_replay_payload_hash_version           — caller-supplied SP1ReplaySchemaVersion
//   p_regulatory_status_at_generation       — from currentRegulatoryStamp()
//   p_reg_no                                — from currentRegulatoryStamp()
//   p_legal_name                            — from currentRegulatoryStamp()
//
// DRY-RUN ROUTING:
//   This writer does NOT decide dry-run. The cron decides. When called with
//   batch_type='dry_run', this writer still writes — the rows are tagged so
//   downstream readers (SP-2/SP-5) filter via the SP1-A25 reader contract:
//     WHERE batch_type NOT IN ('dry_run','bootstrap')
//
// RETURN CONTRACT:
//   - Success → { ok: true, id: uuid }
//   - Refusal (kill-switch in RPC, missing fields, validation) → HTTP 4xx/5xx
//   - Never returns NULL or distinguishes success by null/undefined
//
// HASH NULLABILITY (DEFECT 4):
//   p_replay_payload_hash may be NULL when batch_state='aborted' (data
//   incomplete → hash is not a replay anchor). When non-null, it must be
//   64-char lowercase hex.
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type {
  WriteAuditRowParams,
  WriteBatchRejectionParams,
  WriteAuditRowResult,
  WriteBatchRejectionResult,
} from '../_shared/stock-picker/types.ts';
import { SP1_REPLAY_SCHEMA_VERSION } from '../_shared/stock-picker/types.ts';

// ---------------------------------------------------------------------------
// Request envelope
// ---------------------------------------------------------------------------
type WriteOp =
  | { op: 'write_pick_audit'; params: WriteAuditRowParams }
  | { op: 'write_batch_rejection'; params: WriteBatchRejectionParams };

interface WriteAuditRequest {
  invoked_by: string;
  operations: WriteOp[];
}

// ---------------------------------------------------------------------------
// Validation helpers — fail-loud, no silent acceptance
// ---------------------------------------------------------------------------
function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`write-audit: required string field missing/empty: ${fieldName}`);
  }
  return value;
}

function requireHashVersion(value: unknown): string {
  const v = requireString(value, 'p_replay_payload_hash_version');
  if (v !== SP1_REPLAY_SCHEMA_VERSION) {
    throw new Error(
      `write-audit: p_replay_payload_hash_version must be ${SP1_REPLAY_SCHEMA_VERSION}, got '${v}'`
    );
  }
  return v;
}

function requireIso8601(value: unknown, fieldName: string): string {
  const v = requireString(value, fieldName);
  const parsed = Date.parse(v);
  if (Number.isNaN(parsed)) {
    throw new Error(`write-audit: ${fieldName} must be ISO 8601, got '${v}'`);
  }
  return v;
}

function requireBatchType(value: unknown): 'live' | 'dry_run' {
  if (value !== 'live' && value !== 'dry_run') {
    throw new Error(`write-audit: p_batch_type must be 'live'|'dry_run', got ${JSON.stringify(value)}`);
  }
  return value;
}

function requireBatchState(value: unknown): 'running' | 'aborted' | 'completed' | 'dry_run' {
  if (value !== 'running' && value !== 'aborted' && value !== 'completed' && value !== 'dry_run') {
    throw new Error(`write-audit: p_batch_state invalid: ${JSON.stringify(value)}`);
  }
  return value;
}

// Allow NULL hash when batch_state='aborted' (DEFECT 4); otherwise require hex.
function requireHashOrNullForAborted(
  hash: unknown,
  batchState: string,
  fieldName: string
): string | null {
  if (hash === null || hash === undefined) {
    if (batchState === 'aborted') return null;
    throw new Error(
      `write-audit: ${fieldName} cannot be null for batch_state='${batchState}' ` +
      `(only batch_state='aborted' permits null hash — DEFECT 4 contract)`
    );
  }
  if (typeof hash !== 'string') {
    throw new Error(`write-audit: ${fieldName} must be string or null, got ${typeof hash}`);
  }
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error(`write-audit: ${fieldName} must be 64-char lowercase hex SHA-256`);
  }
  return hash;
}

// For pick_audit, hash is always required (per-stock verdicts have valid data).
function requireLowerHexSha256(value: unknown, fieldName: string): string {
  const v = requireString(value, fieldName);
  if (!/^[0-9a-f]{64}$/.test(v)) {
    throw new Error(`write-audit: ${fieldName} must be 64-char lowercase hex SHA-256`);
  }
  return v;
}

// ---------------------------------------------------------------------------
// RPC callers
// ---------------------------------------------------------------------------
async function callWritePickAudit(
  supabase: SupabaseClient,
  params: WriteAuditRowParams
): Promise<WriteAuditRowResult> {
  requireString(params.p_batch_id, 'p_batch_id');
  requireBatchType(params.p_batch_type);
  requireIso8601(params.p_generated_at, 'p_generated_at');
  requireString(params.p_symbol, 'p_symbol');
  requireString(params.p_exchange, 'p_exchange');
  requireString(params.p_verdict, 'p_verdict');
  requireString(params.p_code_commit_sha, 'p_code_commit_sha');
  requireLowerHexSha256(params.p_replay_payload_hash, 'p_replay_payload_hash');
  requireHashVersion(params.p_replay_payload_hash_version);
  requireString(params.p_universe_snapshot_id, 'p_universe_snapshot_id');
  // Regulatory stamp triple (BLOCKER 2)
  requireString(params.p_regulatory_status_at_generation, 'p_regulatory_status_at_generation');
  requireString(params.p_reg_no, 'p_reg_no');
  requireString(params.p_legal_name, 'p_legal_name');

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
  });

  if (error) {
    throw new Error(
      `write-audit: stock_picker_write_audit_row RPC failed: ` +
      `${error.code ?? 'no-code'} ${error.message}`
    );
  }
  if (typeof data !== 'string' || data.length === 0) {
    throw new Error(
      `write-audit: stock_picker_write_audit_row returned non-uuid: ${JSON.stringify(data)}`
    );
  }
  return { id: data };
}

async function callWriteBatchRejection(
  supabase: SupabaseClient,
  params: WriteBatchRejectionParams
): Promise<WriteBatchRejectionResult> {
  requireString(params.p_batch_id, 'p_batch_id');
  requireBatchType(params.p_batch_type);
  const batchState = requireBatchState(params.p_batch_state);
  requireIso8601(params.p_run_at, 'p_run_at');
  requireString(params.p_code_commit_sha, 'p_code_commit_sha');
  // DEFECT 4: hash may be null when batch_state='aborted'
  const hashOrNull = requireHashOrNullForAborted(
    params.p_replay_payload_hash,
    batchState,
    'p_replay_payload_hash'
  );
  requireHashVersion(params.p_replay_payload_hash_version);
  requireString(params.p_universe_snapshot_id, 'p_universe_snapshot_id');
  requireString(params.p_regulatory_status_at_generation, 'p_regulatory_status_at_generation');
  requireString(params.p_reg_no, 'p_reg_no');
  requireString(params.p_legal_name, 'p_legal_name');

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
    throw new Error(
      `write-audit: stock_picker_write_batch_rejection_row RPC failed: ` +
      `${error.code ?? 'no-code'} ${error.message}`
    );
  }
  if (typeof data !== 'string' || data.length === 0) {
    throw new Error(
      `write-audit: stock_picker_write_batch_rejection_row returned non-uuid: ${JSON.stringify(data)}`
    );
  }
  return { id: data };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'method_not_allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: 'missing_env' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: WriteAuditRequest;
  try {
    body = await req.json();
  } catch (_e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'invalid_json' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!body || typeof body !== 'object' || !Array.isArray(body.operations)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'invalid_envelope' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const results: Array<{ op: string; id: string }> = [];
  try {
    for (const op of body.operations) {
      if (op.op === 'write_pick_audit') {
        const r = await callWritePickAudit(supabase, op.params);
        results.push({ op: 'write_pick_audit', id: r.id });
      } else if (op.op === 'write_batch_rejection') {
        const r = await callWriteBatchRejection(supabase, op.params);
        results.push({ op: 'write_batch_rejection', id: r.id });
      } else {
        throw new Error(`write-audit: unknown op: ${JSON.stringify((op as { op: string }).op)}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ ok: false, error: msg, completed: results }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});