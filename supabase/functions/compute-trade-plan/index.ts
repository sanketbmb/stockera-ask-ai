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

  // Rule 7: Long-term + degenerate DCF → strip targets
  if (queryType === "long-term" && dcfDegenerate) {
    drop("target_1", "long_term_dcf_degenerate");
    drop("target_2", "long_term_dcf_degenerate");
  }

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

function longTermPlan(spot: number, dma200: number, w52H: number, w52L: number, dcfFairValue: number | null, momentumPositive: boolean): Levels {
  const slPct = spot * 0.85;
  // Uptrending (DMA below spot): use the higher (tighter) of the % stop or DMA-based stop.
  // Downtrending (DMA above spot): the DMA term would push SL above spot — ignore it, use simple % stop.
  const sl = (Number.isFinite(dma200) && dma200 < spot)
    ? Math.max(slPct, dma200 * 0.92)
    : slPct;
  return {
    entry_zone: spot,
    stop_loss: sl,
    target_1: dcfFairValue != null && dcfFairValue > spot ? dcfFairValue : null,
    target_2: momentumPositive ? spot * 1.25 : null,
    support_1: Number.isFinite(dma200) && dma200 < spot ? dma200 : null,
    support_2: w52L < spot ? w52L : null,
    resistance_1: w52H > spot ? w52H : null,
    resistance_2: null,
  };
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
    if (riskRes) {
      const v = (riskRes.volatility ?? {}) as Record<string, unknown>;
      vol1y = finite(v.annualized_pct);
    }

    // Momentum positive signal (for long-term T2 gate)
    let momentumPositive = false;
    if (momRes) {
      const cls = String(momRes.classification ?? "").toUpperCase();
      momentumPositive = cls.includes("STRONG") || cls.includes("POSITIVE") || cls.includes("UP");
    }

    // ── 3. Per-tier raw plan ──
    let raw: Levels;
    if (queryType === "intraday")          raw = intradayPlan(spot, atrV, prevDay);
    else if (queryType === "long-term")    raw = longTermPlan(spot, dma200, w52H, w52L, dcfDegenerate ? null : dcfPerShare, momentumPositive);
    else                                   raw = mediumPlan(spot, atrV, swingHighs, swingLows);

    // ── 4. Validate ──
    const { cleaned, omissions } = validate(raw, spot, atrV, queryType, dcfDegenerate);

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
