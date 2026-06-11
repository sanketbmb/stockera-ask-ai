// stock-picker-backtest
// Phase 2K — Read-only backtest harness. Replays Phase 2D zone/score math
// over historical closes in stock_picker_liquidity_20d. Writes ONLY to
// stock_picker_backtest_run. Never touches stock_picker_pick_audit or
// stock_picker_batch_rejection. Does NOT flip composite_score persistence.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Close = { date: string; close: number };
type WindowMetric = {
  end_date: string;
  cmp: number;
  sma20: number;
  high20: number;
  low20: number;
  pct20: number;
  vol20: number;
  composite_score_preview: number;
  buy_zone_upper: number;
  buy_zone_lower: number;
  target: number | null;
  stop_loss: number | null;
};

function jsonbBool(v: unknown, key: string): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  if (typeof v === 'number') return v !== 0;
  throw new Error(`config ${key} not a boolean: ${JSON.stringify(v)}`);
}
function jsonbNum(v: unknown, key: string): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`config ${key} not numeric`);
    return n;
  }
  throw new Error(`config ${key} not numeric: ${JSON.stringify(v)}`);
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}
function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

// Spearman rank correlation (returns null if not computable)
function spearman(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;
  const rank = (arr: number[]): number[] => {
    const idx = arr.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
    const r = new Array<number>(arr.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
      const avg = (i + j) / 2 + 1; // average rank, 1-based
      for (let k = i; k <= j; k++) r[idx[k].i] = avg;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) {
    const x = ra[i] - ma;
    const y = rb[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const denom = Math.sqrt(da * db);
  if (denom === 0) return null;
  return num / denom;
}

// Phase 2D zone/score math (replay, in-process — no live audit writes)
function computeWindowMetric(window: Close[]): WindowMetric {
  const closes = window.map((c) => c.close);
  const cmp = closes[closes.length - 1];
  const sma20 = mean(closes);
  const high20 = Math.max(...closes);
  const low20 = Math.min(...closes);
  const first = closes[0];
  const pct20 = first === 0 ? 0 : ((cmp - first) / first) * 100;
  // daily simple returns
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const vol20 = stddev(rets);
  const vc = clamp(vol20 || 0.02, 0.005, 0.05);
  const buy_zone_upper = cmp * (1 - vc * 0.25);
  const buy_zone_lower = Math.max(cmp * (1 - vc * 1.25), low20 * 0.98);
  const tgtCand = Math.max(cmp * (1 + vc * 3), high20 * 1.02);
  const target = tgtCand > buy_zone_upper ? tgtCand : null;
  const slCand = Math.min(cmp * (1 - vc * 3), low20 * 0.95);
  const stop_loss = slCand < buy_zone_lower ? slCand : null;

  // composite_score_preview = 0.4 vol + 0.4 trend + 0.2 mean-reversion proximity (0..100)
  // vol_score: lower vol better (0..100)
  const vol_score = clamp(100 - (vc - 0.005) * (100 / (0.05 - 0.005)), 0, 100);
  // trend_score: pct20 mapped from [-20, +20] to [0, 100]
  const trend_score = clamp(50 + (pct20 / 20) * 50, 0, 100);
  // mean-reversion proximity: distance of cmp below sma, normalized by vc
  const mr_raw = sma20 === 0 ? 0 : (sma20 - cmp) / (sma20 * vc);
  const mr_score = clamp(50 + mr_raw * 25, 0, 100);
  const composite_score_preview = Math.round((0.4 * vol_score + 0.4 * trend_score + 0.2 * mr_score) * 10) / 10;

  return {
    end_date: window[window.length - 1].date,
    cmp, sma20, high20, low20, pct20, vol20,
    composite_score_preview,
    buy_zone_upper, buy_zone_lower, target, stop_loss,
  };
}

// Phase 2B risk-tier assignment per window: bucket vol by tier
// (cohort tiers computed from this symbol's window vols; deterministic).
function tierForVol(vol: number, p_mod: number, p_agg: number, p_ult: number): string {
  if (vol <= p_mod) return 'conservative';
  if (vol <= p_agg) return 'moderate';
  if (vol <= p_ult) return 'aggressive';
  return 'ultra';
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp(Math.floor(p * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const invoked_by = typeof body.invoked_by === 'string' ? body.invoked_by : 'manual';

    // ---- Load runtime config ----
    const { data: cfgRows, error: cfgErr } = await supabase
      .from('stock_picker_runtime_config')
      .select('config_key, config_value');
    if (cfgErr) throw new Error(`config read failed: ${cfgErr.message}`);
    const cfg = new Map<string, unknown>();
    for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value as unknown);

    const enabled = cfg.has('backtest_enabled') ? jsonbBool(cfg.get('backtest_enabled'), 'backtest_enabled') : false;
    if (!enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'backtest_enabled=false' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const holdDays = cfg.has('backtest_holding_period_days')
      ? Math.max(1, Math.floor(jsonbNum(cfg.get('backtest_holding_period_days'), 'backtest_holding_period_days')))
      : 5;
    const minSample = cfg.has('backtest_min_sample_size')
      ? Math.max(5, Math.floor(jsonbNum(cfg.get('backtest_min_sample_size'), 'backtest_min_sample_size')))
      : 20;

    // ---- Resolve universe from runtime_override ----
    const overrideSymbolsRaw = cfg.get('universe_override_symbols');
    const overrideSymbols: string[] = Array.isArray(overrideSymbolsRaw)
      ? (overrideSymbolsRaw as unknown[]).filter((s): s is string => typeof s === 'string' && s.length > 0)
      : [];
    if (overrideSymbols.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'no universe_override_symbols configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- Cleanliness filter (mirrors Phase 2I+2J) ----
    const { data: meta, error: metaErr } = await supabase
      .from('stock_master')
      .select('symbol,exchange,type,segment,is_suspended,dhan_security_id,company_name')
      .in('symbol', overrideSymbols);
    if (metaErr) throw new Error(`stock_master read failed: ${metaErr.message}`);
    const EQUITY_TYPES = new Set(['EQUITY', 'EQ', 'STOCK']);
    const EQUITY_SEGMENTS = new Set(['EQ', 'NSE_EQ', 'BSE_EQ']);
    const bondNameRe = /(^|\s)SDL\s|\d+(\.\d+)?\s*%\s*\d{4}/i;
    const etfSymbolTokenRe = /(?:^|[^A-Z])(ETF|BEES|NIFTYBEES|BANKBEES|GOLDBEES|LIQUIDBEES|JUNIORBEES|N100|NV20)$/i;
    const etfSymbolSuffixRe = /ETF$/i;
    const etfNameRe = /ETF|EXCHANGE\s+TRADED|INDEX\s+FUND/i;
    type Agg = {
      sym: string; exch: string;
      any_equity_type: boolean; any_equity_segment: boolean;
      any_suspended: boolean; any_dhan: boolean;
      company_name: string | null;
    };
    const agg = new Map<string, Agg>();
    for (const r of (meta ?? []) as Array<Record<string, unknown>>) {
      const sym = String(r.symbol ?? ''); const exch = String(r.exchange ?? '');
      const key = `${sym}|${exch}`;
      const cur = agg.get(key) ?? {
        sym, exch,
        any_equity_type: false, any_equity_segment: false,
        any_suspended: false, any_dhan: false, company_name: null,
      };
      if (typeof r.type === 'string' && EQUITY_TYPES.has(r.type.toUpperCase())) cur.any_equity_type = true;
      if (typeof r.segment === 'string' && EQUITY_SEGMENTS.has(r.segment.toUpperCase())) cur.any_equity_segment = true;
      if (r.is_suspended === true) cur.any_suspended = true;
      if (r.dhan_security_id !== null && r.dhan_security_id !== undefined && String(r.dhan_security_id).length > 0) cur.any_dhan = true;
      if (cur.company_name === null && typeof r.company_name === 'string') cur.company_name = r.company_name;
      agg.set(key, cur);
    }
    const surviving: Array<{ symbol: string; exchange: string }> = [];
    for (const a of agg.values()) {
      if (!a.any_equity_type) continue;
      if (!a.any_equity_segment) continue;
      if (a.any_suspended) continue;
      if (!a.any_dhan) continue;
      if (a.company_name && (etfNameRe.test(a.company_name) || etfSymbolTokenRe.test(a.sym) || etfSymbolSuffixRe.test(a.sym))) continue;
      if (a.company_name && bondNameRe.test(a.company_name)) continue;
      surviving.push({ symbol: a.sym, exchange: a.exch });
    }

    const run_id = crypto.randomUUID();
    const errors: Array<{ symbol: string; error: string }> = [];
    let rows_inserted = 0;

    for (const m of surviving) {
      try {
        // Load chronological closes, dedupe per date (keep last close per date)
        const { data: closesRaw, error: cErr } = await supabase
          .from('stock_picker_liquidity_20d')
          .select('record_date, close, data_snapshot_at')
          .eq('symbol', m.symbol)
          .eq('exchange', m.exchange)
          .not('close', 'is', null)
          .order('record_date', { ascending: true })
          .order('data_snapshot_at', { ascending: true });
        if (cErr) throw new Error(cErr.message);

        const byDate = new Map<string, number>();
        for (const r of closesRaw ?? []) {
          const d = String((r as Record<string, unknown>).record_date);
          const c = Number((r as Record<string, unknown>).close);
          if (Number.isFinite(c) && c > 0) byDate.set(d, c);
        }
        const closes: Close[] = [...byDate.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
          .map(([date, close]) => ({ date, close }));

        if (closes.length < minSample + holdDays + 1) continue;

        // ---- Build window metrics + simulate trades ----
        type Trade = {
          end_date: string; cmp: number; ret_pct: number; outcome: 'win' | 'loss' | 'neither';
          composite_score_preview: number; vol20: number; profile: string;
        };
        const trades: Trade[] = [];
        const allVols: number[] = [];

        // First pass — compute window vols to derive this symbol's tier percentiles.
        const metrics: WindowMetric[] = [];
        for (let i = minSample - 1; i < closes.length - holdDays; i++) {
          const w = closes.slice(i - minSample + 1, i + 1);
          const wm = computeWindowMetric(w);
          metrics.push(wm);
          allVols.push(wm.vol20);
        }
        if (metrics.length === 0) continue;

        const volsSorted = [...allVols].sort((a, b) => a - b);
        const p_mod = percentile(volsSorted, 0.25);
        const p_agg = percentile(volsSorted, 0.50);
        const p_ult = percentile(volsSorted, 0.75);

        // Second pass — simulate forward window
        for (let k = 0; k < metrics.length; k++) {
          const wm = metrics[k];
          const idxEnd = minSample - 1 + k;
          // forward look: close indices idxEnd+1 .. idxEnd+holdDays
          let hitTarget = false, hitStop = false;
          let exitClose = closes[idxEnd].close;
          for (let j = 1; j <= holdDays; j++) {
            const c = closes[idxEnd + j].close;
            exitClose = c;
            if (wm.target !== null && c >= wm.target) { hitTarget = true; break; }
            if (wm.stop_loss !== null && c <= wm.stop_loss) { hitStop = true; break; }
          }
          const outcome: 'win' | 'loss' | 'neither' =
            hitTarget ? 'win' : hitStop ? 'loss' : 'neither';
          const ret_pct = wm.cmp === 0 ? 0 : ((exitClose - wm.cmp) / wm.cmp) * 100;
          const profile = tierForVol(wm.vol20, p_mod, p_agg, p_ult);
          trades.push({
            end_date: wm.end_date, cmp: wm.cmp, ret_pct, outcome,
            composite_score_preview: wm.composite_score_preview,
            vol20: wm.vol20, profile,
          });
        }

        // ---- Aggregate per risk_profile ----
        const profiles = ['conservative', 'moderate', 'aggressive', 'ultra'] as const;
        const window_start = closes[0].date;
        const window_end = closes[closes.length - 1].date;

        const insertRows: Array<Record<string, unknown>> = [];
        for (const p of profiles) {
          const ts = trades.filter((t) => t.profile === p);
          if (ts.length === 0) continue;
          const wins = ts.filter((t) => t.outcome === 'win').length;
          const losses = ts.filter((t) => t.outcome === 'loss').length;
          const decided = wins + losses;
          const hit_rate = decided === 0 ? null : wins / decided;
          const rets = ts.map((t) => t.ret_pct);
          const avg_return_pct = mean(rets);
          const median_return_pct = median(rets);
          // max drawdown of cumulative return path (sum of rets in order)
          let cum = 0, peak = 0, mdd = 0;
          for (const r of rets) {
            cum += r;
            if (cum > peak) peak = cum;
            const dd = peak - cum;
            if (dd > mdd) mdd = dd;
          }
          const ic = spearman(ts.map((t) => t.composite_score_preview), rets);
          const csp_avg = mean(ts.map((t) => t.composite_score_preview));
          insertRows.push({
            run_id,
            symbol: m.symbol,
            exchange: m.exchange,
            risk_profile: p,
            window_start,
            window_end,
            n_signals: ts.length,
            n_wins: wins,
            n_losses: losses,
            hit_rate,
            avg_return_pct,
            median_return_pct,
            max_drawdown_pct: -mdd,
            information_coefficient: ic,
            composite_score_preview_avg: csp_avg,
          });
        }

        if (insertRows.length > 0) {
          const { error: insErr } = await supabase
            .from('stock_picker_backtest_run')
            .insert(insertRows);
          if (insErr) throw new Error(`insert failed: ${insErr.message}`);
          rows_inserted += insertRows.length;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ symbol: m.symbol, error: msg });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      run_id,
      invoked_by,
      symbols_processed: surviving.length,
      rows_inserted,
      errors,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('backtest fatal:', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
