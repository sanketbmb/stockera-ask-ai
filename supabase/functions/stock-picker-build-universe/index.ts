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
  isin: string | null;
  dhan_security_id: string | null;
  sector_canonical: string | null;
  alternate_listings: unknown;
}

async function loadSeedRows(
  supabase: SupabaseClient,
  seedVersion: string
): Promise<{ rows: RawSeedRow[]; rawBytes: Uint8Array }> {
  const { data, error } = await supabase
    .from('stock_master')
    .select('symbol,exchange,segment,isin,dhan_security_id,sector_canonical,alternate_listings')
    .eq('seed_version', seedVersion);

  if (error) {
    throw new Error(`build-universe: failed to load seed '${seedVersion}': ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(`build-universe: seed '${seedVersion}' returned zero rows`);
  }

  const stable = [...data].sort((a, b) => {
    const aKey = `${a.exchange}|${a.symbol}|${a.isin ?? ''}`;
    const bKey = `${b.exchange}|${b.symbol}|${b.isin ?? ''}`;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
  const stableJson = JSON.stringify(stable);
  const rawBytes = new TextEncoder().encode(stableJson);

  return { rows: data as RawSeedRow[], rawBytes };
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

function filterEquitySegments(rows: SuccessorAppliedRow[]): SuccessorAppliedRow[] {
  return rows.filter(r =>
    (r.exchange === 'NSE' || r.exchange === 'BSE') &&
    (r.segment === 'EQ' || r.segment === 'BE')
  );
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
  const BATCH_SIZE = 500;
  for (let i = 0; i < args.members.length; i += BATCH_SIZE) {
    const slice = args.members.slice(i, i + BATCH_SIZE);
    const memberRows = slice.map(m => ({
      universe_snapshot_id: snapshotId,
      symbol: m.symbol,
      exchange: m.exchange,
      segment: m.segment,
      isin: m.isin,
      dhan_security_id: m.dhan_security_id,
      sector_canonical: m.sector_canonical,
      alternate_listings: m.alternate_listings,
      successor_applied: m.successor_applied,
    }));
    const { error: memErr } = await supabase
      .from('stock_picker_universe_snapshot_member')
      .insert(memberRows);
    if (memErr) throw new Error(`build-universe: member insert failed at batch ${i}`);
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
    const deduped = dedupByIsin(filtered);
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