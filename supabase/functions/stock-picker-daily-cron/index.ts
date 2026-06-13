// =============================================================================
// SP-1 Daily Cron — orchestrator (bootstrap | live | dry_run)
// Location: supabase/functions/stock-picker-daily-cron/index.ts
//
// THIS FUNCTION OWNS:
//   - Dry-run routing decision (NOT the writer RPC — per D1 fix)
//   - Kill-switch check (CFG.CRON_ENABLED)
//   - Trading calendar gate (today must be a trading day)
//   - Future-coverage guard (≥30 days of calendar entries ahead)
//   - Universe build → liquidity fetch (throttled) → exclusion → abort gate
//   - Routing of audit writes through stock-picker-write-audit ONLY
//   - cron_run_log updates and phase timing metrics
//
// FIXES APPLIED:
//   - BLOCKER 1: universe_members in the replay bundle come from
//     build-universe's response (the EXACT canonical array that was
//     hashed into universe_snapshot_hash). No reconstruction.
//   - BLOCKER 2: regulatory_status fields use the locked
//     currentRegulatoryStamp() (no arg) shape: regulatory_status_at_generation,
//     sebi_reg_no, firm_legal_name. No stamp_version concept.
//   - BLOCKER 3: All config keys come from shared CFG const. No string
//     literals at call sites.
//   - DEFECT 4: Aborted-batch hash policy — we compute the hash for
//     forensic continuity but explicitly null it in the persisted row,
//     so the column is a strict replay anchor (non-null ⇔ replayable).
//   - DEFECT 5: liquidity hash bundle is LiquidityHashInput[] (strings),
//     produced by the exclusion engine. No casts in this file.
//
// REPAIRS (post-review):
//   - REPAIR 1: Phase 3 live/dry_run branch was structurally broken
//     (fetchLiquidityForUniverse({ opened and never closed). Completed
//     the call with canonicalMembers and chained appendLiquidity + markPhase.
//   - REPAIR 2: Removed dead bootstrap branch in Phase 7 — bootstrap
//     returns early in Phase 3, so that block was unreachable.
//   - REPAIR 3: getBootstrapFreshness replaced with direct SELECT against
//     stock_picker_liquidity_20d_latest (no get_liquidity_freshness_stats
//     RPC dependency).
//
// BOOTSTRAP-COMPLETED FLIP POLICY:
//   This file READS bootstrap_completed but NEVER writes to it. Operator
//   flips manually via Supabase SQL Editor after verifying warehouse depth
//   (≥20 trading days across the universe). No auto-flip code anywhere.
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type {
  BatchType,
  BatchState,
  InvokedBy,
  LiquidityHashInput,
  ExclusionCheckConfig,
  CanonicalBundle,
  Exchange,
  UniverseMember,
  WriteBatchRejectionParams,
  WriteAuditRowParams,
  BuildUniverseResponse,
} from '../_shared/stock-picker/types.ts';
import { CFG } from '../_shared/stock-picker/types.ts';
import {
  computeReplayPayloadHash,
  REPLAY_SCHEMA_VERSION,
} from '../_shared/stock-picker/replay-hash.ts';
import { currentRegulatoryStamp } from '../_shared/stock-picker/regulatory-status.ts';

// ---------------------------------------------------------------------------
// Request envelope
// ---------------------------------------------------------------------------
interface DailyCronRequest {
  mode: 'live' | 'dry_run' | 'bootstrap';
  invoked_by: InvokedBy;
  seed_version?: string;
  run_date_ist?: string;
  resume_from?: string;
  // Phase 2R: per-profile gate. Optional thin pass-through; default 'moderate'.
  // Used by the batch-level persistence gate in write-audit. Never enters
  // replay-hash payload, never persisted to stock_picker_pick_audit.
  risk_profile?: 'conservative' | 'moderate' | 'aggressive' | 'ultra';
}

// --- CHUNKED BOOTSTRAP HELPERS ---
const BOOTSTRAP_CHUNK_SIZE = 100;

// REPAIR 3: direct SELECT against the _latest view; no RPC dependency.
async function getBootstrapFreshness(
  supabase: SupabaseClient
): Promise<Record<string, unknown>> {
  try {
    const { count, error: countErr } = await supabase
      .from('stock_picker_liquidity_20d_latest')
      .select('symbol', { count: 'exact', head: true });
    if (countErr) return { error: `count: ${countErr.message}` };

    const { data: minRow, error: minErr } = await supabase
      .from('stock_picker_liquidity_20d_latest')
      .select('record_date')
      .order('record_date', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (minErr) return { error: `min: ${minErr.message}` };

    const { data: maxRow, error: maxErr } = await supabase
      .from('stock_picker_liquidity_20d_latest')
      .select('record_date')
      .order('record_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) return { error: `max: ${maxErr.message}` };

    return {
      row_count: count ?? 0,
      min_record_date: minRow?.record_date ?? null,
      max_record_date: maxRow?.record_date ?? null,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------
async function loadConfig(supabase: SupabaseClient): Promise<Map<string, unknown>> {
  const { data, error } = await supabase
    .from('stock_picker_runtime_config')
    .select('config_key,config_value');
  if (error) throw new Error(`cron: load config failed: ${error.message}`);
  const m = new Map<string, unknown>();
  for (const row of (data ?? []) as Array<{ config_key: string; config_value: unknown }>) {
    m.set(row.config_key, row.config_value);
  }
  return m;
}

function jsonbBool(value: unknown, key: string): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`cron: config '${key}' is not boolean: ${JSON.stringify(value)}`);
}

function jsonbNumber(value: unknown, key: string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(`cron: config '${key}' is not number: ${JSON.stringify(value)}`);
}

function jsonbString(value: unknown, key: string): string {
  if (typeof value === 'string') return value;
  throw new Error(`cron: config '${key}' is not string: ${JSON.stringify(value)}`);
}

function jsonbBoolWithDefault(value: unknown, key: string, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return jsonbBool(value, key);
}

function logDiagnosticPhase(
  batchId: string,
  phase: string,
  event: 'start' | 'done',
  startedAt: number,
  details?: Record<string, unknown>
): void {
  console.log(JSON.stringify({
    diagnostic: 'stock-picker-daily-cron',
    batch_id: batchId,
    phase,
    event,
    elapsed_ms: Date.now() - startedAt,
    ...(details ? { details } : {}),
  }));
}

// ---------------------------------------------------------------------------
// IST date helper
// ---------------------------------------------------------------------------
function todayIst(): string {
  const now = Date.now();
  const istMs = now + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Trading calendar gates
// ---------------------------------------------------------------------------
async function isTradingDay(supabase: SupabaseClient, dateIst: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('stock_picker_trading_calendar')
    .select('is_trading_day')
    .eq('calendar_date', dateIst)
    .maybeSingle();
  if (error) throw new Error(`cron: trading calendar lookup failed: ${error.message}`);
  if (!data) throw new Error(`cron: trading calendar missing entry for ${dateIst}`);
  return Boolean(data.is_trading_day);
}

async function assertFutureCoverage(supabase: SupabaseClient, dateIst: string): Promise<void> {
  const { count, error } = await supabase
    .from('stock_picker_trading_calendar')
    .select('calendar_date', { count: 'exact', head: true })
    .gt('calendar_date', dateIst);
  if (error) throw new Error(`cron: future-coverage check failed: ${error.message}`);
  if ((count ?? 0) < 30) {
    throw new Error(`cron: trading calendar has <30 future entries after ${dateIst}; refusing to run`);
  }
}

// ---------------------------------------------------------------------------
// Function-to-function invoke
// ---------------------------------------------------------------------------
async function invokeFunction<T>(
  supabaseUrl: string,
  serviceKey: string,
  name: string,
  body: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const url = `${supabaseUrl}/functions/v1/${name}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
  };
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      if (typeof v === 'string' && v.length > 0) headers[k] = v;
    }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { ok: false, raw: text }; }
  if (!res.ok) {
    throw new Error(`cron: function '${name}' returned ${res.status}: ${text}`);
  }
  return parsed as T;
}

// ---------------------------------------------------------------------------
// Dhan liquidity fetch — single-security, throttled
// ---------------------------------------------------------------------------
interface DhanHistoricalRow {
  record_date: string;
  close: number;
  volume: number;
  turnover_rs: number;
}

interface LiquidityFetchOutcome {
  symbol: string;
  exchange: Exchange;
  status: 'ok' | 'rate_limited' | 'error';
  rows: DhanHistoricalRow[];
  error?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchLiquidityForSymbol(args: {
  symbol: string;
  exchange: Exchange;
  dhanSecurityId: string | null;
  fromDateIso: string;
  toDateIso: string;
  dhanFetchUrl: string;
  serviceKey: string;
  maxRetries: number;
}): Promise<LiquidityFetchOutcome> {
  const symbolStartedAt = Date.now();
  const label = `${args.symbol}/${args.exchange}`;
  console.log(`cron diagnostic: liquidity_symbol_start label=${label} security_id=${args.dhanSecurityId ?? 'null'}`);
  let attempt = 0;
  let delayMs = 200;
  while (attempt <= args.maxRetries) {
    try {
      const attemptStartedAt = Date.now();
      console.log(`cron diagnostic: liquidity_symbol_attempt_start label=${label} attempt=${attempt + 1}`);
      const res = await fetch(args.dhanFetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${args.serviceKey}`,
        },
        body: JSON.stringify({
          endpoint: 'historical',
          securityId: args.dhanSecurityId,
          exchangeSegment: args.exchange === 'BSE' ? 'BSE_EQ' : 'NSE_EQ',
          params: {
            fromDate: args.fromDateIso,
            toDate: args.toDateIso,
            instrument: 'EQUITY',
          },
        }),
      });
      console.log(
        `cron diagnostic: liquidity_symbol_attempt_response label=${label} attempt=${attempt + 1} status=${res.status} elapsed_ms=${Date.now() - attemptStartedAt}`
      );
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After') ?? '0');
        const waitMs = Math.max(retryAfter * 1000, delayMs * 2);
        attempt++;
        if (attempt > args.maxRetries) {
          console.log(`cron diagnostic: liquidity_symbol_done label=${label} status=rate_limited elapsed_ms=${Date.now() - symbolStartedAt}`);
          return { symbol: args.symbol, exchange: args.exchange, status: 'rate_limited', rows: [] };
        }
        console.log(`cron diagnostic: liquidity_symbol_retry_wait label=${label} attempt=${attempt} wait_ms=${waitMs}`);
        await sleep(waitMs);
        delayMs = Math.min(delayMs * 2, 5000);
        continue;
      }
      if (!res.ok) {
        console.log(`cron diagnostic: liquidity_symbol_done label=${label} status=error http_status=${res.status} elapsed_ms=${Date.now() - symbolStartedAt}`);
        return {
          symbol: args.symbol,
          exchange: args.exchange,
          status: 'error',
          rows: [],
          error: `HTTP ${res.status}`,
        };
      }
      const json = await res.json();
      if (json?.success !== true) {
        console.log(`cron diagnostic: liquidity_symbol_done label=${label} status=error upstream_unsuccessful elapsed_ms=${Date.now() - symbolStartedAt}`);
        return {
          symbol: args.symbol,
          exchange: args.exchange,
          status: 'error',
          rows: [],
          error: json?.error ?? json?.message ?? 'dhan_fetch_unsuccessful',
        };
      }
      // dhan-fetch returns { success, data, endpoint, securityId }.
      // Historical arrays may sit at json.data or json.data.data depending on upstream nesting.
      const outer = json.data;
      const inner = (outer && typeof outer === 'object' && 'data' in outer && outer.data && typeof outer.data === 'object')
        ? outer.data
        : outer;
      const missing: string[] = [];
      if (!inner || typeof inner !== 'object') missing.push('data');
      const ts = inner?.timestamp;
      const closeArr = inner?.close;
      const volArr = inner?.volume;
      const turnoverArr = inner?.turnover ?? inner?.value;
      if (!Array.isArray(ts)) missing.push('timestamp');
      if (!Array.isArray(closeArr)) missing.push('close');
      if (!Array.isArray(volArr)) missing.push('volume');
      if (missing.length > 0) {
        console.log(`cron diagnostic: liquidity_symbol_done label=${label} status=error malformed_missing=${missing.join(',')} elapsed_ms=${Date.now() - symbolStartedAt}`);
        return {
          symbol: args.symbol,
          exchange: args.exchange,
          status: 'error',
          rows: [],
          error: `malformed_historical_payload: missing ${missing.join(',')}`,
        };
      }
      if (closeArr.length !== ts.length || volArr.length !== ts.length) {
        console.log(`cron diagnostic: liquidity_symbol_done label=${label} status=error length_mismatch elapsed_ms=${Date.now() - symbolStartedAt}`);
        return {
          symbol: args.symbol,
          exchange: args.exchange,
          status: 'error',
          rows: [],
          error: `malformed_historical_payload: length_mismatch ts=${ts.length} close=${closeArr.length} volume=${volArr.length}`,
        };
      }
      const parsedRows: DhanHistoricalRow[] = [];
      for (let i = 0; i < ts.length; i++) {
        const t = Number(ts[i]);
        const c = Number(closeArr[i]);
        const v = Number(volArr[i] ?? 0);
        if (!Number.isFinite(t) || t <= 0) continue;
        if (!Number.isFinite(c) || c <= 0) continue;
        const vol = Number.isFinite(v) ? v : 0;
        // PHASE 2S.3-FIX-H0-RETRY (OUTCOME B): always derive turnover_rs from
        // close*volume to match backfill-liquidity-20d. Ignoring upstream
        // turnoverArr guarantees cache-path / live-path numeric parity so that
        // canonLiquidityBundle hashing is deterministic regardless of cache state.
        const turnover_rs = c * vol;
        const record_date = new Date((t + 19800) * 1000).toISOString().slice(0, 10);
        parsedRows.push({ record_date, close: c, volume: vol, turnover_rs });
      }
      if (parsedRows.length === 0) {
        console.log(`cron diagnostic: liquidity_symbol_done label=${label} status=error no_valid_candles elapsed_ms=${Date.now() - symbolStartedAt}`);
        return {
          symbol: args.symbol,
          exchange: args.exchange,
          status: 'error',
          rows: [],
          error: 'no_valid_candles',
        };
      }
      console.log(`cron diagnostic: liquidity_symbol_done label=${label} status=ok rows=${parsedRows.length} elapsed_ms=${Date.now() - symbolStartedAt}`);
      return {
        symbol: args.symbol,
        exchange: args.exchange,
        status: 'ok',
        rows: parsedRows,
      };
    } catch (e) {
      attempt++;
      if (attempt > args.maxRetries) {
        console.log(`cron diagnostic: liquidity_symbol_done label=${label} status=error exception elapsed_ms=${Date.now() - symbolStartedAt}`);
        return {
          symbol: args.symbol,
          exchange: args.exchange,
          status: 'error',
          rows: [],
          error: e instanceof Error ? e.message : String(e),
        };
      }
      console.log(`cron diagnostic: liquidity_symbol_retry_wait label=${label} attempt=${attempt} wait_ms=${delayMs} error=${e instanceof Error ? e.message : String(e)}`);
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, 5000);
    }
  }
  return { symbol: args.symbol, exchange: args.exchange, status: 'error', rows: [] };
}

async function fetchLiquidityForUniverse(args: {
  members: Array<{ symbol: string; exchange: Exchange; dhan_security_id: string | null }>;
  fromDateIso: string;
  toDateIso: string;
  dhanFetchUrl: string;
  serviceKey: string;
}): Promise<LiquidityFetchOutcome[]> {
  const out: LiquidityFetchOutcome[] = [];
  const CHUNK_SIZE = 20;
  const INTRA_CALL_DELAY_MS = 200;
  for (let i = 0; i < args.members.length; i += CHUNK_SIZE) {
    const chunk = args.members.slice(i, i + CHUNK_SIZE);
    for (const m of chunk) {
      const outcome = await fetchLiquidityForSymbol({
        symbol: m.symbol,
        exchange: m.exchange,
        dhanSecurityId: m.dhan_security_id,
        fromDateIso: args.fromDateIso,
        toDateIso: args.toDateIso,
        dhanFetchUrl: args.dhanFetchUrl,
        serviceKey: args.serviceKey,
        maxRetries: 5,
      });
      out.push(outcome);
      await sleep(INTRA_CALL_DELAY_MS);
    }
  }
  return out;
}

async function appendLiquidity(
  supabase: SupabaseClient,
  outcomes: LiquidityFetchOutcome[]
): Promise<void> {
  const nowIso = new Date().toISOString();
  const rowsToInsert: Array<Record<string, unknown>> = [];
  for (const o of outcomes) {
    if (o.status === 'ok') {
      for (const row of o.rows) {
        rowsToInsert.push({
          symbol: o.symbol,
          exchange: o.exchange,
          record_date: row.record_date,
          close: row.close,
          volume: row.volume,
          turnover_rs: row.turnover_rs,
          fetch_status: 'ok',
          data_snapshot_at: nowIso,
          source_response_hash: null,
        });
      }
    } else {
      rowsToInsert.push({
        symbol: o.symbol,
        exchange: o.exchange,
        record_date: todayIst(),
        close: 0,
        volume: 0,
        turnover_rs: 0,
        fetch_status: o.status,
        data_snapshot_at: nowIso,
        source_response_hash: null,
      });
    }
  }
  const BATCH = 500;
  for (let i = 0; i < rowsToInsert.length; i += BATCH) {
    const slice = rowsToInsert.slice(i, i + BATCH);
    // Phase 2S.3-FIX-B: idempotent write — same (symbol, exchange, record_date,
    // data_snapshot_at) tuple may already exist from a prior in-day run at the
    // wider universe. Use ON CONFLICT DO NOTHING to preserve existing rows
    // (no overwrite, no row-count decrease, no NULL clobber).
    const { error } = await supabase
      .from('stock_picker_liquidity_20d')
      .upsert(slice, {
        onConflict: 'symbol,exchange,record_date,data_snapshot_at',
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`cron: liquidity append failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// cron_run_log helper
// Depends on Migration 0009 (cron_run_log table). If table is missing,
// insert errors are logged to console but do NOT crash the cron run.
// ---------------------------------------------------------------------------
async function logCronRun(
  supabase: SupabaseClient,
  args: {
    batch_id: string;
    mode: string;
    status: string;
    started_at: string;
    finished_at: string;
    error?: string;
    metrics?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from('cron_run_log').insert({
    function_name: 'stock-picker-daily-cron',
    batch_id: args.batch_id,
    mode: args.mode,
    status: args.status,
    started_at: args.started_at,
    finished_at: args.finished_at,
    error_message: args.error ?? null,
    metrics: args.metrics ?? null,
  });
  if (error) {
    console.error(`cron: cron_run_log insert failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Inter-function response shapes
// ---------------------------------------------------------------------------
interface ExclusionResponse {
  ok: boolean;
  batch_id: string;
  universe_snapshot_id: string;
  survivors: string[];
  rejected_symbols: string[];
  insufficient_data_symbols: string[];
  per_symbol_verdicts: Array<{
    symbol: string;
    exchange: Exchange;
    verdict: 'include' | 'exclude' | 'insufficient_data';
  }>;
  liquidity_records_for_hash: LiquidityHashInput[];
  exclusion_checks_for_hash: ExclusionCheckConfig[];
}

interface WriteAuditResponse {
  ok: boolean;
  results?: Array<{ op: string; id: string }>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const CODE_COMMIT_SHA = Deno.env.get('CODE_COMMIT_SHA') ?? 'unknown';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_env' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: DailyCronRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (body.mode !== 'live' && body.mode !== 'dry_run' && body.mode !== 'bootstrap') {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_mode' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const startedAt = new Date().toISOString();
  const batchId = crypto.randomUUID();
  const phaseMs: Record<string, number> = {};
  const markPhase = (name: string, start: number) => { phaseMs[name] = Date.now() - start; };

  try {
    // ---- Phase 1: config + kill-switch + calendar gates ----
    const tConfig = Date.now();
    logDiagnosticPhase(batchId, 'phase_config', 'start', tConfig, { mode: body.mode });
    const config = await loadConfig(supabase);

    const cronEnabled = jsonbBool(config.get(CFG.CRON_ENABLED), CFG.CRON_ENABLED);
    if (!cronEnabled && body.mode === 'live') {
      const finishedAt = new Date().toISOString();
      await logCronRun(supabase, {
        batch_id: batchId,
        mode: body.mode,
        status: 'skipped_kill_switch',
        started_at: startedAt,
        finished_at: finishedAt,
      });
      return new Response(
        JSON.stringify({ ok: true, batch_id: batchId, status: 'skipped_kill_switch' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const bootstrapCompleted = jsonbBoolWithDefault(
      config.get(CFG.BOOTSTRAP_COMPLETED),
      CFG.BOOTSTRAP_COMPLETED,
      false
    );
    if (body.mode === 'live' && !bootstrapCompleted) {
      throw new Error('cron: live mode blocked — bootstrap_completed is false');
    }
    if (body.mode === 'bootstrap' && bootstrapCompleted) {
      throw new Error('cron: bootstrap mode refused — bootstrap_completed is already true');
    }

    const runDateIst = body.run_date_ist ?? todayIst();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(runDateIst)) {
      throw new Error(`cron: invalid run_date_ist: ${runDateIst}`);
    }

    if (body.mode === 'live') {
      if (!await isTradingDay(supabase, runDateIst)) {
        const finishedAt = new Date().toISOString();
        await logCronRun(supabase, {
          batch_id: batchId,
          mode: body.mode,
          status: 'skipped_non_trading_day',
          started_at: startedAt,
          finished_at: finishedAt,
        });
        return new Response(
          JSON.stringify({ ok: true, batch_id: batchId, status: 'skipped_non_trading_day' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      await assertFutureCoverage(supabase, runDateIst);
    }

    const seedVersion = body.seed_version ?? jsonbString(
      config.get(CFG.ACTIVE_SEED_VERSION),
      CFG.ACTIVE_SEED_VERSION
    );
    const abortPct = jsonbNumber(
      config.get(CFG.ABORT_INSUF_DATA_PCT) ?? 25,
      CFG.ABORT_INSUF_DATA_PCT
    );
    markPhase('phase_config_ms', tConfig);
    logDiagnosticPhase(batchId, 'phase_config', 'done', tConfig, { run_date_ist: runDateIst, seed_version: seedVersion });

    // ---- Phase 2: universe build (CARRIES MEMBERS BACK — BLOCKER 1) ----
    // Phase 2S.3-FIX-H: if an active snapshot already exists (set by
    // active_universe_snapshot_id), READ it directly instead of re-running
    // the full build pipeline (which paginates ~45k stock_master rows and
    // re-applies cleanliness on every cron tick). This is the cron-reuse
    // path. We still fall through to invokeFunction('stock-picker-build-universe')
    // when no active snapshot is configured (bootstrap path / fresh project).
    const tUniverse = Date.now();
    logDiagnosticPhase(batchId, 'phase_universe', 'start', tUniverse, { seed_version: seedVersion });
    let universe: BuildUniverseResponse;
    const activeSnapIdRaw = config.get('active_universe_snapshot_id');
    const activeSnapId = typeof activeSnapIdRaw === 'string' && activeSnapIdRaw.length > 0
      ? activeSnapIdRaw
      : null;
    let reusePathHit = false;
    if (activeSnapId && body.mode !== 'bootstrap') {
      const { data: snapRow, error: snapErr } = await supabase
        .from('stock_picker_universe_snapshot')
        .select('id,seed_version,run_date_ist,universe_size,universe_snapshot_hash,seed_source_doc_sha')
        .eq('id', activeSnapId)
        .maybeSingle();
      if (snapErr) throw new Error(`cron: active snapshot lookup failed: ${snapErr.message}`);
      if (!snapRow) throw new Error(`cron: active snapshot ${activeSnapId} not found`);
      // Drain members in canonical_rank order (paginate past 1000-row cap).
      const PAGE = 1000;
      let from = 0;
      const members: UniverseMember[] = [];
      while (true) {
        const { data: m, error: mErr } = await supabase
          .from('stock_picker_universe_snapshot_member')
          .select('symbol,exchange,segment,isin,dhan_security_id,sector_canonical,alternate_listings,successor_applied,canonical_rank')
          .eq('universe_snapshot_id', activeSnapId)
          .order('canonical_rank', { ascending: true })
          .range(from, from + PAGE - 1);
        if (mErr) throw new Error(`cron: active snapshot members load failed: ${mErr.message}`);
        if (!m || m.length === 0) break;
        for (const r of m) {
          members.push({
            symbol: r.symbol as string,
            exchange: r.exchange as Exchange,
            segment: r.segment as UniverseMember['segment'],
            isin: r.isin as string | null,
            dhan_security_id: r.dhan_security_id as string | null,
            sector_canonical: r.sector_canonical as string | null,
            alternate_listings: Array.isArray(r.alternate_listings) ? (r.alternate_listings as string[]) : [],
            successor_applied: Boolean(r.successor_applied),
          });
        }
        if (m.length < PAGE) break;
        from += PAGE;
      }
      if (members.length !== (snapRow.universe_size as number)) {
        throw new Error(
          `cron: active snapshot member count ${members.length} != header universe_size ${snapRow.universe_size}`
        );
      }
      universe = {
        ok: true,
        universe_snapshot_id: snapRow.id as string,
        universe_size: snapRow.universe_size as number,
        universe_snapshot_hash: snapRow.universe_snapshot_hash as string,
        seed_source_doc_sha: snapRow.seed_source_doc_sha as string,
        reused_existing: true,
        members,
      };
      reusePathHit = true;
      console.log(`cron diagnostic: phase_universe_reuse_hit snapshot_id=${activeSnapId} size=${members.length} elapsed_ms=${Date.now() - tUniverse}`);
    } else {
      universe = await invokeFunction<BuildUniverseResponse>(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        'stock-picker-build-universe',
        {
          seed_version: seedVersion,
          run_date_ist: runDateIst,
          invoked_by: body.invoked_by,
        }
      );
      if (!universe.ok) throw new Error(`cron: build-universe returned not ok`);
      if (!Array.isArray(universe.members) || universe.members.length !== universe.universe_size) {
        throw new Error(
          `cron: build-universe response invariant violated — ` +
          `members.length=${universe.members?.length} but universe_size=${universe.universe_size}`
        );
      }
    }
    let canonicalMembers: UniverseMember[] = universe.members;
    markPhase('phase_universe_ms', tUniverse);
    logDiagnosticPhase(batchId, 'phase_universe', 'done', tUniverse, { universe_size: universe.universe_size, reuse_path_hit: reusePathHit });


    // ---- Phase 2b: universe override (test-only, config-driven) ----
    // Driven exclusively by stock_picker_runtime_config. When disabled or the
    // symbol list is empty, behavior is unchanged. When active, restricts the
    // in-memory canonical universe to the configured symbol whitelist BEFORE
    // any downstream work (liquidity fetch / exclusion consumption / hash).
    // The exclusion-engine still queries the full snapshot from the DB, so we
    // also filter its response below to keep N_excl == N_hash. Bootstrap path
    // is unaffected — override only applies to live/dry_run.
    let overrideSymbolSet: Set<string> | null = null;
    if (body.mode !== 'bootstrap') {
      const overrideEnabledRaw = config.get('universe_override_enabled');
      const overrideEnabled = overrideEnabledRaw === undefined
        ? false
        : jsonbBool(overrideEnabledRaw, 'universe_override_enabled');
      const overrideSymbolsRaw = config.get('universe_override_symbols');
      // Phase 2S fix: accept both legacy string entries and the
      // {symbol, exchange} object shape currently persisted in
      // stock_picker_runtime_config. Preserve array order (do not sort)
      // so replay payload identity is unaffected.
      const overrideSymbols: string[] = Array.isArray(overrideSymbolsRaw)
        ? (overrideSymbolsRaw as unknown[]).reduce<string[]>((acc, entry) => {
            if (typeof entry === 'string' && entry.length > 0) {
              acc.push(entry);
            } else if (entry && typeof entry === 'object') {
              const sym = (entry as Record<string, unknown>).symbol;
              if (typeof sym === 'string' && sym.length > 0) acc.push(sym);
            }
            return acc;
          }, [])
        : [];
      if (overrideEnabled && overrideSymbols.length > 0) {
        const set = new Set(overrideSymbols);
        const filtered = canonicalMembers.filter((m) => set.has(m.symbol));
        console.log(`phase2s_fix: override_short_circuit n=${filtered.length}`);
        const sortedSymbols = [...new Set(filtered.map((m) => m.symbol))].sort();
        console.log(`universe-override active: N=${filtered.length} symbols=${JSON.stringify(sortedSymbols)}`);
        canonicalMembers = filtered;
        overrideSymbolSet = set;
      }
    }

    // ---- Phase 2c: universe cleanliness filter (equities-only) ----
    // Config-driven, reversible. Applied AFTER override and BEFORE liquidity/
    // exclusion so bonds/ETFs never enter the equity pipeline as
    // "insufficient_data". Does not change replay schema; only shrinks the
    // canonical member set + overrideSymbolSet so N_excl == N_hash holds.
    const cleanliness_filtered: Array<{ symbol: string; exchange: string; reason: string }> = [];
    let cleanliness_n_in = canonicalMembers.length;
    let cleanliness_n_out = canonicalMembers.length;
    if (body.mode !== 'bootstrap' && canonicalMembers.length > 0) {
      const readFlag = (key: string, dflt: boolean): boolean => {
        const raw = config.get(key);
        if (raw === undefined || raw === null) return dflt;
        return jsonbBool(raw, key);
      };
      const f_type = readFlag('universe_filter_require_equity_type', true);
      const f_segment = readFlag('universe_filter_require_equity_segment', true);
      const f_suspended = readFlag('universe_filter_reject_suspended', true);
      const f_etf = readFlag('universe_filter_reject_etf_by_name', true);
      const f_ine = readFlag('universe_filter_require_ine_isin', false);
      const f_dhan = readFlag('universe_filter_require_dhan_security_id', true);
      const f_bond = readFlag('universe_filter_reject_bond_by_name', true);
      const f_bond_ticker = readFlag('universe_filter_reject_bond_by_ticker', false);

      console.log(`phase_universe_cleanliness start n_in=${cleanliness_n_in}`);

      const symbols = Array.from(new Set(canonicalMembers.map((m) => m.symbol)));
      const { data: meta, error: metaErr } = await supabase
        .from('stock_master')
        .select('symbol,exchange,type,segment,isin,company_name,is_suspended,dhan_security_id')
        .in('symbol', symbols);
      if (metaErr) throw new Error(`cleanliness: stock_master read failed: ${metaErr.message}`);

      // Aggregate per (symbol, exchange) — permissive on segment, conservative on suspended.
      type Agg = {
        any_equity_type: boolean;
        any_equity_segment: boolean;
        any_suspended: boolean;
        any_ine_isin: boolean;
        any_dhan: boolean;
        company_name: string | null;
      };
      const agg = new Map<string, Agg>();
      const EQUITY_TYPES = new Set(['EQUITY', 'EQ', 'STOCK']);
      const EQUITY_SEGMENTS = new Set(['EQ', 'NSE_EQ', 'BSE_EQ']);
      for (const r of (meta ?? []) as Array<Record<string, unknown>>) {
        const sym = String(r.symbol ?? '');
        const exch = String(r.exchange ?? '');
        const key = `${sym}|${exch}`;
        const cur = agg.get(key) ?? {
          any_equity_type: false,
          any_equity_segment: false,
          any_suspended: false,
          any_ine_isin: false,
          any_dhan: false,
          company_name: null,
        };
        if (typeof r.type === 'string' && EQUITY_TYPES.has(r.type.toUpperCase())) cur.any_equity_type = true;
        if (typeof r.segment === 'string' && EQUITY_SEGMENTS.has(r.segment.toUpperCase())) cur.any_equity_segment = true;
        if (r.is_suspended === true) cur.any_suspended = true;
        if (typeof r.isin === 'string' && r.isin.toUpperCase().startsWith('INE')) cur.any_ine_isin = true;
        if (r.dhan_security_id !== null && r.dhan_security_id !== undefined && String(r.dhan_security_id).length > 0) cur.any_dhan = true;
        if (cur.company_name === null && typeof r.company_name === 'string') cur.company_name = r.company_name;
        agg.set(key, cur);
      }

      const bondNameRe = /(^|\s)SDL\s|\d+(\.\d+)?\s*%\s*\d{4}/i;
      // ETF detection: pattern set (any match = ETF). Catches ticker- and
      // company-name styles (NETF, SBISMLETF, NIFTYBEES, GOLDBEES, etc.).
      const etfSymbolTokenRe = /(?:^|[^A-Z])(ETF|BEES|NIFTYBEES|BANKBEES|GOLDBEES|LIQUIDBEES|JUNIORBEES|N100|NV20)$/i;
      const etfSymbolSuffixRe = /ETF$/i;
      const etfNameContainsRe = /ETF/i;
      const etfNameExchTradedRe = /EXCHANGE\s+TRADED/i;
      const etfNameIndexFundRe = /INDEX\s+FUND/i;
      const etfNameNiftyEtfRe = /(NIFTY[\s\S]*ETF|ETF[\s\S]*NIFTY)/i;
      const isEtf = (sym: string, name: string | null): boolean => {
        if (sym && (etfSymbolTokenRe.test(sym) || etfSymbolSuffixRe.test(sym))) return true;
        if (!name) return false;
        if (etfNameContainsRe.test(name)) return true;
        if (etfNameExchTradedRe.test(name)) return true;
        if (etfNameIndexFundRe.test(name)) return true;
        if (etfNameNiftyEtfRe.test(name)) return true;
        return false;
      };


      const kept: typeof canonicalMembers = [];
      for (const m of canonicalMembers) {
        const key = `${m.symbol}|${m.exchange}`;
        const a = agg.get(key);
        let reason: string | null = null;
        if (!a) {
          reason = 'not_equity_type';
        } else if (f_type && !a.any_equity_type) {
          reason = 'not_equity_type';
        } else if (f_segment && !a.any_equity_segment) {
          reason = 'not_equity_segment';
        } else if (f_suspended && a.any_suspended) {
          reason = 'suspended';
        } else if (f_etf && isEtf(m.symbol, a.company_name)) {
          reason = 'etf_name';

        } else if (f_bond_ticker && (
          /^\d{3,4}[A-Z]{1,3}\d{2,3}[A-Z]?$/i.test(m.symbol) ||
          /^[A-Z]{2,4}\d{2,4}[A-Z]{1,3}\d{1,3}$/i.test(m.symbol) ||
          /(^|\s)SDL(\s|$)/i.test(m.symbol) ||
          /^SDL/i.test(m.symbol)
        )) {
          reason = 'bond_ticker';
        } else if (f_bond && a.company_name && bondNameRe.test(a.company_name)) {
          reason = 'bond_name';
        } else if (f_ine && !a.any_ine_isin) {
          reason = 'non_ine_isin';
        } else if (f_dhan && !a.any_dhan) {
          reason = 'missing_dhan_id';
        }
        if (reason) {
          cleanliness_filtered.push({ symbol: m.symbol, exchange: m.exchange, reason });
        } else {
          kept.push(m);
        }
      }

      canonicalMembers = kept;
      cleanliness_n_out = kept.length;
      // Mirror filter onto overrideSymbolSet so post-exclusion lock-step filter
      // continues to keep N_excl == N_hash.
      if (overrideSymbolSet) {
        const keptSymbols = new Set(kept.map((m) => m.symbol));
        const newSet = new Set<string>();
        for (const s of overrideSymbolSet) if (keptSymbols.has(s)) newSet.add(s);
        overrideSymbolSet = newSet;
      }

      console.log(`phase_universe_cleanliness done n_out=${cleanliness_n_out} filtered_out=${cleanliness_n_in - cleanliness_n_out}`);
      if (cleanliness_filtered.length > 0) {
        console.log(`cleanliness_filtered: ${JSON.stringify(cleanliness_filtered)}`);
      }
    }



    // ---- Phase 3: liquidity fetch + append ----
    const tLiquidity = Date.now();
    logDiagnosticPhase(batchId, 'phase_liquidity', 'start', tLiquidity, { universe_size: canonicalMembers.length });
    const dhanFetchUrl = `${SUPABASE_URL}/functions/v1/dhan-fetch`;
    const today = new Date();
    // PHASE 2S.3-FIX-H0-RETRY: exclude today's partial intraday bar from the
    // liquidity window so that two consecutive runs minutes apart see the
    // same closed-bar series and canonLiquidityBundle hashes identically.
    const toDate = new Date(today);
    toDate.setDate(toDate.getDate() - 1);
    const toDateIso = toDate.toISOString().slice(0, 10);
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - 30);
    const fromDateIso = fromDate.toISOString().slice(0, 10);

    if (body.mode === 'bootstrap') {
      // --- DETERMINISTIC CHUNKED BOOTSTRAP BRANCH ---
      // 1. Sort universe by symbol code-point (stable cursor)
      const sortedUniverse = [...canonicalMembers].sort((a, b) =>
        a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0
      );

      // 2. Find start index for this chunk
      let startIndex = 0;
      if (body.resume_from) {
        startIndex = sortedUniverse.findIndex(m => m.symbol === body.resume_from);
        if (startIndex === -1) {
          throw new Error(`bootstrap: resume_from symbol '${body.resume_from}' not found in universe`);
        }
        startIndex++; // Start from the next symbol after the cursor
      }

      // 3. Process exactly one chunk
      const chunk = sortedUniverse.slice(startIndex, startIndex + BOOTSTRAP_CHUNK_SIZE);
      const isFinalChunk = (startIndex + chunk.length) >= sortedUniverse.length;

      const outcomes = await fetchLiquidityForUniverse({
        members: chunk.map(m => ({ symbol: m.symbol, exchange: m.exchange, dhan_security_id: m.dhan_security_id })),
        fromDateIso,
        toDateIso,
        dhanFetchUrl,
        serviceKey: SUPABASE_SERVICE_ROLE_KEY,
      });
      logDiagnosticPhase(batchId, 'phase_liquidity_fetch', 'done', tLiquidity, { outcomes: outcomes.length });
      await appendLiquidity(supabase, outcomes);
      markPhase('phase_liquidity_ms', tLiquidity);
      logDiagnosticPhase(batchId, 'phase_liquidity', 'done', tLiquidity, { outcomes: outcomes.length });

      // 4. Continuation or finish
      const nextSymbol = isFinalChunk ? null : chunk[chunk.length - 1].symbol;

      // FRESHNESS LOG FIRES ONCE — on the final chunk only
      let freshness: Record<string, unknown> | null = null;
      if (isFinalChunk) {
        freshness = await getBootstrapFreshness(supabase);
      }

      // NOTE: bootstrap_completed is NOT flipped here. Operator must flip
      // it manually via SQL Editor after verifying warehouse depth.
      const finishedAt = new Date().toISOString();
      await logCronRun(supabase, {
        batch_id: batchId,
        mode: 'bootstrap',
        status: isFinalChunk ? 'completed' : 'chunk_finished',
        started_at: startedAt,
        finished_at: finishedAt,
        metrics: {
          chunk_start_index: startIndex,
          chunk_size: chunk.length,
          is_final: isFinalChunk,
          next_resume_symbol: nextSymbol,
          ...phaseMs,
          ...(freshness ? { final_freshness: freshness } : {}),
        },
      });

      return new Response(
        JSON.stringify({
          ok: true,
          batch_id: batchId,
          mode: 'bootstrap',
          status: isFinalChunk ? 'completed' : 'chunk_finished',
          next_resume_symbol: nextSymbol,
          is_final: isFinalChunk,
          metrics: phaseMs,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- LIVE / DRY_RUN BRANCH ---
    // PHASE 2S.3-FIX-H0: cache-first liquidity. Read pre-warmed
    // stock_picker_liquidity_20d rows for each (symbol, exchange) BEFORE
    // touching Dhan. Only cache-miss / stale-cache members go to the live
    // sequential fetch loop. This removes the wall-clock binding risk that
    // collapsed FIX-G's canary at ~200-member universe size.
    const tCache = Date.now();
    const FRESH_RECORD_LOOKBACK_DAYS = 5; // tolerate weekends/holidays
    const MIN_OK_ROWS_FOR_CACHE_HIT = 15; // ADV20 needs ≥20; allow ≥15 with recent rows
    const minRecordDateD = new Date(today);
    minRecordDateD.setDate(minRecordDateD.getDate() - FRESH_RECORD_LOOKBACK_DAYS);
    const minRecordDateIso = minRecordDateD.toISOString().slice(0, 10);
    const cacheSymbolList = Array.from(new Set(canonicalMembers.map((m) => m.symbol)));
    const cacheRowsAll: Array<{
      symbol: string; exchange: string; record_date: string;
      close: number | string; volume: number | string; turnover_rs: number | string;
    }> = [];
    if (cacheSymbolList.length > 0) {
      const CACHE_PAGE = 1000;
      let cacheFrom = 0;
      while (true) {
        const { data: page, error: cErr } = await supabase
          .from('stock_picker_liquidity_20d')
          .select('symbol,exchange,record_date,close,volume,turnover_rs')
          .in('symbol', cacheSymbolList)
          .eq('fetch_status', 'ok')
          .gte('record_date', fromDateIso)
          .lte('record_date', toDateIso)
          .order('record_date', { ascending: true })
          .range(cacheFrom, cacheFrom + CACHE_PAGE - 1);
        if (cErr) throw new Error(`cron: liquidity cache read failed: ${cErr.message}`);
        if (!page || page.length === 0) break;
        cacheRowsAll.push(...(page as typeof cacheRowsAll));
        if (page.length < CACHE_PAGE) break;
        cacheFrom += CACHE_PAGE;
      }
    }
    // PHASE 2S.3-FIX-H0-RETRY: deterministic cache materialization.
    // The cache may contain multiple rows for the same (symbol, exchange,
    // record_date) under different data_snapshot_at tags (legacy upstream-
    // turnover writes vs current close*volume writes, or repeated live
    // appends). Dedupe by record_date (last write wins by iteration order),
    // and ALWAYS recompute turnover_rs = close * volume so that cache-path
    // and live-path numeric values are bit-identical and canonLiquidityBundle
    // is invariant across cache state.
    const cacheByKeyDate = new Map<string, Map<string, DhanHistoricalRow>>();
    const cacheMaxRecord = new Map<string, string>();
    for (const r of cacheRowsAll) {
      const key = `${r.symbol}|${r.exchange}`;
      let perDate = cacheByKeyDate.get(key);
      if (!perDate) { perDate = new Map(); cacheByKeyDate.set(key, perDate); }
      const close = Number(r.close);
      const volume = Number(r.volume);
      perDate.set(r.record_date, {
        record_date: r.record_date,
        close,
        volume,
        turnover_rs: close * volume,
      });
      const prev = cacheMaxRecord.get(key);
      if (!prev || r.record_date > prev) cacheMaxRecord.set(key, r.record_date);
    }
    const cacheByKey = new Map<string, DhanHistoricalRow[]>();
    for (const [key, perDate] of cacheByKeyDate) {
      const arr = Array.from(perDate.values()).sort((a, b) =>
        a.record_date < b.record_date ? -1 : a.record_date > b.record_date ? 1 : 0
      );
      cacheByKey.set(key, arr);
    }
    const cachedOutcomes: LiquidityFetchOutcome[] = [];
    const missMembers: typeof canonicalMembers = [];
    for (const m of canonicalMembers) {
      const key = `${m.symbol}|${m.exchange}`;
      const rows = cacheByKey.get(key);
      const maxRec = cacheMaxRecord.get(key);
      if (rows && rows.length >= MIN_OK_ROWS_FOR_CACHE_HIT && maxRec && maxRec >= minRecordDateIso) {
        cachedOutcomes.push({ symbol: m.symbol, exchange: m.exchange as Exchange, status: 'ok', rows });
      } else {
        missMembers.push(m);
      }
    }
    const cacheElapsedMs = Date.now() - tCache;
    console.log(
      `phase_liquidity_cache: total=${canonicalMembers.length} ` +
      `hits=${cachedOutcomes.length} misses=${missMembers.length} ` +
      `elapsed_ms=${cacheElapsedMs}`
    );

    const liveOutcomes: LiquidityFetchOutcome[] = missMembers.length > 0
      ? await fetchLiquidityForUniverse({
          members: missMembers.map((m) => ({ symbol: m.symbol, exchange: m.exchange, dhan_security_id: m.dhan_security_id })),
          fromDateIso,
          toDateIso,
          dhanFetchUrl,
          serviceKey: SUPABASE_SERVICE_ROLE_KEY,
        })
      : [];
    const fetchOutcomes: LiquidityFetchOutcome[] = [...cachedOutcomes, ...liveOutcomes];
    logDiagnosticPhase(batchId, 'phase_liquidity_fetch', 'done', tLiquidity, {
      outcomes: fetchOutcomes.length,
      cache_hits: cachedOutcomes.length,
      live_fetches: liveOutcomes.length,
    });
    // Only append live-fetched rows; cached rows already exist in DB.
    if (liveOutcomes.length > 0) await appendLiquidity(supabase, liveOutcomes);
    markPhase('phase_liquidity_ms', tLiquidity);
    logDiagnosticPhase(batchId, 'phase_liquidity', 'done', tLiquidity, {
      outcomes: fetchOutcomes.length,
      cache_hits: cachedOutcomes.length,
      live_fetches: liveOutcomes.length,
    });

    // ---- Phase 4: exclusion ----
    const tExclusion = Date.now();
    logDiagnosticPhase(batchId, 'phase_exclusion', 'start', tExclusion, { universe_snapshot_id: universe.universe_snapshot_id });
    const exclusion = await invokeFunction<ExclusionResponse>(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      'stock-picker-exclusion-engine',
      {
        batch_id: batchId,
        universe_snapshot_id: universe.universe_snapshot_id,
      }
    );
    if (!exclusion.ok) throw new Error(`cron: exclusion-engine returned not ok`);

    // SP-1.6 universe override: keep exclusion response in lock-step with the
    // filtered canonical members. Bootstrap path never reaches here.
    if (overrideSymbolSet) {
      const inSet = (s: string) => overrideSymbolSet!.has(s);
      exclusion.per_symbol_verdicts = exclusion.per_symbol_verdicts.filter((v) => inSet(v.symbol));
      exclusion.survivors = exclusion.survivors.filter(inSet);
      exclusion.rejected_symbols = exclusion.rejected_symbols.filter(inSet);
      exclusion.insufficient_data_symbols = exclusion.insufficient_data_symbols.filter(inSet);
      exclusion.liquidity_records_for_hash = exclusion.liquidity_records_for_hash.filter((r) => inSet(r.symbol));
    }
    markPhase('phase_exclusion_ms', tExclusion);
    logDiagnosticPhase(batchId, 'phase_exclusion', 'done', tExclusion, { verdicts: exclusion.per_symbol_verdicts.length });

    // ---- Phase 5: abort threshold check ----
    const totalUniverse = overrideSymbolSet ? canonicalMembers.length : universe.universe_size;
    const insufficientCount = exclusion.insufficient_data_symbols.length;
    const insufficientPct = totalUniverse > 0 ? (insufficientCount / totalUniverse) * 100 : 0;
    const abortDueToData = insufficientPct > abortPct;

    // ---- Phase 6: build canonical bundle + hash ----
    //
    // SINGLE SOURCE OF TRUTH FOR MEMBERS = build-universe response.
    // BLOCKER 1 fix: pass canonicalMembers verbatim — same array build-universe
    // hashed into universe_snapshot_hash.
    // SP-1.6 Step 5 — freshness pin: single canonical date for this run.
    const dataFreshnessDate = runDateIst;

    // SP-1.6 Step 5 — freshness pin check: no liquidity row may post-date the run.
    for (const rec of exclusion.liquidity_records_for_hash) {
      if (typeof rec.record_date === 'string' && rec.record_date > dataFreshnessDate) {
        throw new Error('freshness-pin violation: future-dated record_date detected');
      }
    }

    // SP-1.6 Step 5 — row-count assert before hashing.
    const N_excl = exclusion.per_symbol_verdicts.length;
    const N_hash = canonicalMembers.length;
    if (N_excl !== N_hash) {
      throw new Error(`row-count mismatch: exclusion=${N_excl} hash=${N_hash}`);
    }
    console.log(`row-count ok: ${N_hash}`);

    const tHash = Date.now();
    const bundle: CanonicalBundle = {
      schema_version: REPLAY_SCHEMA_VERSION as unknown as CanonicalBundle['schema_version'],
      batch_id: batchId,
      seed_version: seedVersion,
      run_date_ist: runDateIst,
      universe_snapshot_hash: universe.universe_snapshot_hash,
      universe_members: { members: canonicalMembers },
      liquidity_bundle: { records: exclusion.liquidity_records_for_hash },
      exclusion_checks: { checks: exclusion.exclusion_checks_for_hash },
      data_freshness_date: dataFreshnessDate,
    };
    const { hash: computedReplayHash, version: replayHashVersion } =
      await computeReplayPayloadHash(bundle);
    markPhase('phase_hash_ms', tHash);

    // ---- Phase 7: route to writer ----
    //
    // DEFECT 4 — Aborted-batch hash policy:
    //   We COMPUTE the hash so the determinism contract still runs end-to-end
    //   (forensic continuity, error detection), but we PERSIST null for the
    //   replay_payload_hash when batch_state='aborted'. This makes the
    //   persisted column a strict replay anchor: non-null ⇔ replayable.
    //
    // REPAIR 2: removed dead `if (body.mode === 'bootstrap')` branch — bootstrap
    // returned early in Phase 3, so it never reaches this point.
    const tWrite = Date.now();

    const batchType: BatchType = body.mode === 'dry_run' ? 'dry_run' : 'live';
    // Phase 2R repair: write-audit's ALLOWED_MATRIX recognizes
    //   dry_run/{completed,aborted} and live/{completed,aborted}.
    // Map dry_run mode to dry_run/completed (or dry_run/aborted on data
    // outage) to satisfy the matrix without weakening SP-1.6 guarantees.
    const batchState: BatchState = abortDueToData ? 'aborted' : 'completed';

    // DEFECT 4: hash persisted ⇔ batch_state in {'completed','dry_run'}
    const persistedHash: string | null =
      batchState === 'aborted' ? null : computedReplayHash;

    const generatedAt = new Date().toISOString();

    // BLOCKER 2: locked regulatory-status.ts shape — no arg; field names:
    //   regulatory_status_at_generation, sebi_reg_no, firm_legal_name.
    // SP-1.6 Step 5: stamp is now async.
    const stamp = await currentRegulatoryStamp();

    // SP-1.6 Step 5: replay version constant moved to replay-hash and bumped.
    // Cast to the existing params type (typed against the v1 string literal).
    const replayHashVersionForParams =
      replayHashVersion as unknown as WriteBatchRejectionParams['p_replay_payload_hash_version'];

    const rejectionParams: WriteBatchRejectionParams = {
      p_batch_id: batchId,
      p_batch_type: batchType,
      p_batch_state: batchState,
      p_run_at: generatedAt,
      p_near_miss_symbols: null,
      p_rejected_symbols: JSON.stringify(exclusion.rejected_symbols),
      p_insufficient_data_symbols: JSON.stringify(exclusion.insufficient_data_symbols),
      p_picks_issued_count: exclusion.survivors.length,
      p_code_commit_sha: CODE_COMMIT_SHA,
      p_replay_payload_hash: persistedHash,
      p_replay_payload_hash_version: replayHashVersionForParams,
      p_data_gaps_at_generation: null,
      p_universe_snapshot_id: universe.universe_snapshot_id,
      p_rejected_count: exclusion.rejected_symbols.length,
      p_insufficient_count: exclusion.insufficient_data_symbols.length,
      p_total_universe_count: totalUniverse,
      p_regulatory_status_at_generation: stamp.regulatory_status_at_generation,
      p_reg_no: stamp.sebi_reg_no,
      p_legal_name: stamp.firm_legal_name,
    };

    // SP-1.5 audit integrity fix: include one write_pick_audit op per
    // included survivor so stock_picker_pick_audit is populated alongside
    // stock_picker_batch_rejection.
    // SP-1.6 perf: deterministic ordering — isin ASC NULLS LAST, symbol ASC, exchange ASC.
    const isinBySymbolExchange = new Map<string, string | null>();
    for (const m of canonicalMembers) {
      isinBySymbolExchange.set(`${m.symbol}|${m.exchange}`, m.isin ?? null);
    }
    const includedSurvivors = exclusion.per_symbol_verdicts
      .filter((v) => v.verdict === 'include')
      .map((s) => ({ ...s, isin: isinBySymbolExchange.get(`${s.symbol}|${s.exchange}`) ?? null }))
      .sort((a, b) => {
        if (a.isin === null && b.isin !== null) return 1;
        if (a.isin !== null && b.isin === null) return -1;
        if (a.isin !== null && b.isin !== null && a.isin !== b.isin) return a.isin < b.isin ? -1 : 1;
        if (a.symbol !== b.symbol) return a.symbol < b.symbol ? -1 : 1;
        return a.exchange < b.exchange ? -1 : a.exchange > b.exchange ? 1 : 0;
      });

    // Phase 2R: per-profile knobs + composite_score computation.
    // Mirrors stock-recommendation-query previewComposite() math, honoring
    // profile_knobs_<risk_profile> overrides (Phase 2Q). Score is computed
    // from the in-memory liquidity outcomes already fetched this run.
    type KnobsR = {
      vol_clamp_min: number; vol_clamp_max: number; vol_default: number;
      w_vol: number; w_trend: number; w_mr: number;
    };
    const KNOB_DEFAULTS_R: KnobsR = {
      vol_clamp_min: 0.005, vol_clamp_max: 0.05, vol_default: 0.02,
      w_vol: 0.4, w_trend: 0.4, w_mr: 0.2,
    };
    const knobsR: KnobsR = { ...KNOB_DEFAULTS_R };
    const ALLOWED_PROFILES = new Set(['conservative', 'moderate', 'aggressive', 'ultra']);
    const riskProfile: string = (body.risk_profile && ALLOWED_PROFILES.has(body.risk_profile))
      ? body.risk_profile
      : 'moderate';
    const profileOverrideRaw = config.get(`profile_knobs_${riskProfile}`);
    if (profileOverrideRaw && typeof profileOverrideRaw === 'object' && !Array.isArray(profileOverrideRaw)) {
      const ov = profileOverrideRaw as Record<string, unknown>;
      const map: Array<[keyof KnobsR, string]> = [
        ['vol_clamp_min', 'zone_vol_clamp_min'],
        ['vol_clamp_max', 'zone_vol_clamp_max'],
        ['vol_default',   'zone_vol_default'],
        ['w_vol',         'score_weight_vol'],
        ['w_trend',       'score_weight_trend'],
        ['w_mr',          'score_weight_mean_rev'],
      ];
      for (const [field, key] of map) {
        const raw = ov[key];
        const n = typeof raw === 'number' ? raw : (typeof raw === 'string' ? Number(raw) : NaN);
        if (Number.isFinite(n)) (knobsR as Record<string, number>)[field] = n;
      }
    }

    // Index liquidity outcomes by symbol|exchange for per-survivor scoring.
    const rowsBySymbolExchange = new Map<string, DhanHistoricalRow[]>();
    for (const o of fetchOutcomes) {
      if (o.status === 'ok' && o.rows.length > 0) {
        // sort ascending by record_date so vol/sma/pct_change are stable
        const sorted = [...o.rows].sort((a, b) => a.record_date < b.record_date ? -1 : 1);
        rowsBySymbolExchange.set(`${o.symbol}|${o.exchange}`, sorted);
      }
    }
    function clampR(n: number, lo: number, hi: number): number {
      return Math.max(lo, Math.min(hi, n));
    }
    function computeCompositeScore(symbol: string, exchange: string): number | null {
      const rows = rowsBySymbolExchange.get(`${symbol}|${exchange}`);
      if (!rows || rows.length < 3) return null;
      const win = rows.slice(-20);
      const closes = win.map(r => r.close);
      const cmp = closes[closes.length - 1];
      if (!Number.isFinite(cmp) || cmp <= 0) return null;
      const sma = closes.reduce((a, b) => a + b, 0) / closes.length;
      // realized daily-return stddev (mirrors recommendation-query realizedVol)
      const rets: number[] = [];
      for (let i = 1; i < closes.length; i++) {
        const p = closes[i - 1], c = closes[i];
        if (p > 0) rets.push((c - p) / p);
      }
      let vol: number | null = null;
      if (rets.length >= 2) {
        const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
        const variance = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rets.length - 1);
        vol = Math.sqrt(Math.max(0, variance));
      }
      const oldest = closes[0];
      const pct = oldest > 0 ? ((cmp - oldest) / oldest) * 100 : null;
      const volScore = vol == null ? 50 : 100 * (1 - clampR(vol / knobsR.vol_clamp_max, 0, 1));
      const trendScore = pct == null ? 50 : clampR(50 + pct * 2.5, 0, 100);
      let proxScore = 50;
      if (sma > 0) {
        const dev = Math.abs(cmp - sma) / sma;
        proxScore = 100 * (1 - clampR(dev / 0.2, 0, 1));
      }
      const blended = knobsR.w_vol * volScore + knobsR.w_trend * trendScore + knobsR.w_mr * proxScore;
      return Math.round(clampR(blended, 0, 100) * 10) / 10;
    }

    const pickAuditOps = includedSurvivors.map((survivor) => {
      const composite = computeCompositeScore(survivor.symbol, survivor.exchange);
      const params: WriteAuditRowParams = {
        p_batch_id: batchId,
        p_batch_type: batchType,
        p_generated_at: generatedAt,
        p_symbol: survivor.symbol,
        p_exchange: survivor.exchange,
        p_verdict: 'include',
        p_composite_score: composite,
        p_pillar_scores: null,
        p_data_gaps_at_generation: null,
        p_code_commit_sha: CODE_COMMIT_SHA,
        p_replay_payload_hash: computedReplayHash,
        p_replay_payload_hash_version: replayHashVersionForParams,
        p_universe_snapshot_id: universe.universe_snapshot_id,
        p_regulatory_status_at_generation: stamp.regulatory_status_at_generation,
        p_reg_no: stamp.sebi_reg_no,
        p_legal_name: stamp.firm_legal_name,
      };
      // Phase 2R: risk_profile_guard is at OP level (sibling of params).
      // It MUST NOT enter the replay-hash payload bundle. It is consumed
      // only by write-audit to choose persistence (null vs real score).
      return { op: 'write_pick_audit' as const, params, risk_profile_guard: riskProfile };
    });

    // SP-1.6 Step 5: forward internal invocation secret to write-audit when set.
    const internalSecret = Deno.env.get('SP1_INTERNAL_INVOCATION_SECRET') ?? '';
    const writeAuditHeaders: Record<string, string> = {};
    if (internalSecret.length > 0) {
      writeAuditHeaders['x-sp1-internal-secret'] = internalSecret;
    }

    const writeResults = await invokeFunction<WriteAuditResponse>(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      'stock-picker-write-audit',
      {
        invoked_by: body.invoked_by,
        operations: [
          { op: 'write_batch_rejection', params: rejectionParams },
          ...pickAuditOps,
        ],
      },
      writeAuditHeaders
    );
    if (!writeResults.ok) {
      throw new Error(`cron: write-audit failed: ${writeResults.error}`);
    }
    markPhase('phase_write_ms', tWrite);

    // ---- Phase 8: cron_run_log ----
    const finishedAt = new Date().toISOString();
    const topStatus = abortDueToData ? 'aborted' : 'ok';
    await logCronRun(supabase, {
      batch_id: batchId,
      mode: body.mode,
      status: topStatus,
      started_at: startedAt,
      finished_at: finishedAt,
      metrics: {
        status: topStatus,
        errors_count: 0,
        universe_size: totalUniverse,
        survivors: exclusion.survivors.length,
        rejected: exclusion.rejected_symbols.length,
        insufficient: exclusion.insufficient_data_symbols.length,
        insufficient_pct: insufficientPct,
        abort_pct_threshold: abortPct,
        computed_replay_payload_hash: computedReplayHash,
        persisted_replay_payload_hash: persistedHash,
        replay_hash_version: replayHashVersion,
        batch_type: batchType,
        batch_state: batchState,
        ...phaseMs,
        cleanliness_n_in,
        cleanliness_n_out,
        cleanliness_filtered_count: cleanliness_filtered.length,
        cleanliness_filtered,
      },
    });


    return new Response(
      JSON.stringify({
        ok: true,
        batch_id: batchId,
        mode: body.mode,
        batch_type: batchType,
        batch_state: batchState,
        universe_snapshot_id: universe.universe_snapshot_id,
        universe_size: totalUniverse,
        survivors: exclusion.survivors.length,
        rejected: exclusion.rejected_symbols.length,
        insufficient: exclusion.insufficient_data_symbols.length,
        // Both hashes returned for observability:
        // computed = always present (forensic), persisted = null when aborted.
        computed_replay_payload_hash: computedReplayHash,
        persisted_replay_payload_hash: persistedHash,
        write_results: writeResults,
        metrics: phaseMs,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));
    console.error('cron fatal:', msg, e);
    try {
      const nowIso = new Date().toISOString();
      await supabase.from('cron_run_log').insert({
        function_name: 'stock-picker-daily-cron',
        status: 'error',
        started_at: nowIso,
        finished_at: nowIso,
        error_message: msg,
        metrics: { status: 'error', errors_count: 1, error_message: msg },
      });
    } catch { /* swallow */ }
    return new Response(JSON.stringify({ ok: false, error: msg ?? 'unknown_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
