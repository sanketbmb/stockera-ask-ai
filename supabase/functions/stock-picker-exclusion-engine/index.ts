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

    // 2. Load latest liquidity
    const { data: liq, error: liqErr } = await supabase.from('stock_picker_liquidity_20d_latest').select('*');
    if (liqErr) throw new Error(`exclusion: load liquidity failed: ${liqErr.message}`);
    const liqMap = new Map(liq.map(r => [`${r.symbol}|${r.exchange}`, r]));

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
          if (m.segment !== 'EQ' && m.segment !== 'BE') {
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
          if (l.active_days_count < threshold) {
            symbolVerdict = { ...symbolVerdict, verdict: 'exclude', failed_check: checkId, reason: `Active days ${l.active_days_count} < ${threshold}` };
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
      liquidity_records_for_hash: liq.map(r => ({ symbol: r.symbol, exchange: r.exchange, record_date: r.latest_date, close: String(r.close), volume: String(r.volume), turnover_rs: String(r.turnover_rs) })),
      exclusion_checks_for_hash: checkOrder.map(id => ({ check_id: id, threshold_value: config.get(CHECK_CONFIG_MAP[id].thresholdKey!)?.toString() ?? 'NULL', enabled: jsonbBool(config.get(CHECK_CONFIG_MAP[id].enableKey)) }))
    }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
});
