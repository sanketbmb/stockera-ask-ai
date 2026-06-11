// stock-picker-backtest-sweep
// Phase 2P — Sweeps knob combinations over historical OHLCV. Writes ONLY to
// stock_picker_backtest_sweep + staging_winner_* runtime_config rows.
// Never touches live math knobs, audit, batch rejection, or backtest_run.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Close = { date: string; close: number };

type Knobs = {
  zone_vol_clamp_min: number; zone_vol_clamp_max: number; zone_vol_default: number;
  zone_buy_upper_factor: number; zone_buy_lower_factor: number; zone_buy_lower_floor_factor: number;
  zone_target_vol_mult: number; zone_target_high_factor: number;
  zone_stop_vol_mult: number; zone_stop_low_factor: number;
  score_weight_vol: number; score_weight_trend: number; score_weight_mean_rev: number;
  backtest_holding_window: number;
};

const KNOB_DEFAULTS: Knobs = {
  zone_vol_clamp_min: 0.005, zone_vol_clamp_max: 0.05, zone_vol_default: 0.02,
  zone_buy_upper_factor: 0.25, zone_buy_lower_factor: 1.25, zone_buy_lower_floor_factor: 0.98,
  zone_target_vol_mult: 3.0, zone_target_high_factor: 1.02,
  zone_stop_vol_mult: 3.0, zone_stop_low_factor: 0.95,
  score_weight_vol: 0.4, score_weight_trend: 0.4, score_weight_mean_rev: 0.2,
  backtest_holding_window: 5,
};

function asNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
}
function asBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  if (typeof v === 'number') return v !== 0;
  return false;
}
function asNumArray(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(asNum).filter((x): x is number => x !== null);
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(asNum).filter((x): x is number => x !== null) : []; }
    catch { return []; }
  }
  return [];
}

function mean(xs: number[]): number { return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length; }
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp(Math.floor(p * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

type WindowMetric = {
  end_date: string; cmp: number; vol20: number;
  buy_zone_upper: number; buy_zone_lower: number;
  target: number | null; stop_loss: number | null;
};

function computeWindowMetric(window: Close[], k: Knobs): WindowMetric {
  const closes = window.map((c) => c.close);
  const cmp = closes[closes.length - 1];
  const high20 = Math.max(...closes);
  const low20 = Math.min(...closes);
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) if (closes[i - 1] > 0) rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  const vol20 = stddev(rets);
  const vc = clamp(vol20 || k.zone_vol_default, k.zone_vol_clamp_min, k.zone_vol_clamp_max);
  const buy_zone_upper = cmp * (1 - vc * k.zone_buy_upper_factor);
  const buy_zone_lower = Math.max(cmp * (1 - vc * k.zone_buy_lower_factor), low20 * k.zone_buy_lower_floor_factor);
  const tgtCand = Math.max(cmp * (1 + vc * k.zone_target_vol_mult), high20 * k.zone_target_high_factor);
  const target = tgtCand > buy_zone_upper ? tgtCand : null;
  const slCand = Math.min(cmp * (1 - vc * k.zone_stop_vol_mult), low20 * k.zone_stop_low_factor);
  const stop_loss = slCand < buy_zone_lower ? slCand : null;
  return { end_date: window[window.length - 1].date, cmp, vol20, buy_zone_upper, buy_zone_lower, target, stop_loss };
}

function tierForVol(v: number, p_mod: number, p_agg: number, p_ult: number): string {
  if (v <= p_mod) return 'conservative';
  if (v <= p_agg) return 'moderate';
  if (v <= p_ult) return 'aggressive';
  return 'ultra';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const invoked_by = typeof body.invoked_by === 'string' ? body.invoked_by : 'manual';
    // Phase 2Q — optional filter + widened grid
    const filterProfile: string | null = typeof body.filter_profile === 'string'
      && ['conservative', 'moderate', 'aggressive', 'ultra'].includes(body.filter_profile)
      ? body.filter_profile : null;
    const widerGrid: boolean = body.wider_grid === true;

    // ---- Load runtime config ----
    const { data: cfgRows, error: cfgErr } = await supabase
      .from('stock_picker_runtime_config').select('config_key, config_value');
    if (cfgErr) throw new Error(`config read failed: ${cfgErr.message}`);
    const cfg = new Map<string, unknown>();
    for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value as unknown);

    if (!asBool(cfg.get('sweep_enabled'))) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'sweep_enabled=false' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const maxVariants = Math.max(1, Math.floor(
      widerGrid
        ? (asNum(cfg.get('sweep_max_variants_wide')) ?? 60)
        : (asNum(cfg.get('sweep_max_variants')) ?? 24)
    ));
    const minTrades = Math.max(1, Math.floor(asNum(cfg.get('sweep_min_trades_per_profile')) ?? 30));
    const holdWindows = asNumArray(cfg.get(widerGrid ? 'sweep_holding_windows_wide' : 'sweep_holding_windows'));
    const tgtMults = asNumArray(cfg.get(widerGrid ? 'sweep_target_vol_mults_wide' : 'sweep_target_vol_mults'));
    const stopMults = asNumArray(cfg.get(widerGrid ? 'sweep_stop_vol_mults_wide' : 'sweep_stop_vol_mults'));


    // Baseline knobs from live config
    const baseline: Knobs = { ...KNOB_DEFAULTS };
    for (const key of Object.keys(KNOB_DEFAULTS) as Array<keyof Knobs>) {
      const v = asNum(cfg.get(key));
      if (v !== null) (baseline as Record<string, number>)[key] = v;
    }

    // ---- Resolve universe + cleanliness (mirrors Phase 2I/2J/2M) ----
    const overrideSymbolsRaw = cfg.get('universe_override_symbols');
    const overrideSymbols: string[] = Array.isArray(overrideSymbolsRaw)
      ? (overrideSymbolsRaw as unknown[]).filter((s): s is string => typeof s === 'string' && s.length > 0)
      : [];
    if (overrideSymbols.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'no universe_override_symbols configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: meta, error: metaErr } = await supabase
      .from('stock_master')
      .select('symbol,exchange,type,segment,is_suspended,dhan_security_id,company_name')
      .in('symbol', overrideSymbols);
    if (metaErr) throw new Error(`stock_master read failed: ${metaErr.message}`);
    const EQUITY_TYPES = new Set(['EQUITY', 'EQ', 'STOCK']);
    const EQUITY_SEGMENTS = new Set(['EQ', 'NSE_EQ', 'BSE_EQ']);
    const bondNameRe = /(^|\s)SDL\s|\d+(\.\d+)?\s*%\s*\d{4}/i;
    const bondTickerRe1 = /^\d{3,4}[A-Z]{1,3}\d{2,3}[A-Z]?$/i;
    const bondTickerRe2 = /^[A-Z]{2,4}\d{2,4}[A-Z]{1,3}\d{1,3}$/i;
    const etfSymbolTokenRe = /(?:^|[^A-Z])(ETF|BEES|NIFTYBEES|BANKBEES|GOLDBEES|LIQUIDBEES|JUNIORBEES|N100|NV20)$/i;
    const etfSymbolSuffixRe = /ETF$/i;
    const etfNameRe = /ETF|EXCHANGE\s+TRADED|INDEX\s+FUND/i;

    type Agg = {
      sym: string; exch: string;
      any_equity_type: boolean; any_equity_segment: boolean;
      any_suspended: boolean; any_dhan: boolean; company_name: string | null;
    };
    const agg = new Map<string, Agg>();
    for (const r of (meta ?? []) as Array<Record<string, unknown>>) {
      const sym = String(r.symbol ?? ''); const exch = String(r.exchange ?? '');
      const key = `${sym}|${exch}`;
      const cur = agg.get(key) ?? {
        sym, exch, any_equity_type: false, any_equity_segment: false,
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
      if (bondTickerRe1.test(a.sym) || bondTickerRe2.test(a.sym)) continue;
      if (a.company_name && (etfNameRe.test(a.company_name) || etfSymbolTokenRe.test(a.sym) || etfSymbolSuffixRe.test(a.sym))) continue;
      if (a.company_name && bondNameRe.test(a.company_name)) continue;
      surviving.push({ symbol: a.sym, exchange: a.exch });
    }

    // ---- Pre-load OHLCV for all surviving symbols ONCE ----
    const closesBySym = new Map<string, Close[]>();
    for (const m of surviving) {
      const { data: closesRaw, error: cErr } = await supabase
        .from('stock_picker_ohlcv_history')
        .select('record_date, close')
        .eq('symbol', m.symbol).eq('exchange', m.exchange)
        .not('close', 'is', null)
        .order('record_date', { ascending: true });
      if (cErr) continue;
      const byDate = new Map<string, number>();
      for (const r of closesRaw ?? []) {
        const d = String((r as Record<string, unknown>).record_date);
        const c = Number((r as Record<string, unknown>).close);
        if (!Number.isFinite(c) || c <= 0) continue;
        byDate.set(d, c);
      }
      const closes: Close[] = [...byDate.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([date, close]) => ({ date, close }));
      closesBySym.set(`${m.symbol}|${m.exchange}`, closes);
    }

    // ---- Build search grid (deterministic lexical order) ----
    type Variant = { variant_id: number; knobs: Knobs };
    const variants: Variant[] = [];
    const sortedHold = [...holdWindows].sort((a, b) => a - b);
    const sortedTgt = [...tgtMults].sort((a, b) => a - b);
    const sortedStop = [...stopMults].sort((a, b) => a - b);
    let vid = 0;
    outer:
    for (const hw of sortedHold) {
      for (const tm of sortedTgt) {
        for (const sm of sortedStop) {
          if (vid >= maxVariants) break outer;
          variants.push({
            variant_id: vid,
            knobs: { ...baseline, backtest_holding_window: hw, zone_target_vol_mult: tm, zone_stop_vol_mult: sm },
          });
          vid++;
        }
      }
    }

    const sweep_id = crypto.randomUUID();
    const minSample = Math.max(5, Math.floor(asNum(cfg.get('backtest_min_sample_size')) ?? 20));
    const errors: Array<{ variant_id: number; symbol?: string; error: string }> = [];
    let rows_inserted = 0;

    type ProfAgg = {
      symbols: Set<string>; rets: number[];
      wins: number; losses: number; worst_dd_frac: number;
    };
    const profiles = ['conservative', 'moderate', 'aggressive', 'ultra'] as const;

    for (const v of variants) {
      const k = v.knobs;
      const holdDays = Math.max(1, Math.floor(k.backtest_holding_window));
      const perProfile = new Map<string, ProfAgg>();
      for (const p of profiles) perProfile.set(p, { symbols: new Set(), rets: [], wins: 0, losses: 0, worst_dd_frac: 0 });

      for (const m of surviving) {
        const closes = closesBySym.get(`${m.symbol}|${m.exchange}`) ?? [];
        const effMin = Math.min(minSample, Math.max(5, closes.length - holdDays - 1));
        if (closes.length < effMin + holdDays + 1) continue;

        // First pass — vols for tier percentiles
        const metrics: WindowMetric[] = [];
        const allVols: number[] = [];
        for (let i = effMin - 1; i < closes.length - holdDays; i++) {
          const w = closes.slice(i - effMin + 1, i + 1);
          const wm = computeWindowMetric(w, k);
          metrics.push(wm); allVols.push(wm.vol20);
        }
        if (metrics.length === 0) continue;
        const volsSorted = [...allVols].sort((a, b) => a - b);
        const p_mod = percentile(volsSorted, 0.25);
        const p_agg = percentile(volsSorted, 0.50);
        const p_ult = percentile(volsSorted, 0.75);

        for (let kk = 0; kk < metrics.length; kk++) {
          const wm = metrics[kk];
          const idxEnd = effMin - 1 + kk;
          let hitTarget = false, hitStop = false;
          let exitClose = closes[idxEnd].close;
          let peak = wm.cmp;
          let trade_max_dd = 0;
          for (let j = 1; j <= holdDays; j++) {
            const c = closes[idxEnd + j].close;
            exitClose = c;
            if (c > peak) peak = c;
            const trough = peak > 0 ? (c - peak) / peak : 0;
            if (trough < trade_max_dd) trade_max_dd = trough;
            if (wm.target !== null && c >= wm.target) { hitTarget = true; break; }
            if (wm.stop_loss !== null && c <= wm.stop_loss) { hitStop = true; break; }
          }
          const ret_pct = wm.cmp === 0 ? 0 : ((exitClose - wm.cmp) / wm.cmp) * 100;
          const profile = tierForVol(wm.vol20, p_mod, p_agg, p_ult);
          const pa = perProfile.get(profile)!;
          pa.symbols.add(m.symbol);
          pa.rets.push(ret_pct);
          if (hitTarget) pa.wins++;
          else if (hitStop) pa.losses++;
          if (trade_max_dd < pa.worst_dd_frac) pa.worst_dd_frac = trade_max_dd;
        }
      }

      const insertRows: Array<Record<string, unknown>> = [];
      for (const p of profiles) {
        const a = perProfile.get(p)!;
        const total_trades = a.rets.length;
        const decided = a.wins + a.losses;
        const hit_rate = decided === 0 ? null : a.wins / decided;
        const avg_return_pct = total_trades === 0 ? null : mean(a.rets);
        const median_return_pct = total_trades === 0 ? null : median(a.rets);
        const max_drawdown_pct = total_trades === 0 ? null : a.worst_dd_frac * 100;
        let risk_adjusted_score: number | null = null;
        if (total_trades >= minTrades && avg_return_pct !== null && max_drawdown_pct !== null) {
          const denom = Math.max(1.0, Math.abs(max_drawdown_pct));
          risk_adjusted_score = avg_return_pct / denom;
        }
        insertRows.push({
          sweep_id, variant_id: v.variant_id, knob_set: k, risk_profile: p,
          symbols_evaluated: a.symbols.size, total_trades,
          hit_rate, avg_return_pct, median_return_pct, max_drawdown_pct,
          risk_adjusted_score,
        });
      }
      const { error: insErr } = await supabase.from('stock_picker_backtest_sweep').insert(insertRows);
      if (insErr) errors.push({ variant_id: v.variant_id, error: insErr.message });
      else rows_inserted += insertRows.length;
    }

    // ---- Pick winners per profile + global ----
    const { data: sweepRows, error: sErr } = await supabase
      .from('stock_picker_backtest_sweep')
      .select('variant_id, risk_profile, risk_adjusted_score, knob_set')
      .eq('sweep_id', sweep_id);
    if (sErr) throw new Error(`sweep readback failed: ${sErr.message}`);

    const byVariantKnobs = new Map<number, unknown>();
    const byProfile = new Map<string, Array<{ vid: number; ras: number }>>();
    const variantAvg = new Map<number, { sum: number; n: number }>();
    for (const r of sweepRows ?? []) {
      const vid = r.variant_id as number;
      byVariantKnobs.set(vid, r.knob_set);
      const ras = r.risk_adjusted_score === null || r.risk_adjusted_score === undefined ? null : Number(r.risk_adjusted_score);
      if (ras !== null && Number.isFinite(ras)) {
        const arr = byProfile.get(r.risk_profile as string) ?? [];
        arr.push({ vid, ras });
        byProfile.set(r.risk_profile as string, arr);
        const cur = variantAvg.get(vid) ?? { sum: 0, n: 0 };
        cur.sum += ras; cur.n += 1; variantAvg.set(vid, cur);
      }
    }

    const upserts: Array<Record<string, unknown>> = [];
    for (const p of profiles) {
      const arr = byProfile.get(p) ?? [];
      if (arr.length === 0) continue;
      arr.sort((a, b) => b.ras - a.ras || a.vid - b.vid);
      const winnerKnobs = byVariantKnobs.get(arr[0].vid);
      upserts.push({
        config_key: `staging_winner_${p}`,
        kind: 'identifier',
        config_value: winnerKnobs,
        description: `Phase 2P staging winner for ${p} (sweep ${sweep_id}, variant ${arr[0].vid}, ras ${arr[0].ras.toFixed(4)})`,
      });
    }
    // global = highest mean ras
    let bestGlobal: { vid: number; avg: number } | null = null;
    for (const [vid, s] of variantAvg.entries()) {
      const avg = s.sum / s.n;
      if (bestGlobal === null || avg > bestGlobal.avg || (avg === bestGlobal.avg && vid < bestGlobal.vid)) {
        bestGlobal = { vid, avg };
      }
    }
    if (bestGlobal !== null) {
      upserts.push({
        config_key: 'staging_winner_global',
        kind: 'identifier',
        config_value: byVariantKnobs.get(bestGlobal.vid),
        description: `Phase 2P staging winner global (sweep ${sweep_id}, variant ${bestGlobal.vid}, avg ras ${bestGlobal.avg.toFixed(4)})`,
      });
    }
    if (upserts.length > 0) {
      const { error: uErr } = await supabase
        .from('stock_picker_runtime_config')
        .upsert(upserts, { onConflict: 'config_key' });
      if (uErr) errors.push({ variant_id: -1, error: `staging upsert: ${uErr.message}` });
    }

    return new Response(JSON.stringify({
      ok: true, sweep_id, variants_evaluated: variants.length, rows_inserted, errors, invoked_by,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
