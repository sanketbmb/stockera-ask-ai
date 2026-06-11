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

// Phase 2O — tuning knobs (config-driven, fresh per invocation)
type ZoneScoreKnobs = {
  vol_clamp_min: number; vol_clamp_max: number; vol_default: number;
  buy_upper_factor: number; buy_lower_factor: number; buy_lower_floor_factor: number;
  target_vol_mult: number; target_high_factor: number;
  stop_vol_mult: number; stop_low_factor: number;
  w_vol: number; w_trend: number; w_mr: number;
};
const KNOB_DEFAULTS: ZoneScoreKnobs = {
  vol_clamp_min: 0.005, vol_clamp_max: 0.05, vol_default: 0.02,
  buy_upper_factor: 0.25, buy_lower_factor: 1.25, buy_lower_floor_factor: 0.98,
  target_vol_mult: 3.0, target_high_factor: 1.02,
  stop_vol_mult: 3.0, stop_low_factor: 0.95,
  w_vol: 0.4, w_trend: 0.4, w_mr: 0.2,
};
function loadZoneScoreKnobs(cfg: Map<string, unknown>): ZoneScoreKnobs {
  const keyMap: Array<[keyof ZoneScoreKnobs, string]> = [
    ['vol_clamp_min', 'zone_vol_clamp_min'],
    ['vol_clamp_max', 'zone_vol_clamp_max'],
    ['vol_default', 'zone_vol_default'],
    ['buy_upper_factor', 'zone_buy_upper_factor'],
    ['buy_lower_factor', 'zone_buy_lower_factor'],
    ['buy_lower_floor_factor', 'zone_buy_lower_floor_factor'],
    ['target_vol_mult', 'zone_target_vol_mult'],
    ['target_high_factor', 'zone_target_high_factor'],
    ['stop_vol_mult', 'zone_stop_vol_mult'],
    ['stop_low_factor', 'zone_stop_low_factor'],
    ['w_vol', 'score_weight_vol'],
    ['w_trend', 'score_weight_trend'],
    ['w_mr', 'score_weight_mean_rev'],
  ];
  const out: ZoneScoreKnobs = { ...KNOB_DEFAULTS };
  for (const [field, key] of keyMap) {
    if (!cfg.has(key)) { console.warn(`phase2o: knob_missing ${key}`); continue; }
    try { (out as Record<string, number>)[field] = jsonbNum(cfg.get(key), key); }
    catch { console.warn(`phase2o: knob_missing ${key}`); }
  }
  return out;
}

// Phase 2D zone/score math (replay, in-process — no live audit writes)
function computeWindowMetric(window: Close[], k: ZoneScoreKnobs): WindowMetric {
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
  const vc = clamp(vol20 || k.vol_default, k.vol_clamp_min, k.vol_clamp_max);
  const buy_zone_upper = cmp * (1 - vc * k.buy_upper_factor);
  const buy_zone_lower = Math.max(cmp * (1 - vc * k.buy_lower_factor), low20 * k.buy_lower_floor_factor);
  const tgtCand = Math.max(cmp * (1 + vc * k.target_vol_mult), high20 * k.target_high_factor);
  const target = tgtCand > buy_zone_upper ? tgtCand : null;
  const slCand = Math.min(cmp * (1 - vc * k.stop_vol_mult), low20 * k.stop_low_factor);
  const stop_loss = slCand < buy_zone_lower ? slCand : null;

  // composite_score_preview = w_vol*vol + w_trend*trend + w_mr*mean-reversion proximity (0..100)
  const vol_score = clamp(100 - (vc - k.vol_clamp_min) * (100 / (k.vol_clamp_max - k.vol_clamp_min)), 0, 100);
  const trend_score = clamp(50 + (pct20 / 20) * 50, 0, 100);
  const mr_raw = sma20 === 0 ? 0 : (sma20 - cmp) / (sma20 * vc);
  const mr_score = clamp(50 + mr_raw * 25, 0, 100);
  const composite_score_preview = Math.round((k.w_vol * vol_score + k.w_trend * trend_score + k.w_mr * mr_score) * 10) / 10;

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
    const holdDays = cfg.has('backtest_holding_window')
      ? Math.max(1, Math.floor(jsonbNum(cfg.get('backtest_holding_window'), 'backtest_holding_window')))
      : (cfg.has('backtest_holding_period_days')
          ? Math.max(1, Math.floor(jsonbNum(cfg.get('backtest_holding_period_days'), 'backtest_holding_period_days')))
          : 5);
    if (!cfg.has('backtest_holding_window')) console.warn('phase2o: knob_missing backtest_holding_window');
    const minSample = cfg.has('backtest_min_sample_size')
      ? Math.max(5, Math.floor(jsonbNum(cfg.get('backtest_min_sample_size'), 'backtest_min_sample_size')))
      : 20;
    const globalKnobs = loadZoneScoreKnobs(cfg);

    // Phase 2Q — per-profile override knobs (if present in runtime_config).
    // Each profile gets its own knob set + holdDays for the backtest sim.
    const profilesAll = ['conservative', 'moderate', 'aggressive', 'ultra'] as const;
    const profileKnobs = new Map<string, ZoneScoreKnobs>();
    const profileHold = new Map<string, number>();
    const overrideKeyMap: Array<[keyof ZoneScoreKnobs, string]> = [
      ['vol_clamp_min', 'zone_vol_clamp_min'],
      ['vol_clamp_max', 'zone_vol_clamp_max'],
      ['vol_default', 'zone_vol_default'],
      ['buy_upper_factor', 'zone_buy_upper_factor'],
      ['buy_lower_factor', 'zone_buy_lower_factor'],
      ['buy_lower_floor_factor', 'zone_buy_lower_floor_factor'],
      ['target_vol_mult', 'zone_target_vol_mult'],
      ['target_high_factor', 'zone_target_high_factor'],
      ['stop_vol_mult', 'zone_stop_vol_mult'],
      ['stop_low_factor', 'zone_stop_low_factor'],
      ['w_vol', 'score_weight_vol'],
      ['w_trend', 'score_weight_trend'],
      ['w_mr', 'score_weight_mean_rev'],
    ];
    for (const p of profilesAll) {
      const k: ZoneScoreKnobs = { ...globalKnobs };
      let h = holdDays;
      const overrideRaw = cfg.get(`profile_knobs_${p}`);
      if (overrideRaw && typeof overrideRaw === 'object' && !Array.isArray(overrideRaw)) {
        const ov = overrideRaw as Record<string, unknown>;
        let appliedCount = 0;
        for (const [field, key] of overrideKeyMap) {
          const raw = ov[key];
          const n = typeof raw === 'number' ? raw : (typeof raw === 'string' ? Number(raw) : NaN);
          if (Number.isFinite(n)) { (k as Record<string, number>)[field] = n; appliedCount++; }
        }
        const hOv = ov['backtest_holding_window'];
        const hn = typeof hOv === 'number' ? hOv : (typeof hOv === 'string' ? Number(hOv) : NaN);
        if (Number.isFinite(hn)) { h = Math.max(1, Math.floor(hn)); appliedCount++; }
        console.log(`phase2q: profile_override_applied ${p} fields=${appliedCount} holdDays=${h}`);
      } else {
        console.log(`phase2q: profile_override_absent ${p} (using global knobs, holdDays=${h})`);
      }
      profileKnobs.set(p, k);
      profileHold.set(p, h);
    }

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

    type Trade = {
      end_date: string; cmp: number; ret_pct: number; outcome: 'win' | 'loss' | 'neither';
      composite_score_preview: number; vol20: number; profile: string;
      max_dd: number;
    };

    for (const m of surviving) {
      try {
        const { data: closesRaw, error: cErr } = await supabase
          .from('stock_picker_ohlcv_history')
          .select('record_date, close')
          .eq('symbol', m.symbol)
          .eq('exchange', m.exchange)
          .not('close', 'is', null)
          .order('record_date', { ascending: true });
        if (cErr) throw new Error(cErr.message);

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
        if (closes.length < 10) continue;

        const window_start = closes[0].date;
        const window_end = closes[closes.length - 1].date;

        // Phase 2Q — simulate per profile using that profile's knob set + holdDays.
        const insertRows: Array<Record<string, unknown>> = [];
        for (const p of profilesAll) {
          const pk = profileKnobs.get(p)!;
          const ph = profileHold.get(p)!;
          const effMin = Math.min(minSample, Math.max(5, closes.length - ph - 1));
          if (closes.length < effMin + ph + 1) continue;

          const metrics: WindowMetric[] = [];
          const allVols: number[] = [];
          for (let i = effMin - 1; i < closes.length - ph; i++) {
            const w = closes.slice(i - effMin + 1, i + 1);
            const wm = computeWindowMetric(w, pk);
            metrics.push(wm);
            allVols.push(wm.vol20);
          }
          if (metrics.length === 0) continue;

          const volsSorted = [...allVols].sort((a, b) => a - b);
          const p_mod = percentile(volsSorted, 0.25);
          const p_agg = percentile(volsSorted, 0.50);
          const p_ult = percentile(volsSorted, 0.75);

          const ts: Trade[] = [];
          for (let k = 0; k < metrics.length; k++) {
            const wm = metrics[k];
            const idxEnd = effMin - 1 + k;
            const tier = tierForVol(wm.vol20, p_mod, p_agg, p_ult);
            if (tier !== p) continue;
            let hitTarget = false, hitStop = false;
            let exitClose = closes[idxEnd].close;
            let peak = wm.cmp;
            let trade_max_dd = 0;
            for (let j = 1; j <= ph; j++) {
              const c = closes[idxEnd + j].close;
              exitClose = c;
              if (c > peak) peak = c;
              const trough_decline = peak > 0 ? (c - peak) / peak : 0;
              if (trough_decline < trade_max_dd) trade_max_dd = trough_decline;
              if (wm.target !== null && c >= wm.target) { hitTarget = true; break; }
              if (wm.stop_loss !== null && c <= wm.stop_loss) { hitStop = true; break; }
            }
            const outcome: 'win' | 'loss' | 'neither' =
              hitTarget ? 'win' : hitStop ? 'loss' : 'neither';
            const ret_pct = wm.cmp === 0 ? 0 : ((exitClose - wm.cmp) / wm.cmp) * 100;
            ts.push({
              end_date: wm.end_date, cmp: wm.cmp, ret_pct, outcome,
              composite_score_preview: wm.composite_score_preview,
              vol20: wm.vol20, profile: p, max_dd: trade_max_dd,
            });
          }
          if (ts.length === 0) continue;

          const wins = ts.filter((t) => t.outcome === 'win').length;
          const losses = ts.filter((t) => t.outcome === 'loss').length;
          const decided = wins + losses;
          const hit_rate = decided === 0 ? null : wins / decided;
          const rets = ts.map((t) => t.ret_pct);
          const worst_dd_frac = ts.reduce((acc, t) => (t.max_dd < acc ? t.max_dd : acc), 0);
          const max_drawdown_pct = decided === 0 ? null : worst_dd_frac * 100;
          const avg_return_pct = decided === 0 ? null : mean(rets);
          const median_return_pct = decided === 0 ? null : median(rets);
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
            max_drawdown_pct,
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
