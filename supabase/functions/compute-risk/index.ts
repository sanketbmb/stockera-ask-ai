// compute-risk
// Pure-JS risk engine over FinEdge daily OHLCV.
// Third Brain module. Stateless. Returns risk metrics, signals and a 0-100 safety score.
// SEBI-defensible: all formulas reference published academic sources (Sharpe 1964/66,
// Sortino & Price 1994, Young 1991, Jorion "Value at Risk", Hull "Derivatives").

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ───────────────── auditable constants ─────────────────
const RISK_FREE_RATE = 0.071;          // 10-yr G-Sec yield, India 2026
const TRADING_DAYS_PER_YEAR = 252;
const LOOKBACK_DAYS = 750;             // ~3 yrs of trading data requested
const MIN_DAYS_REQUIRED = 252;         // 1-yr hard floor after alignment
const EPSILON = 1e-9;
const BENCHMARK_FALLBACKS = ["NIFTY", "NIFTY50", "^NSEI", "SENSEX"] as const;

interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ───────────────── helpers ─────────────────
function safe<T>(fn: () => T): T | null { try { const v = fn(); return Number.isFinite(v as unknown as number) || typeof v !== "number" ? v : null; } catch { return null; } }
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : NaN);
function variance(a: number[]): number {
  if (a.length < 2) return NaN;
  const m = mean(a);
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return s / (a.length - 1); // sample variance
}
const stdev = (a: number[]) => Math.sqrt(variance(a));
function covariance(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return NaN;
  const mx = mean(x.slice(-n)), my = mean(y.slice(-n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (x[x.length - n + i] - mx) * (y[y.length - n + i] - my);
  return s / (n - 1);
}
function pearson(x: number[], y: number[]): number {
  const sx = stdev(x), sy = stdev(y);
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < EPSILON || sy < EPSILON) return NaN;
  return covariance(x, y) / (sx * sy);
}
/** Daily returns: r_t = (c_t - c_{t-1}) / c_{t-1}. Length = closes.length - 1. */
function dailyReturns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) r.push((closes[i] - prev) / prev);
  }
  return r;
}
/** Linear-interp percentile (p in 0..100) on already-sorted ascending series. */
function percentileSorted(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ───────────────── data fetch ─────────────────
async function fetchCandles(symbol: string, auth: string | null): Promise<Candle[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/finedge-fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: auth ?? `Bearer ${SERVICE_KEY}` },
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
  const candles: Candle[] = rows.map((r) => {
    const x = r as Record<string, unknown>;
    return {
      date: String(x.quote_date ?? x.date ?? ""),
      open: Number(x.open_price ?? x.open ?? 0),
      high: Number(x.high_price ?? x.high ?? 0),
      low: Number(x.low_price ?? x.low ?? 0),
      close: Number(x.close_price ?? x.close ?? 0),
      volume: Number(x.volume ?? 0),
    };
  }).filter((c) => c.date && c.close > 0);
  candles.sort((a, b) => a.date.localeCompare(b.date));
  return candles;
}

async function fetchBenchmark(preferred: string | undefined, auth: string | null): Promise<{ symbol: string; candles: Candle[] } | null> {
  const candidates = preferred ? [preferred, ...BENCHMARK_FALLBACKS.filter((s) => s !== preferred)] : [...BENCHMARK_FALLBACKS];
  for (const sym of candidates) {
    try {
      const c = await fetchCandles(sym, auth);
      if (c.length >= MIN_DAYS_REQUIRED) return { symbol: sym, candles: c };
    } catch { /* try next */ }
  }
  return null;
}

/** Intersect two candle series by ISO date. Returns paired close arrays. */
function alignByDate(a: Candle[], b: Candle[]): { dates: string[]; a: number[]; b: number[] } {
  const mb = new Map(b.map((c) => [c.date, c.close]));
  const dates: string[] = [], ax: number[] = [], bx: number[] = [];
  for (const c of a) {
    const bc = mb.get(c.date);
    if (bc !== undefined) { dates.push(c.date); ax.push(c.close); bx.push(bc); }
  }
  return { dates, a: ax, b: bx };
}

// ───────────────── metric blocks ─────────────────

/** Annualized volatility = stdev(daily returns) × √252. (Hull, "Derivatives") */
function annualizedVol(returns: number[]): number { return stdev(returns) * Math.sqrt(TRADING_DAYS_PER_YEAR); }

/** Volatility trend: compare rolling 30-day vs 90-day stdev (annualized). */
function volTrend(r30: number, r90: number): "INCREASING" | "DECREASING" | "STABLE" {
  if (!Number.isFinite(r30) || !Number.isFinite(r90) || r90 < EPSILON) return "STABLE";
  const delta = (r30 - r90) / r90;
  if (delta > 0.10) return "INCREASING";
  if (delta < -0.10) return "DECREASING";
  return "STABLE";
}

/** Beta = Cov(stock, benchmark) / Var(benchmark). (CAPM — Sharpe 1964) */
function beta(stockR: number[], benchR: number[]): number {
  const v = variance(benchR);
  if (!Number.isFinite(v) || v < EPSILON) return NaN;
  return covariance(stockR, benchR) / v;
}

/** Sharpe ratio = (annRet − Rf) / annVol. (Sharpe 1966) */
function sharpe(annRet: number, annVol: number): number {
  if (!Number.isFinite(annVol) || annVol < EPSILON) return NaN;
  return (annRet - RISK_FREE_RATE) / annVol;
}

/** Sortino ratio = (annRet − Rf) / downside deviation. (Sortino & Price 1994) */
function sortino(returns: number[], annRet: number): number {
  const dailyRf = RISK_FREE_RATE / TRADING_DAYS_PER_YEAR;
  const downs = returns.map((r) => Math.min(r - dailyRf, 0));
  // RMS of downside deviations, annualized
  let s = 0; let n = 0;
  for (const d of downs) { s += d * d; n++; }
  if (n < 2) return NaN;
  const dd = Math.sqrt(s / (n - 1)) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  if (dd < EPSILON) return NaN;
  return (annRet - RISK_FREE_RATE) / dd;
}

/** Drawdown analytics from close series. (standard peak-to-trough definition) */
function drawdownAnalytics(closes: number[]) {
  let peak = closes[0], maxDD = 0, maxDDIdx = 0, peakAtMax = 0, peakIdxAtMax = 0;
  let curPeak = closes[0], curPeakIdx = 0;
  const ddSeries: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (closes[i] > curPeak) { curPeak = closes[i]; curPeakIdx = i; }
    const dd = (closes[i] - curPeak) / curPeak;
    ddSeries.push(dd);
    if (dd < maxDD) { maxDD = dd; maxDDIdx = i; peakAtMax = curPeak; peakIdxAtMax = curPeakIdx; }
    if (closes[i] > peak) peak = closes[i];
  }
  // current drawdown from running all-time-high
  const ath = Math.max(...closes);
  const cur = (closes[closes.length - 1] - ath) / ath;
  // average drawdown over all in-drawdown days
  const inDD = ddSeries.filter((d) => d < 0);
  const avgDD = inDD.length ? mean(inDD) : 0;
  // recovery: days from trough back to a new peak (≥ peakAtMax)
  let recoveryDays: number | null = null;
  for (let i = maxDDIdx + 1; i < closes.length; i++) {
    if (closes[i] >= peakAtMax) { recoveryDays = i - maxDDIdx; break; }
  }
  const durationDays = maxDDIdx - peakIdxAtMax;
  return {
    max_drawdown_pct: maxDD * 100,
    current_drawdown_pct: cur * 100,
    avg_drawdown_pct: avgDD * 100,
    recovery_days: recoveryDays,
    drawdown_duration_days: durationDays,
  };
}

/** Historical Value at Risk (Jorion, "Value at Risk"). VaR / CVaR reported as positive % losses. */
function valueAtRisk(returns: number[]) {
  const sorted = [...returns].sort((a, b) => a - b);
  const var95 = percentileSorted(sorted, 5);   // 5th percentile = left tail
  const var99 = percentileSorted(sorted, 1);
  const tail = sorted.filter((r) => r <= var95);
  const cvar95 = tail.length ? mean(tail) : var95;
  return {
    var_95_pct: -var95 * 100,
    var_99_pct: -var99 * 100,
    cvar_95_pct: -cvar95 * 100,
    worst_day_pct: sorted[0] * 100,
    best_day_pct: sorted[sorted.length - 1] * 100,
  };
}

/** Behavior counts over the last `window` returns. */
function behavior(returns: number[], window = TRADING_DAYS_PER_YEAR) {
  const r = returns.slice(-window);
  let up = 0, down = 0, curUp = 0, curDown = 0, maxUp = 0, maxDown = 0;
  for (const v of r) {
    if (v > 0) { up++; curUp++; curDown = 0; if (curUp > maxUp) maxUp = curUp; }
    else if (v < 0) { down++; curDown++; curUp = 0; if (curDown > maxDown) maxDown = curDown; }
    else { curUp = 0; curDown = 0; }
  }
  const total = up + down;
  return {
    up_days: up,
    down_days: down,
    up_day_ratio: total ? up / total : 0,
    max_winning_streak: maxUp,
    max_losing_streak: maxDown,
  };
}

// ───────────────── score band helpers ─────────────────
const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) =>
  y0 + ((Math.min(Math.max(x, x0), x1) - x0) / (x1 - x0)) * (y1 - y0);

function volScore(annVolPct: number): number {
  if (!Number.isFinite(annVolPct)) return 0;
  if (annVolPct <= 15) return 25;
  if (annVolPct <= 25) return lerp(annVolPct, 15, 25, 25, 20);
  if (annVolPct <= 35) return lerp(annVolPct, 25, 35, 20, 10);
  if (annVolPct <= 50) return lerp(annVolPct, 35, 50, 10, 3);
  return 0;
}
function sharpeScore(s: number): number {
  if (!Number.isFinite(s)) return 0;
  if (s >= 2) return 25;
  if (s >= 1) return lerp(s, 1, 2, 17, 25);
  if (s >= 0) return lerp(s, 0, 1, 8, 17);
  return 0;
}
function ddScore(absMaxDD: number): number {
  if (!Number.isFinite(absMaxDD)) return 0;
  if (absMaxDD <= 10) return 20;
  if (absMaxDD <= 25) return lerp(absMaxDD, 10, 25, 20, 12);
  if (absMaxDD <= 40) return lerp(absMaxDD, 25, 40, 12, 5);
  return 0;
}
function betaScore(b: number): number {
  if (!Number.isFinite(b)) return 0;
  if (b >= 0.8 && b <= 1.3) return 15;
  if (b >= 0.3 && b < 0.8) return lerp(b, 0.3, 0.8, 0, 15);
  if (b > 1.3 && b <= 1.8) return lerp(b, 1.3, 1.8, 15, 0);
  return 0;
}
function liqScore(cls: "HIGH" | "MEDIUM" | "LOW" | null): number {
  if (cls === "HIGH") return 15;
  if (cls === "MEDIUM") return 9;
  if (cls === "LOW") return 3;
  return 0;
}

// ───────────────── main handler ─────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({})) as { symbol?: string; benchmark?: string };
    const symbol = body.symbol?.trim();
    if (!symbol) return json({ success: false, error: "SYMBOL_REQUIRED" }, 400);
    const auth = req.headers.get("authorization");

    // Fetch stock + benchmark in parallel (benchmark walks fallback chain internally)
    let stockCandles: Candle[]; let bench: { symbol: string; candles: Candle[] } | null;
    try {
      const [s, b] = await Promise.all([
        fetchCandles(symbol, auth),
        fetchBenchmark(body.benchmark, auth),
      ]);
      stockCandles = s; bench = b;
    } catch (e) {
      return json({ success: false, error: "DATA_FETCH_FAILED", details: String(e) }, 200);
    }

    if (stockCandles.length < MIN_DAYS_REQUIRED) {
      return json({ success: false, error: "INSUFFICIENT_HISTORY", got: stockCandles.length, need: MIN_DAYS_REQUIRED }, 200);
    }

    // Slice to lookback window
    const stock = stockCandles.slice(-LOOKBACK_DAYS);
    const stockCloses = stock.map((c) => c.close);
    const stockReturns = dailyReturns(stockCloses);

    // ── Volatility ──
    const annVol = annualizedVol(stockReturns) * 100;
    const dailyVolPct = stdev(stockReturns) * 100;
    const r30 = annualizedVol(stockReturns.slice(-30)) * 100;
    const r90 = annualizedVol(stockReturns.slice(-90)) * 100;
    const trend = volTrend(r30, r90);

    // ── Market risk (beta / correlation) — needs benchmark ──
    let marketRisk: Record<string, unknown> | null = null;
    let benchUsed: string | null = null;
    let corr = NaN;
    let b = NaN;
    if (bench) {
      benchUsed = bench.symbol;
      const aligned = alignByDate(stock, bench.candles);
      if (aligned.a.length >= MIN_DAYS_REQUIRED) {
        const sR = dailyReturns(aligned.a.slice(-TRADING_DAYS_PER_YEAR - 1));
        const bR = dailyReturns(aligned.b.slice(-TRADING_DAYS_PER_YEAR - 1));
        b = beta(sR, bR);
        corr = pearson(sR, bR);
        const cls: "HIGH" | "NORMAL" | "LOW" = b > 1.3 ? "HIGH" : b >= 0.8 ? "NORMAL" : "LOW";
        marketRisk = {
          beta: safe(() => b),
          beta_classification: Number.isFinite(b) ? cls : null,
          correlation_with_nifty: safe(() => corr),
          r_squared: safe(() => corr * corr),
        };
      }
    }

    // ── Risk-adjusted returns ──
    const annRet = Math.pow(1 + mean(stockReturns), TRADING_DAYS_PER_YEAR) - 1;
    const sh = sharpe(annRet, annVol / 100);
    const so = sortino(stockReturns, annRet);
    const dd = drawdownAnalytics(stockCloses);
    const calmar = Number.isFinite(dd.max_drawdown_pct) && Math.abs(dd.max_drawdown_pct) > EPSILON
      ? annRet / (Math.abs(dd.max_drawdown_pct) / 100)
      : NaN;
    const sharpeRating: "EXCELLENT" | "GOOD" | "AVERAGE" | "POOR" =
      sh > 2 ? "EXCELLENT" : sh >= 1 ? "GOOD" : sh >= 0.5 ? "AVERAGE" : "POOR";

    // ── VaR ──
    const var_ = valueAtRisk(stockReturns);

    // ── Liquidity (20-day) ──
    const last20 = stock.slice(-20);
    const avgVol20 = mean(last20.map((c) => c.volume));
    const avgTurnoverCr = mean(last20.map((c) => c.volume * c.close)) / 1e7;
    const liqClass: "HIGH" | "MEDIUM" | "LOW" =
      avgTurnoverCr > 100 ? "HIGH" : avgTurnoverCr >= 10 ? "MEDIUM" : "LOW";

    // ── Behavior ──
    const beh = behavior(stockReturns, TRADING_DAYS_PER_YEAR);

    // ── Signals ──
    const signals: string[] = [];
    if (annVol > 35) signals.push("high_volatility");
    if (annVol < 15) signals.push("low_volatility");
    if (Number.isFinite(b) && b > 1.5) signals.push("high_beta");
    if (Number.isFinite(b) && b < 0.7) signals.push("low_beta");
    if (Number.isFinite(sh) && sh > 1.5) signals.push("high_sharpe");
    if (Number.isFinite(sh) && sh < 0) signals.push("negative_sharpe");
    const curDDabs = Math.abs(dd.current_drawdown_pct);
    if (curDDabs > 25) signals.push("deep_drawdown");
    if (curDDabs >= 5 && curDDabs <= 25 && r30 < r90) signals.push("recovery_phase");
    if (curDDabs < 5) signals.push("near_ath");
    if (var_.var_95_pct > 3) signals.push("high_var");
    if (liqClass === "LOW") signals.push("low_liquidity");
    if (Number.isFinite(corr) && corr > 0.85) signals.push("high_correlation");
    if (Number.isFinite(corr) && corr < 0.4) signals.push("decoupled");
    if (beh.up_day_ratio >= 0.6) signals.push("trending_up");
    if (beh.up_day_ratio <= 0.4) signals.push("trending_down");

    // ── Score (0-100; higher = safer) ──
    const score = Math.round(
      volScore(annVol) +
      sharpeScore(sh) +
      ddScore(Math.abs(dd.max_drawdown_pct)) +
      betaScore(b) +
      liqScore(liqClass)
    );
    const riskScore = Math.max(0, Math.min(100, score));
    const classification: "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK" | "VERY_HIGH_RISK" =
      riskScore >= 75 ? "LOW_RISK" : riskScore >= 55 ? "MEDIUM_RISK" : riskScore >= 35 ? "HIGH_RISK" : "VERY_HIGH_RISK";

    return json({
      success: true,
      symbol,
      benchmark: benchUsed,
      benchmark_warning: bench ? null : "BENCHMARK_UNAVAILABLE",
      computed_at: new Date().toISOString(),
      data_range: { from: stock[0].date, to: stock[stock.length - 1].date, trading_days: stock.length },

      volatility: {
        annualized_pct: safe(() => annVol),
        daily_pct: safe(() => dailyVolPct),
        rolling_30d_pct: safe(() => r30),
        rolling_90d_pct: safe(() => r90),
        trend,
      },

      market_risk: marketRisk,

      risk_adjusted_returns: {
        sharpe_ratio: safe(() => sh),
        sharpe_rating: Number.isFinite(sh) ? sharpeRating : null,
        sortino_ratio: safe(() => so),
        calmar_ratio: safe(() => calmar),
        annualized_return_pct: safe(() => annRet * 100),
      },

      drawdown: {
        max_drawdown_pct: safe(() => dd.max_drawdown_pct),
        current_drawdown_pct: safe(() => dd.current_drawdown_pct),
        avg_drawdown_pct: safe(() => dd.avg_drawdown_pct),
        recovery_days: dd.recovery_days,
        drawdown_duration_days: dd.drawdown_duration_days,
      },

      value_at_risk: {
        var_95_pct: safe(() => var_.var_95_pct),
        var_99_pct: safe(() => var_.var_99_pct),
        cvar_95_pct: safe(() => var_.cvar_95_pct),
        worst_day_pct: safe(() => var_.worst_day_pct),
        best_day_pct: safe(() => var_.best_day_pct),
      },

      liquidity: {
        avg_volume_20d: safe(() => avgVol20),
        avg_daily_turnover_cr: safe(() => avgTurnoverCr),
        classification: liqClass,
      },

      behavior: beh,

      signals,
      risk_score: riskScore,
      risk_classification: classification,
    });
  } catch (e) {
    console.error("compute-risk:", e);
    return json({ success: false, error: "INTERNAL_ERROR", details: String(e) }, 500);
  }
});
