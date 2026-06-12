// =============================================================================
// SP-1 Exclusion Engine — fixed-order eligibility judge
// Location: supabase/functions/stock-picker-exclusion-engine/index.ts
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type {
  Exchange,
  LiquidityHashInput,
  ExclusionCheckId,
  ExclusionCheckConfig,
} from '../_shared/stock-picker/types.ts';
import { CHECK_CONFIG_MAP, CFG } from '../_shared/stock-picker/types.ts';
import { formatFixed2, formatInteger } from '../_shared/stock-picker/replay-hash.ts';

interface ExclusionRequest {
  batch_id: string;
  universe_snapshot_id: string;
}

interface PerSymbolVerdict {
  symbol: string;
  exchange: Exchange;
  verdict: 'include' | 'exclude' | 'insufficient_data';
  failed_check?: ExclusionCheckId;
  reason?: string;
}

async function loadConfig(supabase: SupabaseClient): Promise<Map<string, unknown>> {
  const { data, error } = await supabase.from('stock_picker_runtime_config').select('config_key,config_value');
  if (error) throw new Error(`exclusion: load config failed: ${error.message}`);
  const m = new Map<string, unknown>();
  for (const row of (data ?? []) as any[]) { m.set(row.config_key, row.config_value); }
  return m;
}

function jsonbBool(val: unknown): boolean { return val === true || val === 'true'; }
function jsonbNum(val: unknown): number { return typeof val === 'number' ? val : Number(val); }

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    const { batch_id, universe_snapshot_id } = await req.json() as ExclusionRequest;
    const config = await loadConfig(supabase);

    // 1. Load universe members
    const { data: members, error: memErr } = await supabase
      .from('stock_picker_universe_snapshot_member')
      .select('symbol,exchange,segment')
      .eq('universe_snapshot_id', universe_snapshot_id);
    if (memErr) throw new Error(`exclusion: load members failed: ${memErr.message}`);

    // Build set of allowed universe keys
    const universeKeys = new Set<string>(members.map(m => `${m.symbol}|${m.exchange}`));

    // 2. Load raw daily liquidity rows directly from base table (NOT the *_latest view).
    //    We compute 20d metrics ourselves; nullable view fields must not drive eligibility.
    //    phase2s1: paginated fetch — PostgREST default 1000-row cap silently truncates
    //    .in(symbol, universeSymbols) results when total liquidity rows exceed 1000.
    const universeSymbols = Array.from(new Set(members.map(m => m.symbol)));
    // Phase 2S.3-FIX-C: chunk the symbol IN-list to avoid URL-length limits, and
    // paginate each chunk's read with the proven Phase 2S.1 range() loop pattern.
    // Deterministic ordering by (symbol, exchange, record_date, data_snapshot_at, id)
    // preserves replay-hash stability. Page size matches 2S.1 (1000). Per-chunk
    // safety cap raised to 500 pages (500K rows / chunk) so wider universes
    // cannot trip the previous 50-page abort.
    const SYMBOL_CHUNK = 200;
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 500;
    const liq: any[] = [];
    let totalPages = 0;
    for (let s = 0; s < universeSymbols.length; s += SYMBOL_CHUNK) {
      const symbolsChunk = universeSymbols.slice(s, s + SYMBOL_CHUNK);
      for (let page = 0; page < MAX_PAGES; page++) {
        const start = page * PAGE_SIZE;
        const end = start + PAGE_SIZE - 1;
        const { data: chunk, error: liqErr } = await supabase
          .from('stock_picker_liquidity_20d')
          .select('id, symbol, exchange, record_date, close, volume, turnover_rs, fetch_status, data_snapshot_at')
          .eq('fetch_status', 'ok')
          .in('symbol', symbolsChunk)
          .order('symbol', { ascending: true })
          .order('exchange', { ascending: true })
          .order('record_date', { ascending: false })
          .order('data_snapshot_at', { ascending: false })
          .order('id', { ascending: true })
          .range(start, end);
        if (liqErr) throw new Error(`exclusion: load liquidity failed: ${liqErr.message}`);
        const rows = chunk ?? [];
        liq.push(...rows);
        totalPages += 1;
        if (rows.length < PAGE_SIZE) break;
        if (page === MAX_PAGES - 1 && rows.length === PAGE_SIZE) {
          throw new Error('phase2s3c: liq20d_page_cap_exceeded');
        }
      }
    }
    console.log(`phase2s3c: liq20d_paged_fetch symbol_chunks=${Math.ceil(universeSymbols.length / SYMBOL_CHUNK)} pages=${totalPages} rows=${liq.length}`);


    // Filter to current universe + ok + finite numeric guards
    const filteredLiq = (liq ?? []).filter(r => {
      if (r.symbol == null || r.exchange == null) return false;
      if (!universeKeys.has(`${r.symbol}|${r.exchange}`)) return false;
      if (r.fetch_status !== 'ok') return false;
      if (r.record_date == null) return false;
      const c = Number(r.close), v = Number(r.volume), t = Number(r.turnover_rs);
      if (!Number.isFinite(c) || c <= 0) return false;
      if (!Number.isFinite(v) || v < 0) return false;
      if (!Number.isFinite(t) || t < 0) return false;
      return true;
    });

    // Group by symbol|exchange
    const grouped = new Map<string, any[]>();
    for (const r of filteredLiq) {
      const k = `${r.symbol}|${r.exchange}`;
      const arr = grouped.get(k);
      if (arr) arr.push(r); else grouped.set(k, [r]);
    }
    const cmpDesc = (a: any, b: any) => {
      if (a.record_date !== b.record_date) return a.record_date < b.record_date ? 1 : -1;
      const aSnap = a.data_snapshot_at ?? '';
      const bSnap = b.data_snapshot_at ?? '';
      if (aSnap !== bSnap) return aSnap < bSnap ? 1 : -1;
      const aId = a.id ?? '';
      const bId = b.id ?? '';
      if (aId !== bId) return aId < bId ? 1 : -1;
      return 0;
    };

    // Per-symbol computed 20d metrics + window rows used for hash payload
    const liqMap = new Map<string, { adv_20d: number; adt_20d_rs: number; latest: any }>();
    const hashRows: any[] = [];
    for (const [k, rows] of grouped) {
      rows.sort(cmpDesc);
      const window20 = rows.slice(0, 20);
      if (window20.length < 1) continue;
      const adv_20d = window20.reduce((s, x) => s + Number(x.volume), 0) / window20.length;
      const adt_20d_rs = window20.reduce((s, x) => s + Number(x.turnover_rs), 0) / window20.length;
      liqMap.set(k, { adv_20d, adt_20d_rs, latest: window20[0] });
      for (const r of window20) hashRows.push(r);
    }

    // 3. Load flags from master
    const { data: flags, error: flagErr } = await supabase.from('stock_master').select('symbol,exchange,is_asm,is_gsm,is_t2t,is_suspended,pledged_pct');
    if (flagErr) throw new Error(`exclusion: load flags failed: ${flagErr.message}`);
    const flagMap = new Map(flags.map(r => [`${r.symbol}|${r.exchange}`, r]));

    const verdicts: PerSymbolVerdict[] = [];
    const checkOrder: ExclusionCheckId[] = [
      'EX-ASM-1', 'EX-GSM-1', 'EX-T2T-1', 'EX-PLEDGE-1', 
      'EX-LIQ-1', 'EX-LIQ-2', 'EX-SUSPEND-1', 'EX-SEGMENT-1'
    ];

    for (const m of members) {
      const key = `${m.symbol}|${m.exchange}`;
      const f = flagMap.get(key);
      const l = liqMap.get(key);
      let symbolVerdict: PerSymbolVerdict = { symbol: m.symbol, exchange: m.exchange as Exchange, verdict: 'include' };

      for (const checkId of checkOrder) {
        const cfg = CHECK_CONFIG_MAP[checkId];
        const enabled = jsonbBool(config.get(cfg.enableKey));
        if (!enabled) continue;

        if (checkId === 'EX-SEGMENT-1') {
          // Phase 2S.3-FIX: accept canonical NSE_EQ/BSE_EQ labels alongside legacy EQ/BE.
          const seg = typeof m.segment === 'string' ? m.segment.toUpperCase() : '';
          if (seg !== 'EQ' && seg !== 'BE' && seg !== 'NSE_EQ' && seg !== 'BSE_EQ') {
            symbolVerdict = { ...symbolVerdict, verdict: 'exclude', failed_check: checkId, reason: `Invalid segment: ${m.segment}` };
            break;
          }
        } else if (checkId === 'EX-SUSPEND-1') {
          if (f?.is_suspended) {
            symbolVerdict = { ...symbolVerdict, verdict: 'exclude', failed_check: checkId, reason: 'Suspended' };
            break;
          }
        } else if (checkId === 'EX-ASM-1' && f?.is_asm) {
          symbolVerdict = { ...symbolVerdict, verdict: 'exclude', failed_check: checkId, reason: 'ASM' }; break;
        } else if (checkId === 'EX-GSM-1' && f?.is_gsm) {
          symbolVerdict = { ...symbolVerdict, verdict: 'exclude', failed_check: checkId, reason: 'GSM' }; break;
        } else if (checkId === 'EX-T2T-1' && f?.is_t2t) {
          symbolVerdict = { ...symbolVerdict, verdict: 'exclude', failed_check: checkId, reason: 'T2T' }; break;
        } else if (checkId === 'EX-PLEDGE-1') {
          const threshold = jsonbNum(config.get(cfg.thresholdKey!));
          if (f && f.pledged_pct > threshold) {
            symbolVerdict = { ...symbolVerdict, verdict: 'exclude', failed_check: checkId, reason: `Pledge ${f.pledged_pct}% > ${threshold}%` };
            break;
          }
        } else if (checkId === 'EX-LIQ-1') {
          const threshold = jsonbNum(config.get(cfg.thresholdKey!));
          if (!l) { symbolVerdict = { ...symbolVerdict, verdict: 'insufficient_data' }; break; }
          if (l.adv_20d < threshold) {
            symbolVerdict = { ...symbolVerdict, verdict: 'exclude', failed_check: checkId, reason: `ADV ${l.adv_20d} < ${threshold}` };
            break;
          }
        } else if (checkId === 'EX-LIQ-2') {
          const threshold = jsonbNum(config.get(cfg.thresholdKey!));
          if (!l) { symbolVerdict = { ...symbolVerdict, verdict: 'insufficient_data' }; break; }
          if (l.adt_20d_rs < threshold) {
            symbolVerdict = { ...symbolVerdict, verdict: 'exclude', failed_check: checkId, reason: `ADT ${l.adt_20d_rs} < ${threshold}` };
            break;
          }
        }
      }
      verdicts.push(symbolVerdict);
    }

    const survivors = verdicts.filter(v => v.verdict === 'include').map(v => v.symbol);
    const rejected = verdicts.filter(v => v.verdict === 'exclude').map(v => v.symbol);
    const insufficient = verdicts.filter(v => v.verdict === 'insufficient_data').map(v => v.symbol);

    return new Response(JSON.stringify({
      ok: true,
      batch_id,
      universe_snapshot_id,
      survivors,
      rejected_symbols: rejected,
      insufficient_data_symbols: insufficient,
      per_symbol_verdicts: verdicts,
      liquidity_records_for_hash: hashRows
        .slice()
        .sort((a, b) => {
          if (a.symbol !== b.symbol) return a.symbol < b.symbol ? -1 : 1;
          if (a.record_date !== b.record_date) return a.record_date < b.record_date ? -1 : 1;
          return 0;
        })
        .map(r => ({
          symbol: r.symbol,
          exchange: r.exchange,
          record_date: r.record_date,
          close: formatFixed2(Number(r.close)),
          turnover_rs: formatFixed2(Number(r.turnover_rs)),
          volume: formatInteger(Number(r.volume)),
        })),
      exclusion_checks_for_hash: checkOrder.map(id => ({ check_id: id, threshold_value: config.get(CHECK_CONFIG_MAP[id].thresholdKey!)?.toString() ?? 'NULL', enabled: jsonbBool(config.get(CHECK_CONFIG_MAP[id].enableKey)) }))
    }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
});
