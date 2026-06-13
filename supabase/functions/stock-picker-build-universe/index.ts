// =============================================================================
// SP-1 Build Universe — deterministic seed → snapshot
// Location: supabase/functions/stock-picker-build-universe/index.ts
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type {
  UniverseMember,
  Exchange,
  Segment,
  InvokedBy,
  BuildUniverseResponse,
} from '../_shared/stock-picker/types.ts';
import { canonUniverseMembers } from '../_shared/stock-picker/replay-hash.ts';
import { SUCCESSOR_MAP } from '../_shared/symbol-successors.ts';

interface BuildUniverseRequest {
  seed_version: string;
  run_date_ist: string;
  invoked_by: InvokedBy;
}

async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface RawSeedRow {
  symbol: string;
  exchange: string;
  segment: string;
  type: string | null;
  isin: string | null;
  dhan_security_id: string | null;
  sector_canonical: string | null;
  alternate_listings: unknown;
  company_name: string | null;
  is_suspended: boolean | null;
  is_asm: boolean | null;
  is_gsm: boolean | null;
  is_t2t: boolean | null;
}

async function loadSeedRows(
  supabase: SupabaseClient,
  seedVersion: string
): Promise<{ rows: RawSeedRow[]; rawBytes: Uint8Array }> {
  // Phase 2S.3-FIX-G: paginate to bypass PostgREST 1000-row default cap
  // (stock_master holds ~45k rows for seed v1; the previous unpaginated
  // select silently truncated the universe to 1000).
  const PAGE = 1000;
  let from = 0;
  const all: RawSeedRow[] = [];
  while (true) {
    const { data, error } = await supabase
      .from('stock_master')
      .select('symbol,exchange,segment,type,isin,dhan_security_id,sector_canonical,alternate_listings,company_name,is_suspended,is_asm,is_gsm,is_t2t')
      .eq('seed_version', seedVersion)
      .order('exchange', { ascending: true })
      .order('symbol', { ascending: true })
      .order('isin', { ascending: true, nullsFirst: true })
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`build-universe: failed to load seed '${seedVersion}': ${error.message}`);
    }
    if (!data || data.length === 0) break;
    for (const r of data) all.push(r as RawSeedRow);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  if (all.length === 0) {
    throw new Error(`build-universe: seed '${seedVersion}' returned zero rows`);
  }

  const stable = [...all].sort((a, b) => {
    const aKey = `${a.exchange}|${a.symbol}|${a.isin ?? ''}`;
    const bKey = `${b.exchange}|${b.symbol}|${b.isin ?? ''}`;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
  const stableJson = JSON.stringify(stable);
  const rawBytes = new TextEncoder().encode(stableJson);

  return { rows: all, rawBytes };
}

interface SuccessorAppliedRow extends RawSeedRow {
  successor_applied: boolean;
}

function applySuccessors(rows: RawSeedRow[]): SuccessorAppliedRow[] {
  return rows.map(row => {
    const successor = SUCCESSOR_MAP[row.symbol];
    if (successor && successor.exchange === row.exchange) {
      return {
        ...row,
        symbol: successor.successor_symbol,
        isin: successor.successor_isin ?? row.isin,
        successor_applied: true,
      };
    }
    return { ...row, successor_applied: false };
  });
}

// =====================================================================
// Phase 2S.3-FIX-G: equity cleanliness predicate
// Mirrors sync-ohlcv-history/index.ts (EQUITY_TYPES, EQUITY_SEGMENTS,
// bond/ETF regexes) PLUS the runtime flag exclusions enforced by the
// stock-picker-exclusion-engine (is_asm/is_gsm/is_t2t/is_suspended).
// Inlined here (not extracted to _shared-picker) to keep this fix
// single-file and avoid touching the green sync-ohlcv-history function.
// Regex / Set values copied verbatim from sync-ohlcv-history.
// =====================================================================
const PICKER_EQUITY_TYPES = new Set(['EQUITY', 'EQ', 'STOCK']);
const PICKER_EQUITY_SEGMENTS = new Set(['EQ', 'BE', 'NSE_EQ', 'BSE_EQ']);
const bondNameRe = /(^|\s)SDL\s|\d+(\.\d+)?\s*%\s*\d{4}/i;
const etfSymbolTokenRe = /(?:^|[^A-Z])(ETF|BEES|NIFTYBEES|BANKBEES|GOLDBEES|LIQUIDBEES|JUNIORBEES|N100|NV20)$/i;
const etfSymbolSuffixRe = /ETF$/i;
const etfNameRe = /ETF|EXCHANGE\s+TRADED|INDEX\s+FUND/i;
const bondTicker1Re = /^\d{3,4}[A-Z]{1,3}\d{2,3}[A-Z]?$/;
const bondTicker2Re = /^[A-Z]{2,4}\d{2,4}[A-Z]{1,3}\d{1,3}$/;

function isCleanEquityForPicker(r: SuccessorAppliedRow): boolean {
  if (r.exchange !== 'NSE' && r.exchange !== 'BSE') return false;
  if (!r.type || !PICKER_EQUITY_TYPES.has(r.type.toUpperCase())) return false;
  if (typeof r.segment !== 'string') return false;
  if (!PICKER_EQUITY_SEGMENTS.has(r.segment.toUpperCase())) return false;
  if (!r.dhan_security_id || r.dhan_security_id === '') return false;
  if (r.is_suspended === true) return false;
  if (r.is_asm === true) return false;
  if (r.is_gsm === true) return false;
  if (r.is_t2t === true) return false;
  // Symbol cannot start with a digit (rejects bond ISIN-style tickers
  // like '0PMPL29', '1005MFL28A').
  if (/^\d/.test(r.symbol)) return false;
  // ETF / index-fund ticker patterns.
  if (etfSymbolTokenRe.test(r.symbol)) return false;
  if (etfSymbolSuffixRe.test(r.symbol)) return false;
  // Phase 2S.3-FIX-G contamination spec: reject any ticker ending in BEES
  // (e.g. INFRABEES, ITBEES, LTGILTBEES, MANUFGBEES, PHARMABEES) that
  // sync-ohlcv-history's token-boundary regex misses.
  if (/BEES$/i.test(r.symbol)) return false;
  // Bond / SDL ticker patterns.
  if (bondTicker1Re.test(r.symbol)) return false;
  if (bondTicker2Re.test(r.symbol)) return false;
  // ETF / SDL / coupon-rate name patterns.
  const name = r.company_name ?? '';
  if (name && (etfNameRe.test(name) || bondNameRe.test(name))) return false;
  return true;
}

function filterEquitySegments(rows: SuccessorAppliedRow[]): SuccessorAppliedRow[] {
  return rows.filter(isCleanEquityForPicker);
}

// Phase 2S.3-FIX-H Step 1: per (symbol, exchange) keep only ONE row.
// Prefer the canonical segment label (NSE_EQ / BSE_EQ); fall back to EQ/BE.
function canonicalizeSegment(rows: SuccessorAppliedRow[]): SuccessorAppliedRow[] {
  const rank = (exchange: string, segment: string): number => {
    const seg = (segment ?? '').toUpperCase();
    if (exchange === 'NSE' && seg === 'NSE_EQ') return 0;
    if (exchange === 'BSE' && seg === 'BSE_EQ') return 0;
    if (seg === 'EQ') return 1;
    if (seg === 'BE') return 2;
    return 3;
  };
  const best = new Map<string, SuccessorAppliedRow>();
  for (const r of rows) {
    const key = `${r.symbol}|${r.exchange}`;
    const existing = best.get(key);
    if (!existing) { best.set(key, r); continue; }
    const rNew = rank(r.exchange, r.segment);
    const rOld = rank(existing.exchange, existing.segment);
    if (rNew < rOld) best.set(key, r);
  }
  return [...best.values()];
}

// Phase 2S.3-FIX-H Step 2: if the same symbol exists on both NSE and BSE,
// keep only the NSE row. BSE rows survive only if the symbol is not on NSE.
function preferNsePrimary(rows: SuccessorAppliedRow[]): SuccessorAppliedRow[] {
  const nseSymbols = new Set<string>();
  for (const r of rows) if (r.exchange === 'NSE') nseSymbols.add(r.symbol);
  return rows.filter(r => r.exchange === 'NSE' || !nseSymbols.has(r.symbol));
}



// =====================================================================
// Phase 2S.3-FIX-J: OHLCV-presence equity-purity filter.
// Keep only (symbol, exchange) pairs that have >=20 rows of price history
// in stock_picker_ohlcv_history. Bonds / SGB / MTN / ETF tranches have
// none, so they drop out naturally — no symbol regex required.
//
// PostgREST cap-safe: we paginate the aggregate query (range loops of
// PAGE rows) rather than relying on an unpaginated select, matching the
// pattern used by sync-ohlcv-history's coverage probe.
// =====================================================================
async function loadOhlcvEligiblePairs(supabase: SupabaseClient): Promise<Set<string>> {
  const PAGE = 1000;
  // group_by via PostgREST isn't available; use an RPC-free approach by
  // selecting distinct (symbol, exchange) rows from a server-side view-less
  // path: pull rows in pages from a HEAD-counted, sorted projection.
  // Simpler & correct: page over distinct pairs via a recursive scan using
  // (symbol, exchange) ordering — fetch all rows of (symbol, exchange) in
  // batches and tally counts client-side. Warehouse currently ~800 pairs
  // with >=20 rows; total rows ~tens of thousands — well within budget.
  const counts = new Map<string, number>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('stock_picker_ohlcv_history')
      .select('symbol,exchange')
      .order('symbol', { ascending: true })
      .order('exchange', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`build-universe: ohlcv eligibility scan failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const k = `${(r as any).symbol}|${(r as any).exchange}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  const eligible = new Set<string>();
  for (const [k, n] of counts) if (n >= 20) eligible.add(k);
  return eligible;
}

function filterByOhlcvPresence(
  rows: SuccessorAppliedRow[],
  eligible: Set<string>
): SuccessorAppliedRow[] {
  return rows.filter(r => eligible.has(`${r.symbol}|${r.exchange}`));
}

function dedupByIsin(rows: SuccessorAppliedRow[]): SuccessorAppliedRow[] {
  const seen = new Set<string>();
  const out: SuccessorAppliedRow[] = [];
  for (const r of rows) {
    if (r.isin === null || r.isin === '') {
      out.push(r);
      continue;
    }
    if (seen.has(r.isin)) continue;
    seen.add(r.isin);
    out.push(r);
  }
  return out;
}

function canonicalSort(rows: SuccessorAppliedRow[]): SuccessorAppliedRow[] {
  return [...rows].sort((a, b) => {
    const aKey: string = a.isin ?? 'NULL';
    const bKey: string = b.isin ?? 'NULL';
    const aCPs = [...aKey];
    const bCPs = [...bKey];
    const maxLen = Math.max(aCPs.length, bCPs.length);
    for (let i = 0; i < maxLen; i++) {
      const aCp = i < aCPs.length ? aCPs[i].codePointAt(0)! : 0;
      const bCp = i < bCPs.length ? bCPs[i].codePointAt(0)! : 0;
      if (aCp !== bCp) return aCp - bCp;
    }
    return 0;
  });
}

function toUniverseMembers(rows: SuccessorAppliedRow[]): UniverseMember[] {
  return rows.map(r => ({
    symbol: r.symbol,
    exchange: r.exchange as Exchange,
    segment: r.segment as Segment,
    isin: r.isin,
    dhan_security_id: r.dhan_security_id,
    sector_canonical: r.sector_canonical,
    alternate_listings: Array.isArray(r.alternate_listings)
      ? (r.alternate_listings as string[])
      : [],
    successor_applied: r.successor_applied,
  }));
}

async function upsertSnapshot(
  supabase: SupabaseClient,
  args: {
    seed_version: string;
    run_date_ist: string;
    universe_size: number;
    universe_snapshot_hash: string;
    seed_source_doc_sha: string;
    code_commit_sha: string;
    invoked_by: InvokedBy;
    members: UniverseMember[];
  }
): Promise<{ id: string; reused: boolean }> {
  const { data: existing, error: selErr } = await supabase
    .from('stock_picker_universe_snapshot')
    .select('id,universe_snapshot_hash')
    .eq('seed_version', args.seed_version)
    .eq('run_date_ist', args.run_date_ist)
    .maybeSingle();

  if (selErr) throw new Error(`build-universe: select existing snapshot failed: ${selErr.message}`);

  if (existing) {
    if (existing.universe_snapshot_hash !== args.universe_snapshot_hash) {
      throw new Error(`build-universe: DETERMINISM VIOLATION — hash differs`);
    }
    return { id: existing.id as string, reused: true };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('stock_picker_universe_snapshot')
    .insert({
      seed_version: args.seed_version,
      run_date_ist: args.run_date_ist,
      universe_size: args.universe_size,
      universe_snapshot_hash: args.universe_snapshot_hash,
      seed_source_doc_sha: args.seed_source_doc_sha,
      code_commit_sha: args.code_commit_sha,
      invoked_by: args.invoked_by,
    })
    .select('id')
    .single();

  if (insErr || !inserted) throw new Error(`build-universe: snapshot header insert failed`);

  const snapshotId = inserted.id as string;
  const BATCH_SIZE = 1000;
  const PARALLEL = 8;
  const batches: { i: number; rows: any[] }[] = [];
  for (let i = 0; i < args.members.length; i += BATCH_SIZE) {
    const slice = args.members.slice(i, i + BATCH_SIZE);
    const memberRows = slice.map((m, idx) => ({
      universe_snapshot_id: snapshotId,
      symbol: m.symbol,
      exchange: m.exchange,
      segment: m.segment,
      isin: m.isin,
      dhan_security_id: m.dhan_security_id,
      sector_canonical: m.sector_canonical,
      alternate_listings: m.alternate_listings,
      successor_applied: m.successor_applied,
      canonical_rank: i + idx + 1,
    }));
    batches.push({ i, rows: memberRows });
  }
  for (let p = 0; p < batches.length; p += PARALLEL) {
    const group = batches.slice(p, p + PARALLEL);
    const results = await Promise.all(group.map(b =>
      supabase.from('stock_picker_universe_snapshot_member').insert(b.rows).then(r => ({ i: b.i, err: r.error }))
    ));
    for (const r of results) {
      if (r.err) throw new Error(`build-universe: member insert failed at batch ${r.i}: ${r.err.message}`);
    }
  }

  return { id: snapshotId, reused: false };
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CODE_COMMIT_SHA = Deno.env.get('CODE_COMMIT_SHA') ?? 'unknown';

  const body: BuildUniverseRequest = await req.json();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    const { rows: rawRows, rawBytes } = await loadSeedRows(supabase, body.seed_version);
    const seedSourceDocSha = await sha256Hex(rawBytes);

    const successored = applySuccessors(rawRows);
    const filtered = filterEquitySegments(successored);
    const segCanon = canonicalizeSegment(filtered);
    const nsePrimary = preferNsePrimary(segCanon);
    const deduped = dedupByIsin(nsePrimary);
    const sorted = canonicalSort(deduped);
    const members = toUniverseMembers(sorted);

    const universeCanonical = canonUniverseMembers({ members });
    const universeSnapshotHash = await sha256Hex(universeCanonical);

    const { id, reused } = await upsertSnapshot(supabase, {
      seed_version: body.seed_version,
      run_date_ist: body.run_date_ist,
      universe_size: members.length,
      universe_snapshot_hash: universeSnapshotHash,
      seed_source_doc_sha: seedSourceDocSha,
      code_commit_sha: CODE_COMMIT_SHA,
      invoked_by: body.invoked_by,
      members,
    });

    return new Response(JSON.stringify({
      ok: true,
      universe_snapshot_id: id,
      universe_size: members.length,
      universe_snapshot_hash: universeSnapshotHash,
      seed_source_doc_sha: seedSourceDocSha,
      reused_existing: reused,
      members,
    }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
});