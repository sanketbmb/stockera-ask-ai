// compute-trade-plan
// Tier-aware trade levels (Entry, SL, T1, T2, S1/S2, R1/R2) with mandatory
// validation. Stateless. No LLM. Owns the source-of-truth for trade levels
// so callers (orchestrator, future UI) do not derive them ad-hoc.
//
// Rules (per Brain spec, task 2.6.A):
//   - Intraday: 0.25/1.0/1.5/2.5 × ATR around spot; floor pivots for S/R.
//   - Medium-term: ATR + 20-day swing structure; 1.272 fib extension for T2.
//   - Long-term: percentage + 200-DMA; DCF for T1; 52w/200-DMA for S/R.
// Validation always runs. Any rule failure → that level is null and a reason
// is appended to `validation`. Compute errors → null with explicit reason
// (never silently substitute defaults).
import { resolveSectorCanonical } from "../_shared/sector-aliases.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FORMULA_VERSION = "trade-plan-1.1";
const MODULE_TIMEOUT_MS = 20_000;
const LT_T1_FLOOR_PCT = 0.05;   // T1 must be ≥ spot × 1.05
const LT_TARGET_CAP_PCT = 0.60; // T1/T2 capped at spot × 1.60
const LT_LIQUIDITY_MIN_CR = 5;  // avg daily turnover ≥ ₹5cr
const LT_VOL_MAX_PCT = 60;      // annualized vol ≤ 60%

type QueryType = "intraday" | "medium-term" | "long-term";

interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number }

interface Levels {
  entry_zone: number | null;
  stop_loss: number | null;
  target_1: number | null;
  target_2: number | null;
  support_1: number | null;
  support_2: number | null;
  resistance_1: number | null;
  resistance_2: number | null;
}

interface Omission { level: keyof Levels; reason: string }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function r2(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  if (typeof n === "number" && !Number.isFinite(n)) return null;
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}
function finite(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  if (typeof n === "number" && !Number.isFinite(n)) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

// ─── Indicators ───
function atr(highs: number[], lows: number[], closes: number[], period = 14): number {
  const n = closes.length;
  if (n < period + 2) return NaN;
  const tr: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    tr[i] = i === 0
      ? highs[i] - lows[i]
      : Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  let v = 0;
  for (let i = 1; i <= period; i++) v += tr[i];
  v /= period;
  for (let i = period + 1; i < n; i++) v = (v * (period - 1) + tr[i]) / period;
  return v;
}
function sma(values: number[], period: number): number {
  if (values.length < period) return NaN;
  let s = 0;
  for (let i = values.length - period; i < values.length; i++) s += values[i];
  return s / period;
}

// ─── Swing pivots: simple fractal — bar is a swing high if it's the max
// in a (k*2+1) window around it (and likewise for swing lows). ───
function swingPoints(candles: Candle[], k = 2): { highs: number[]; lows: number[] } {
  const highs: number[] = [], lows: number[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low  <= candles[i].low ) isLow  = false;
    }
    if (isHigh) highs.push(candles[i].high);
    if (isLow)  lows.push(candles[i].low);
  }
  return { highs, lows };
}

// ─── Data fetchers ───
async function fetchCandles(symbol: string): Promise<Candle[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/finedge-fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ endpoint: "daily-quotes", symbol }),
  });
  const txt = await res.text();
  let body: Record<string, unknown> = {};
  try { body = txt ? JSON.parse(txt) : {}; } catch { /* */ }
  if (!res.ok || body.success !== true) throw new Error(`finedge ${res.status}: ${String(body.error ?? txt).slice(0, 200)}`);
  const wrap = body.data as Record<string, unknown> | undefined;
  const inner = (wrap?.data ?? wrap) as Record<string, unknown> | undefined;
  const rows = (inner?.price ?? inner?.quotes ?? inner?.data) as unknown;
  if (!Array.isArray(rows)) throw new Error("finedge: no price array");
  const out: Candle[] = rows.map((r) => {
    const x = r as Record<string, unknown>;
    return {
      date: String(x.quote_date ?? x.date ?? ""),
      open: Number(x.open_price ?? x.open ?? 0),
      high: Number(x.high_price ?? x.high ?? 0),
      low:  Number(x.low_price  ?? x.low  ?? 0),
      close: Number(x.close_price ?? x.close ?? 0),
      volume: Number(x.volume ?? 0),
    };
  }).filter((c) => c.date && c.close > 0);
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function callJSON(fn: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODULE_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const txt = await res.text();
    const parsed = txt ? JSON.parse(txt) as Record<string, unknown> : null;
    return res.ok && parsed?.success === true ? parsed : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// ─── Validation engine ───
function validate(levels: Levels, spot: number, atrV: number, queryType: QueryType, dcfDegenerate: boolean): {
  cleaned: Levels; omissions: Omission[];
} {
  const out: Levels = { ...levels };
  const om: Omission[] = [];
  const drop = (k: keyof Levels, reason: string) => {
    if (out[k] != null) { out[k] = null; om.push({ level: k, reason }); }
  };

  // Rule 8 (NaN/undefined guard)
  (Object.keys(out) as Array<keyof Levels>).forEach((k) => {
    const v = out[k];
    if (v != null && !Number.isFinite(v)) drop(k, "compute_error: non-finite value");
  });

  // Rule 9: SL must be strictly below spot for LONG positions (all tiers — Stockera has no short recs).
  // Catches the entire category of "SL above entry" bugs in any tier.
  if (out.stop_loss != null && out.stop_loss >= spot) {
    drop("stop_loss", "sl_above_spot_invalid_for_long_position");
  }

  // Rule 1: SL distance ≥ 0.5×ATR
  if (out.stop_loss != null && Number.isFinite(atrV) && Math.abs(spot - out.stop_loss) < 0.5 * atrV) {
    drop("stop_loss", "sl_too_tight: distance < 0.5×ATR (noise risk)");
  }

  // Rules 2 & 3: R:R thresholds (require valid SL)
  const slDist = out.stop_loss != null ? Math.abs(spot - out.stop_loss) : null;
  if (out.target_1 != null && slDist != null) {
    const rr = (out.target_1 - spot) / slDist;
    if (!(rr >= 1.5)) drop("target_1", `t1_rr_below_1.5 (actual ${rr.toFixed(2)})`);
  } else if (out.target_1 != null && slDist == null) {
    drop("target_1", "t1_omitted: sl invalid, cannot validate R:R");
  }
  if (out.target_2 != null && slDist != null) {
    const rr = (out.target_2 - spot) / slDist;
    if (!(rr >= 2.0)) drop("target_2", `t2_rr_below_2.0 (actual ${rr.toFixed(2)})`);
  } else if (out.target_2 != null && slDist == null) {
    drop("target_2", "t2_omitted: sl invalid, cannot validate R:R");
  }

  // Rule 4: S2 < S1 < spot
  if (out.support_1 != null && !(out.support_1 < spot)) drop("support_1", "support_above_spot");
  if (out.support_2 != null) {
    if (!(out.support_2 < spot)) drop("support_2", "support_above_spot");
    else if (out.support_1 != null && !(out.support_2 < out.support_1)) drop("support_2", "s2_not_below_s1");
  }

  // Rule 5: spot < R1 < R2
  if (out.resistance_1 != null && !(out.resistance_1 > spot)) drop("resistance_1", "resistance_below_spot");
  if (out.resistance_2 != null) {
    if (!(out.resistance_2 > spot)) drop("resistance_2", "resistance_below_spot");
    else if (out.resistance_1 != null && !(out.resistance_2 > out.resistance_1)) drop("resistance_2", "r2_not_above_r1");
  }

  // Rule 6: R1 ≠ T1 and R2 ≠ T2 (within 0.5% tolerance — treat as alias)
  const near = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1) < 0.005;
  if (out.resistance_1 != null && out.target_1 != null && near(out.resistance_1, out.target_1)) {
    drop("resistance_1", "r1_alias_of_t1");
  }
  if (out.resistance_2 != null && out.target_2 != null && near(out.resistance_2, out.target_2)) {
    drop("resistance_2", "r2_alias_of_t2");
  }

  // Rule 7: Long-term DCF degeneracy is no longer fatal — fallback hierarchy
  // (sector-multiple → vol-band) supplies targets when DCF is unreliable. Any
  // remaining null targets are reported via targets_meta with explicit reason.
  void dcfDegenerate; void queryType;

  return { cleaned: out, omissions: om };
}

// ─── Tier formulas ───
function intradayPlan(spot: number, atrV: number, prevDay: Candle | null): Levels {
  const out: Levels = {
    entry_zone: spot,
    stop_loss: spot - 1.0 * atrV,
    target_1:  spot + 1.5 * atrV,
    target_2:  spot + 2.5 * atrV,
    support_1: null, support_2: null, resistance_1: null, resistance_2: null,
  };
  if (prevDay) {
    const { high: h, low: l, close: c } = prevDay;
    const pp = (h + l + c) / 3;
    out.resistance_1 = 2 * pp - l;
    out.support_1    = 2 * pp - h;
    out.resistance_2 = pp + (h - l);
    out.support_2    = pp - (h - l);
  }
  return out;
}

function mediumPlan(spot: number, atrV: number, swingHighs: number[], swingLows: number[]): Levels {
  // SL: tighter of −2.5×ATR or just below 20-day swing low
  const swingLow20 = swingLows.length > 0 ? Math.min(...swingLows.slice(-3)) : NaN;
  const slByAtr = spot - 2.5 * atrV;
  const slBySwing = Number.isFinite(swingLow20) ? swingLow20 - 0.5 * atrV : NaN;
  const sl = Number.isFinite(slBySwing) ? Math.min(slByAtr, slBySwing) : slByAtr;

  // T1: max(spot*1.08, nearest prior swing high above spot)
  const priorHighsAbove = swingHighs.filter((h) => h > spot);
  const nearestSwingHigh = priorHighsAbove.length > 0 ? Math.min(...priorHighsAbove) : NaN;
  const t1Pct = spot * 1.08;
  const t1 = Number.isFinite(nearestSwingHigh) ? Math.max(t1Pct, nearestSwingHigh) : t1Pct;

  // T2: fib 1.272 of last impulse (last swing low → last swing high)
  let fib1272 = NaN;
  if (swingHighs.length && swingLows.length) {
    const lastHigh = swingHighs[swingHighs.length - 1];
    const lastLow  = swingLows[swingLows.length - 1];
    if (lastHigh > lastLow) fib1272 = lastLow + 1.272 * (lastHigh - lastLow);
  }
  const t2 = Number.isFinite(fib1272) ? Math.max(spot * 1.15, fib1272) : spot * 1.15;

  // S1/S2 = last two swing lows (below spot); R1/R2 = last two swing highs (above spot)
  const lowsBelow = swingLows.filter((x) => x < spot).slice(-2);
  const highsAbove = swingHighs.filter((x) => x > spot).slice(0, 2); // nearest two
  const sortedLows = [...lowsBelow].sort((a, b) => b - a); // closer first
  const sortedHighs = [...highsAbove].sort((a, b) => a - b);

  return {
    entry_zone: spot,
    stop_loss: sl,
    target_1: t1,
    target_2: t2,
    support_1: sortedLows[0] ?? null,
    support_2: sortedLows[1] ?? null,
    resistance_1: sortedHighs[0] ?? null,
    resistance_2: sortedHighs[1] ?? null,
  };
}

type TargetMethod = "dcf" | "sector_multiple" | "historical_multiple" | "vol_band" | "none";
interface TargetResolution {
  value: number | null;
  method: TargetMethod;
  reason: string;
  inputs: Record<string, number | string | null>;
  attempts: Array<{ method: TargetMethod; ok: boolean; reason: string; value?: number | null }>;
}

interface LongTermContext {
  spot: number;
  dcfFairValue: number | null;     // null if degenerate
  dcfDegenerate: boolean;
  sectorPeMedian: number | null;
  sectorReturn12mPct: number | null;
  sectorName: string | null;
  peRatio: number | null;
  trailingEps: number | null;      // price / pe (if pe valid)
  stockReturn12mPct: number | null;
  annVolPct: number | null;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function withinLongTermBand(spot: number, v: number): boolean {
  return v >= spot * (1 + LT_T1_FLOOR_PCT) && v <= spot * (1 + LT_TARGET_CAP_PCT);
}

function resolveLongTermT1(ctx: LongTermContext): TargetResolution {
  const attempts: TargetResolution["attempts"] = [];
  const spot = ctx.spot;

  // 1. DCF fair value
  if (ctx.dcfFairValue != null && !ctx.dcfDegenerate) {
    const v = ctx.dcfFairValue;
    if (withinLongTermBand(spot, v)) {
      return { value: v, method: "dcf", reason: "dcf_fair_value", inputs: { dcf: v, spot }, attempts: [{ method: "dcf", ok: true, reason: "dcf_fair_value", value: v }] };
    }
    attempts.push({ method: "dcf", ok: false, reason: v < spot * 1.05 ? "dcf_below_floor" : "dcf_above_cap", value: v });
  } else {
    attempts.push({ method: "dcf", ok: false, reason: ctx.dcfDegenerate ? "dcf_degenerate" : "dcf_missing" });
  }

  // 2. Sector multiple: trailing_eps × sector_pe_median (== spot × sector_pe / pe)
  if (ctx.trailingEps != null && ctx.sectorPeMedian != null) {
    const v = ctx.trailingEps * ctx.sectorPeMedian;
    if (withinLongTermBand(spot, v)) {
      return {
        value: v, method: "sector_multiple",
        reason: "sector_multiple_fair_value",
        inputs: { trailing_eps: ctx.trailingEps, sector_pe_median: ctx.sectorPeMedian, sector: ctx.sectorName, spot },
        attempts: [...attempts, { method: "sector_multiple", ok: true, reason: "sector_multiple_fair_value", value: v }],
      };
    }
    attempts.push({ method: "sector_multiple", ok: false, reason: v < spot * 1.05 ? "sector_multiple_below_floor" : "sector_multiple_above_cap", value: v });
  } else {
    attempts.push({ method: "sector_multiple", ok: false, reason: ctx.sectorPeMedian == null ? "sector_pe_missing" : "trailing_eps_missing" });
  }

  // 3. Historical multiple — 5y avg PE not available in current data layer
  attempts.push({ method: "historical_multiple", ok: false, reason: "historical_pe_unavailable" });

  // 4. Volatility / sector-momentum band: spot × (1 + clamp(0.06..0.18, sector_return_12m))
  const drift12m = ctx.sectorReturn12mPct != null
    ? clamp(ctx.sectorReturn12mPct / 100, 0.06, 0.18)
    : (ctx.stockReturn12mPct != null ? clamp(ctx.stockReturn12mPct / 100, 0.06, 0.18) : 0.10);
  const v = spot * (1 + drift12m);
  if (withinLongTermBand(spot, v)) {
    return {
      value: v, method: "vol_band",
      reason: "vol_band_expected_drift",
      inputs: { drift_12m_pct: drift12m * 100, sector_return_12m_pct: ctx.sectorReturn12mPct, stock_return_12m_pct: ctx.stockReturn12mPct, spot },
      attempts: [...attempts, { method: "vol_band", ok: true, reason: "vol_band_expected_drift", value: v }],
    };
  }
  attempts.push({ method: "vol_band", ok: false, reason: "vol_band_below_floor", value: v });

  return { value: null, method: "none", reason: "all_methods_failed", inputs: {}, attempts };
}

function resolveLongTermT2(ctx: LongTermContext, t1: TargetResolution): TargetResolution {
  const attempts: TargetResolution["attempts"] = [];
  const spot = ctx.spot;
  const cap = spot * (1 + LT_TARGET_CAP_PCT);
  const minT2 = (t1.value ?? spot * 1.05) * 1.005; // strictly above T1 if available

  const tryVal = (raw: number, method: TargetMethod, reason: string, extraInputs: Record<string, number | string | null> = {}): TargetResolution | null => {
    if (raw > minT2 && raw <= cap) {
      return {
        value: raw, method, reason,
        inputs: { ...extraInputs, spot, min_required: minT2, cap },
        attempts: [...attempts, { method, ok: true, reason, value: raw }],
      };
    }
    attempts.push({ method, ok: false, reason: raw <= minT2 ? `${method}_not_above_t1` : `${method}_above_cap`, value: raw });
    return null;
  };

  // 1. DCF stretch
  if (ctx.dcfFairValue != null && !ctx.dcfDegenerate) {
    const r = tryVal(ctx.dcfFairValue * 1.10, "dcf", "dcf_stretch", { dcf: ctx.dcfFairValue });
    if (r) return r;
  } else attempts.push({ method: "dcf", ok: false, reason: "dcf_unavailable" });

  // 2. Sector-multiple stretch
  if (ctx.trailingEps != null && ctx.sectorPeMedian != null) {
    const r = tryVal(ctx.trailingEps * ctx.sectorPeMedian * 1.10, "sector_multiple", "sector_multiple_stretch", { trailing_eps: ctx.trailingEps, sector_pe_median: ctx.sectorPeMedian, sector: ctx.sectorName });
    if (r) return r;
  } else attempts.push({ method: "sector_multiple", ok: false, reason: "sector_inputs_missing" });

  // 3. Historical band high — unavailable
  attempts.push({ method: "historical_multiple", ok: false, reason: "historical_band_unavailable" });

  // 4. Vol-band stretch: spot × (1 + 1.5 × drift)
  const drift = ctx.sectorReturn12mPct != null
    ? clamp(ctx.sectorReturn12mPct / 100, 0.06, 0.18)
    : (ctx.stockReturn12mPct != null ? clamp(ctx.stockReturn12mPct / 100, 0.06, 0.18) : 0.10);
  const r = tryVal(spot * (1 + 1.5 * drift), "vol_band", "vol_band_stretch", { drift_12m_pct: drift * 100 });
  if (r) return r;

  // 5. Final fallback: small buffer above T1 (if T1 exists) within cap
  if (t1.value != null) {
    const buffered = Math.min(t1.value * 1.05, cap * 0.999);
    if (buffered > minT2) {
      return {
        value: buffered, method: "vol_band",
        reason: "t1_plus_5pct_buffer (all other methods exceeded cap)",
        inputs: { t1: t1.value, cap, spot },
        attempts: [...attempts, { method: "vol_band", ok: true, reason: "t1_plus_5pct_buffer", value: buffered }],
      };
    }
  }

  return { value: null, method: "none", reason: "all_methods_failed", inputs: {}, attempts };
}


type SlMethod = "vol_adaptive" | "dma200_anchor" | "max_distance_cap" | "min_distance_floor";

function longTermPlanWithSl(spot: number, dma200: number, w52H: number, w52L: number, annVolPct: number | null, t1: number | null, t2: number | null): { levels: Levels; slMethod: SlMethod } {
  // Adaptive long-term SL — bounded by [10%, 20%] from spot.
  const volFrac = annVolPct != null && Number.isFinite(annVolPct) ? annVolPct / 100 : 0.20;
  const volFactor = Math.max(0.10, Math.min(0.20, 1.5 * volFrac));
  const slVol = spot * (1 - volFactor);
  const slDma = Number.isFinite(dma200) && dma200 < spot ? dma200 * 0.92 : -Infinity;
  let sl = Math.max(slVol, slDma); // pick the tighter (higher) anchor
  let slMethod: SlMethod = slDma > slVol ? "dma200_anchor" : "vol_adaptive";

  // Hard cap: SL cannot be more than 20% from spot (floor on price)
  const maxDistance = spot * 0.80;
  if (sl < maxDistance) { sl = maxDistance; slMethod = "max_distance_cap"; }

  // Tightness floor: for low-vol stocks, never tighter than 10% from spot
  const minDistance = spot * 0.90;
  if (sl > minDistance) { sl = minDistance; slMethod = "min_distance_floor"; }

  return {
    levels: {
      entry_zone: spot,
      stop_loss: sl,
      target_1: t1,
      target_2: t2,
      support_1: Number.isFinite(dma200) && dma200 < spot ? dma200 : null,
      support_2: w52L < spot ? w52L : null,
      resistance_1: w52H > spot ? w52H : null,
      resistance_2: null,
    },
    slMethod,
  };
}


async function fetchSectorAggregate(sectorRaw: string | null): Promise<{
  display: string; canonical: string; pe_median: number; return_12m_median_pct: number | null;
  data_source: "computed" | "bootstrap" | "default_fallback"; method_version: string | null; bootstrap_ref: string | null;
} | null> {
  const canonical = resolveSectorCanonical(sectorRaw);
  const candidates = [canonical, "__default__"].filter(Boolean) as string[];
  for (const c of candidates) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sector_aggregates?select=sector,sector_canonical,sector_display,pe_median,return_12m_median_pct,source,method_version,bootstrap_source_reference&sector_canonical=eq.${encodeURIComponent(c)}`,
      { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
    ).catch(() => null);
    if (!res || !res.ok) continue;
    type Row = { sector: string; sector_canonical: string; sector_display: string | null; pe_median: number; return_12m_median_pct: number | null; source: string | null; method_version: string | null; bootstrap_source_reference: string | null };
    let rows: Row[] = [];
    try { rows = (await res.json()) as Row[]; } catch { rows = []; }
    if (rows.length > 0) {
      const r = rows[0];
      const src = r.sector_canonical === "__default__"
        ? "default_fallback"
        : (r.source === "computed" ? "computed" : "bootstrap");
      return {
        display: r.sector_display ?? r.sector,
        canonical: r.sector_canonical,
        pe_median: Number(r.pe_median),
        return_12m_median_pct: r.return_12m_median_pct != null ? Number(r.return_12m_median_pct) : null,
        data_source: src as "computed" | "bootstrap" | "default_fallback",
        method_version: r.method_version,
        bootstrap_ref: r.bootstrap_source_reference,
      };
    }
  }
  return null;
}

// ─── Main ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);

  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({})) as { symbol?: string; query_type?: string };
    const symbol = body.symbol?.trim();
    if (!symbol) return json({ success: false, error: "SYMBOL_REQUIRED" }, 400);

    const qtRaw = (body.query_type ?? "medium-term").toLowerCase();
    const queryType: QueryType = (qtRaw === "intraday" || qtRaw === "long-term") ? qtRaw : "medium-term";

    // ── 1. Candles ──
    let candles: Candle[];
    try { candles = await fetchCandles(symbol); }
    catch (e) { return json({ success: false, error: "DATA_FETCH_FAILED", details: String(e) }, 200); }
    if (candles.length < 30) return json({ success: false, error: "INSUFFICIENT_HISTORY", got: candles.length }, 200);

    const closes = candles.map((c) => c.close);
    const highs  = candles.map((c) => c.high);
    const lows   = candles.map((c) => c.low);
    const spot = closes[closes.length - 1];
    const prevDay = candles.length >= 2 ? candles[candles.length - 2] : null;
    const atrV = atr(highs, lows, closes, 14);
    const dma200 = sma(closes, 200);
    const w52 = closes.slice(-252);
    const w52H = w52.length ? Math.max(...w52) : NaN;
    const w52L = w52.length ? Math.min(...w52) : NaN;

    // 20-day swing structure (window ≈ 40 bars to capture last ~2 cycles)
    const swingWindow = candles.slice(-60);
    const { highs: swingHighs, lows: swingLows } = swingPoints(swingWindow, 2);

    // ── 2. Side-data (DCF + risk) — best-effort, parallel ──
    const [fundRes, riskRes, momRes] = await Promise.all([
      queryType === "long-term" ? callJSON("compute-fundamentals", { symbol }) : Promise.resolve(null),
      callJSON("compute-risk", { symbol }),
      queryType === "long-term" ? callJSON("compute-momentum", { symbol }) : Promise.resolve(null),
    ]);

    // DCF intrinsic value per share
    let dcfPerShare: number | null = null;
    let dcfDegenerate = false;
    if (fundRes) {
      const q = (fundRes.quality_scores ?? {}) as Record<string, unknown>;
      dcfPerShare = finite(q.dcf_intrinsic_value);
      // Degenerate: missing, <=0, or wildly off (>3× spot) which usually signals a model break
      if (dcfPerShare == null || dcfPerShare <= 0 || dcfPerShare > spot * 3 || dcfPerShare < spot * 0.25) {
        dcfDegenerate = true;
      }
    } else if (queryType === "long-term") {
      dcfDegenerate = true;
    }

    // Annualized volatility (for nudge)
    let vol1y: number | null = null;
    let avgTurnoverCr: number | null = null;
    if (riskRes) {
      const v = (riskRes.volatility ?? {}) as Record<string, unknown>;
      vol1y = finite(v.annualized_pct);
      const liq = (riskRes.liquidity ?? {}) as Record<string, unknown>;
      avgTurnoverCr = finite(liq.avg_daily_turnover_cr);
    }

    // Momentum positive signal (legacy gate, kept for non-long-term contexts) + 12m return
    let momentumPositive = false;
    let stockReturn12mPct: number | null = null;
    if (momRes) {
      const cls = String(momRes.classification ?? "").toUpperCase();
      momentumPositive = cls.includes("STRONG") || cls.includes("POSITIVE") || cls.includes("UP");
      const rets = (momRes.returns ?? {}) as Record<string, unknown>;
      stockReturn12mPct = finite(rets["12m"]);
    }

    // ── 2b. Long-term fallback inputs ──
    let targetsMeta: Record<string, unknown> | null = null;
    let t1Resolved: TargetResolution | null = null;
    let t2Resolved: TargetResolution | null = null;
    let ltGuardrail: string | null = null;

    if (queryType === "long-term") {
      // Hard guardrails first — if violated, no targets at all.
      if (avgTurnoverCr != null && avgTurnoverCr < LT_LIQUIDITY_MIN_CR) {
        ltGuardrail = `insufficient_liquidity: avg daily turnover ₹${avgTurnoverCr.toFixed(2)}cr < ₹${LT_LIQUIDITY_MIN_CR}cr threshold`;
      } else if (vol1y != null && vol1y > LT_VOL_MAX_PCT) {
        ltGuardrail = `excessive_volatility: annualized vol ${vol1y.toFixed(1)}% > ${LT_VOL_MAX_PCT}% threshold`;
      }

      let sectorName: string | null = null;
      let peRatio: number | null = null;
      let trailingEps: number | null = null;
      if (fundRes) {
        const co = (fundRes.company ?? {}) as Record<string, unknown>;
        sectorName = (co.sector as string | null) ?? null;
        const val = (fundRes.valuation ?? {}) as Record<string, unknown>;
        peRatio = finite(val.pe);
        if (peRatio != null && peRatio > 0 && spot > 0) trailingEps = spot / peRatio;
      }

      const sectorAgg = await fetchSectorAggregate(sectorName);
      const sectorMissing = sectorAgg == null
        ? "sector_aggregate_missing"
        : (sectorAgg.canonical === "__default__" ? "alias_unmatched_used_default" : null);

      const ctx: LongTermContext = {
        spot,
        dcfFairValue: dcfDegenerate ? null : dcfPerShare,
        dcfDegenerate,
        sectorPeMedian: sectorAgg?.pe_median ?? null,
        sectorReturn12mPct: sectorAgg?.return_12m_median_pct ?? null,
        sectorName,
        peRatio,
        trailingEps,
        stockReturn12mPct,
        annVolPct: vol1y,
      };

      if (ltGuardrail) {
        t1Resolved = { value: null, method: "none", reason: ltGuardrail, inputs: {}, attempts: [] };
        t2Resolved = { value: null, method: "none", reason: ltGuardrail, inputs: {}, attempts: [] };
      } else {
        t1Resolved = resolveLongTermT1(ctx);
        t2Resolved = resolveLongTermT2(ctx, t1Resolved);
      }

      if (sectorAgg?.canonical === "__default__") {
        console.warn(`[compute-trade-plan] sector_aggregate_source=default_fallback symbol=${symbol} raw_sector="${sectorName ?? ""}"`);
      }

      targetsMeta = {
        tier: "long-term",
        t1: { value: t1Resolved.value, method: t1Resolved.method, reason: t1Resolved.reason, inputs: t1Resolved.inputs, attempts: t1Resolved.attempts },
        t2: { value: t2Resolved.value, method: t2Resolved.method, reason: t2Resolved.reason, inputs: t2Resolved.inputs, attempts: t2Resolved.attempts },
        guardrails: {
          liquidity_ok: !(avgTurnoverCr != null && avgTurnoverCr < LT_LIQUIDITY_MIN_CR),
          volatility_ok: !(vol1y != null && vol1y > LT_VOL_MAX_PCT),
          avg_daily_turnover_cr: avgTurnoverCr,
          ann_vol_pct: vol1y,
          guardrail_breach: ltGuardrail,
        },
        sector_used: sectorAgg?.display ?? null,
        sector_canonical: sectorAgg?.canonical ?? null,
        sector_aggregate_source: sectorAgg?.data_source ?? "missing",
        sector_method_version: sectorAgg?.method_version ?? null,
        sector_bootstrap_reference: sectorAgg?.bootstrap_ref ?? null,
        sector_missing_reason: sectorMissing,
      };
    }



    // ── 3. Per-tier raw plan ──
    let raw: Levels;
    let ltSlMethod: SlMethod | null = null;
    if (queryType === "intraday") {
      raw = intradayPlan(spot, atrV, prevDay);
    } else if (queryType === "long-term") {
      const lt = longTermPlanWithSl(spot, dma200, w52H, w52L, vol1y, t1Resolved?.value ?? null, t2Resolved?.value ?? null);
      raw = lt.levels;
      ltSlMethod = lt.slMethod;
      if (targetsMeta) {
        const tm = targetsMeta as Record<string, unknown>;
        tm.sl_method = ltSlMethod;
      }
    } else {
      raw = mediumPlan(spot, atrV, swingHighs, swingLows);
    }

    // ── 4. Validate ──
    const { cleaned, omissions } = validate(raw, spot, atrV, queryType, dcfDegenerate);

    // For long-term: if R:R validation drops a target that the resolver computed,
    // surface the reason in targets_meta too so the UI can explain it.
    if (queryType === "long-term" && targetsMeta) {
      const t1Dropped = omissions.find((o) => o.level === "target_1");
      const t2Dropped = omissions.find((o) => o.level === "target_2");
      if (t1Dropped && (targetsMeta.t1 as Record<string, unknown>).value != null) {
        (targetsMeta.t1 as Record<string, unknown>).reason = `dropped_by_validation: ${t1Dropped.reason}`;
        (targetsMeta.t1 as Record<string, unknown>).value = null;
      }
      if (t2Dropped && (targetsMeta.t2 as Record<string, unknown>).value != null) {
        (targetsMeta.t2 as Record<string, unknown>).reason = `dropped_by_validation: ${t2Dropped.reason}`;
        (targetsMeta.t2 as Record<string, unknown>).value = null;
      }
    }

    // ── 5. Round ──
    const levels: Levels = {
      entry_zone:   r2(cleaned.entry_zone),
      stop_loss:    r2(cleaned.stop_loss),
      target_1:     r2(cleaned.target_1),
      target_2:     r2(cleaned.target_2),
      support_1:    r2(cleaned.support_1),
      support_2:    r2(cleaned.support_2),
      resistance_1: r2(cleaned.resistance_1),
      resistance_2: r2(cleaned.resistance_2),
    };

    return json({
      success: true,
      symbol,
      tier: queryType,
      spot: r2(spot),
      atr_14: r2(atrV),
      vol_1y: vol1y,
      levels,
      validation: omissions,
      targets_meta: targetsMeta,
      inputs_summary: {
        bars: candles.length,
        prev_day: prevDay?.date ?? null,
        dma_200: r2(dma200),
        w52_high: r2(w52H),
        w52_low: r2(w52L),
        swing_highs_n: swingHighs.length,
        swing_lows_n: swingLows.length,
        dcf_intrinsic: r2(dcfPerShare),
        dcf_degenerate: dcfDegenerate,
        momentum_positive: momentumPositive,
        avg_daily_turnover_cr: avgTurnoverCr,
      },
      formula_version: FORMULA_VERSION,
      computed_at: new Date().toISOString(),
      latency_ms: Date.now() - started,
    });
  } catch (e) {
    console.error("compute-trade-plan:", e);
    return json({ success: false, error: "INTERNAL_ERROR", details: String(e) }, 500);
  }
});
