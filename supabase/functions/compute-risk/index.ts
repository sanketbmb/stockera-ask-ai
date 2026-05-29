// compute-risk
// Pure-JS risk engine over FinEdge daily OHLCV with Dhan-sourced benchmark.
// Third Brain module. Stateless compute, with benchmark cache + weekly Beta SWR.
//
// DATA SOURCE STRATEGY:
// - Stock prices: FinEdge daily-quotes (covers 24/7).
// - Index/benchmark: Dhan historical endpoint (works 24/7).
// - We do NOT use Dhan live endpoints (ltp/quote/ohlc) which fail post-market —
//   historical endpoint is sufficient for Beta/Correlation since these are
//   computed from daily closes.
// - Beta is week-refreshed (heavy compute, cached in risk_compute_meta);
//   other risk metrics are recomputed daily.
//
// SEBI-defensible: all formulas reference published academic sources
// (Sharpe 1964/66, Sortino & Price 1994, Young 1991, Jorion "Value at Risk",
// Hull "Derivatives").

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
const BENCHMARK_HISTORY_DAYS = 1000;   // 3+ years buffer for benchmark fetch
const BENCHMARK_CACHE_TTL_HOURS = 24;
const BETA_REFRESH_DAYS = 7;           // Beta only recomputed weekly

/** Dhan security IDs for index benchmarks. Used by dhan-fetch /charts/historical. */
const BENCHMARK_MAP: Record<string, { dhan_security_id: string; segment: "IDX_I" }> = {
  NIFTY:       { dhan_security_id: "13", segment: "IDX_I" },
  BANKNIFTY:   { dhan_security_id: "25", segment: "IDX_I" },
  NIFTYIT:     { dhan_security_id: "29", segment: "IDX_I" },
  NIFTYAUTO:   { dhan_security_id: "27", segment: "IDX_I" },
  NIFTYPHARMA: { dhan_security_id: "33", segment: "IDX_I" },
  NIFTYFMCG:   { dhan_security_id: "28", segment: "IDX_I" },
  NIFTY100:    { dhan_security_id: "24", segment: "IDX_I" },
  SENSEX:      { dhan_security_id: "51", segment: "IDX_I" },
};
const BENCHMARK_FALLBACK_CHAIN = ["NIFTY", "SENSEX"] as const;

interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ───────────────── helpers ─────────────────
function safe<T>(fn: () => T): T | null {
  try { const v = fn(); return Number.isFinite(v as unknown as number) || typeof v !== "number" ? v : null; }
  catch { return null; }
}
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : NaN);
function variance(a: number[]): number {
  if (a.length < 2) return NaN;
  const m = mean(a);
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return s / (a.length - 1);
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
/** Daily returns: r_t = (c_t - c_{t-1}) / c_{t-1}. */
function dailyReturns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) r.push((closes[i] - prev) / prev);
  }
  return r;
}
function percentileSorted(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

// ───────────────── Supabase REST helpers (service role) ─────────────────
async function sbSelect(path: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}
async function sbUpsert(table: string, row: Record<string, unknown>, onConflict: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
}

// ───────────────── data fetch ─────────────────

/** Fetch stock candles via FinEdge. */
async function fetchStockCandles(symbol: string, auth: string | null): Promise<Candle[]> {
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

/**
 * Fetch benchmark daily closes via Dhan /charts/historical.
 * Works 24/7 (unlike Dhan live endpoints).
 * Returns parsed [{date, close}] sorted ascending.
 */
async function fetchBenchmarkFromDhan(symbol: string, auth: string | null): Promise<Array<{ date: string; close: number }>> {
  const map = BENCHMARK_MAP[symbol];
  if (!map) throw new Error(`unknown benchmark ${symbol}`);
  const today = new Date();
  const from = new Date(today.getTime() - BENCHMARK_HISTORY_DAYS * 86_400_000);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/dhan-fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: auth ?? `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({
      endpoint: "historical",
      securityId: map.dhan_security_id,
      exchangeSegment: map.segment,
      params: { instrument: "INDEX", fromDate: isoDate(from), toDate: isoDate(today) },
    }),
  });
  const txt = await res.text();
  let body: Record<string, unknown> = {};
  try { body = txt ? JSON.parse(txt) : {}; } catch { /* */ }
  if (!res.ok || body.success !== true) throw new Error(`dhan ${res.status}: ${String(body.error ?? txt).slice(0, 200)}`);
  // Dhan historical response shape: { data: { open[], high[], low[], close[], volume[], timestamp[] } }
  const wrap = body.data as Record<string, unknown> | undefined;
  const inner = (wrap?.data ?? wrap) as Record<string, unknown> | undefined;
  const closes = inner?.close as number[] | undefined;
  const ts = inner?.timestamp as number[] | undefined;
  if (!Array.isArray(closes) || !Array.isArray(ts) || closes.length !== ts.length) {
    throw new Error("dhan: malformed historical payload");
  }
  const out: Array<{ date: string; close: number }> = [];
  for (let i = 0; i < ts.length; i++) {
    const close = Number(closes[i]);
    if (!Number.isFinite(close) || close <= 0) continue;
    // Dhan timestamps are epoch seconds (IST market data)
    const d = new Date(ts[i] * 1000);
    out.push({ date: isoDate(d), close });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Read cached benchmark candles if fresh enough (TTL hours). */
async function readBenchmarkCache(symbol: string): Promise<Array<{ date: string; close: number }> | null> {
  const rows = await sbSelect(`benchmark_cache?benchmark_symbol=eq.${encodeURIComponent(symbol)}&select=daily_candles,last_updated_at&limit=1`);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0] as { daily_candles: Array<{ date: string; close: number }>; last_updated_at: string };
  const ageH = (Date.now() - new Date(r.last_updated_at).getTime()) / 3_600_000;
  if (ageH > BENCHMARK_CACHE_TTL_HOURS * 30) return r.daily_candles; // stale but better than nothing
  return r.daily_candles;
}
async function cacheIsFresh(symbol: string): Promise<boolean> {
  const rows = await sbSelect(`benchmark_cache?benchmark_symbol=eq.${encodeURIComponent(symbol)}&select=last_updated_at&limit=1`);
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const ts = new Date((rows[0] as { last_updated_at: string }).last_updated_at).getTime();
  return (Date.now() - ts) / 3_600_000 < BENCHMARK_CACHE_TTL_HOURS;
}
async function writeBenchmarkCache(symbol: string, candles: Array<{ date: string; close: number }>): Promise<void> {
  await sbUpsert("benchmark_cache", {
    benchmark_symbol: symbol,
    daily_candles: candles,
    candle_count: candles.length,
    last_updated_at: new Date().toISOString(),
  }, "benchmark_symbol");
}

/**
 * Resolve benchmark candles with full fallback chain:
 *   1. Fresh cache (<24h) for preferred symbol
 *   2. Dhan historical fetch for preferred symbol
 *   3. Same two steps for each fallback in BENCHMARK_FALLBACK_CHAIN
 *   4. Stale cache (any age) as last resort
 */
async function resolveBenchmark(
  preferred: string,
  auth: string | null,
  log: string[],
): Promise<{ symbol: string; candles: Array<{ date: string; close: number }> } | null> {
  const chain: string[] = [preferred, ...BENCHMARK_FALLBACK_CHAIN.filter((s) => s !== preferred)];
  for (const sym of chain) {
    // Try fresh cache
    if (await cacheIsFresh(sym)) {
      const c = await readBenchmarkCache(sym);
      if (c && c.length >= MIN_DAYS_REQUIRED) { log.push(`benchmark:${sym}:cache_hit`); return { symbol: sym, candles: c }; }
    }
    // Try live Dhan fetch
    try {
      const c = await fetchBenchmarkFromDhan(sym, auth);
      if (c.length >= MIN_DAYS_REQUIRED) {
        await writeBenchmarkCache(sym, c);
        log.push(`benchmark:${sym}:dhan_ok(${c.length})`);
        return { symbol: sym, candles: c };
      }
      log.push(`benchmark:${sym}:dhan_insufficient(${c.length})`);
    } catch (e) {
      log.push(`benchmark:${sym}:dhan_err(${String(e).slice(0, 80)})`);
    }
    if (sym !== preferred) log.push(`BENCHMARK_FALLBACK: ${preferred} → ${sym}`);
  }
  // Last resort: stale cache for anything in chain
  for (const sym of chain) {
    const c = await readBenchmarkCache(sym);
    if (c && c.length >= MIN_DAYS_REQUIRED) { log.push(`benchmark:${sym}:stale_cache`); return { symbol: sym, candles: c }; }
  }
  return null;
}

/** Pick benchmark by sector heuristic. */
function selectBenchmark(sector: string | null | undefined): string {
  const s = (sector ?? "").toLowerCase();
  if (s.includes("bank")) return "BANKNIFTY";
  if (s.includes("information technology") || s.includes("software") || s.includes(" it ") || s === "it") return "NIFTYIT";
  if (s.includes("auto")) return "NIFTYAUTO";
  if (s.includes("pharm")) return "NIFTYPHARMA";
  if (s.includes("fmcg") || s.includes("consumer")) return "NIFTYFMCG";
  return "NIFTY";
}

/** Try to fetch sector for a symbol from FinEdge company-profile (best-effort). */
async function fetchSector(symbol: string, auth: string | null): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/finedge-fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: auth ?? `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ endpoint: "company-profile", symbol }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (body.success !== true) return null;
    const data = (body.data as Record<string, unknown> | undefined);
    const inner = (data?.data ?? data) as Record<string, unknown> | undefined;
    const sector = inner?.sector ?? inner?.industry ?? inner?.Sector ?? null;
    return sector ? String(sector) : null;
  } catch { return null; }
}

/** Intersect stock & benchmark by ISO date. */
function alignByDate(
  stock: Candle[],
  bench: Array<{ date: string; close: number }>,
): { a: number[]; b: number[] } {
  const mb = new Map(bench.map((c) => [c.date, c.close]));
  const a: number[] = [], b: number[] = [];
  for (const c of stock) {
    const bc = mb.get(c.date);
    if (bc !== undefined) { a.push(c.close); b.push(bc); }
  }
  return { a, b };
}

// ───────────────── metric blocks ─────────────────

/** Annualized volatility = stdev(daily returns) × √252. (Hull) */
function annualizedVol(returns: number[]): number { return stdev(returns) * Math.sqrt(TRADING_DAYS_PER_YEAR); }

function volTrend(r30: number, r90: number): "INCREASING" | "DECREASING" | "STABLE" {
  if (!Number.isFinite(r30) || !Number.isFinite(r90) || r90 < EPSILON) return "STABLE";
  const delta = (r30 - r90) / r90;
  if (delta > 0.10) return "INCREASING";
  if (delta < -0.10) return "DECREASING";
  return "STABLE";
}

/** Beta = Cov(stock, benchmark) / Var(benchmark). (CAPM, Sharpe 1964) */
function beta(stockR: number[], benchR: number[]): number {
  const v = variance(benchR);
  if (!Number.isFinite(v) || v < EPSILON) return NaN;
  return covariance(stockR, benchR) / v;
}

/** Sharpe = (annRet − Rf) / annVol. (Sharpe 1966) */
function sharpe(annRet: number, annVol: number): number {
  if (!Number.isFinite(annVol) || annVol < EPSILON) return NaN;
  return (annRet - RISK_FREE_RATE) / annVol;
}

/** Sortino = (annRet − Rf) / downside deviation. (Sortino & Price 1994) */
function sortino(returns: number[], annRet: number): number {
  const dailyRf = RISK_FREE_RATE / TRADING_DAYS_PER_YEAR;
  const downs = returns.map((r) => Math.min(r - dailyRf, 0));
  let s = 0, n = 0;
  for (const d of downs) { s += d * d; n++; }
  if (n < 2) return NaN;
  const dd = Math.sqrt(s / (n - 1)) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  if (dd < EPSILON) return NaN;
  return (annRet - RISK_FREE_RATE) / dd;
}

/** Drawdown analytics (standard peak-to-trough). */
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
  const ath = Math.max(...closes);
  const cur = (closes[closes.length - 1] - ath) / ath;
  const inDD = ddSeries.filter((d) => d < 0);
  const avgDD = inDD.length ? mean(inDD) : 0;
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

/** Historical VaR (Jorion). VaR / CVaR reported as positive % losses. */
function valueAtRisk(returns: number[]) {
  const sorted = [...returns].sort((a, b) => a - b);
  const var95 = percentileSorted(sorted, 5);
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

// ───────────────── beta SWR cache (per stock, weekly) ─────────────────
async function readBetaMeta(symbol: string): Promise<{ beta: number; correlation: number; r_squared: number; benchmark: string; computed_at: string } | null> {
  const rows = await sbSelect(`risk_compute_meta?stock_symbol=eq.${encodeURIComponent(symbol)}&select=last_beta,last_correlation,last_r_squared,last_benchmark,last_beta_compute_at&limit=1`);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;
  if (r.last_beta == null || r.last_beta_compute_at == null) return null;
  return {
    beta: Number(r.last_beta),
    correlation: Number(r.last_correlation ?? NaN),
    r_squared: Number(r.last_r_squared ?? NaN),
    benchmark: String(r.last_benchmark ?? ""),
    computed_at: String(r.last_beta_compute_at),
  };
}
async function writeBetaMeta(symbol: string, beta: number, corr: number, r2: number, bench: string): Promise<void> {
  await sbUpsert("risk_compute_meta", {
    stock_symbol: symbol,
    last_beta: beta,
    last_correlation: corr,
    last_r_squared: r2,
    last_benchmark: bench,
    last_beta_compute_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, "stock_symbol");
}

// ───────────────── main handler ─────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({})) as {
      symbol?: string;
      benchmark?: string;
      sector?: string;
      force_beta_refresh?: boolean;
    };
    const symbol = body.symbol?.trim();
    if (!symbol) return json({ success: false, error: "SYMBOL_REQUIRED" }, 400);
    const auth = req.headers.get("authorization");
    const log: string[] = [];

    // 1. Stock data
    let stockCandles: Candle[];
    try {
      stockCandles = await fetchStockCandles(symbol, auth);
    } catch (e) {
      return json({ success: false, error: "DATA_FETCH_FAILED", details: String(e) }, 200);
    }
    if (stockCandles.length < MIN_DAYS_REQUIRED) {
      return json({ success: false, error: "INSUFFICIENT_HISTORY", got: stockCandles.length, need: MIN_DAYS_REQUIRED }, 200);
    }
    const stock = stockCandles.slice(-LOOKBACK_DAYS);
    const stockCloses = stock.map((c) => c.close);
    const stockReturns = dailyReturns(stockCloses);

    // 2. Benchmark selection (explicit > auto by sector > NIFTY)
    let benchmarkSymbol = body.benchmark?.trim()?.toUpperCase();
    if (!benchmarkSymbol || !BENCHMARK_MAP[benchmarkSymbol]) {
      const sector = body.sector ?? (await fetchSector(symbol, auth));
      benchmarkSymbol = selectBenchmark(sector);
      log.push(`benchmark_selected:${benchmarkSymbol}(sector=${sector ?? "unknown"})`);
    }

    // 3. Beta SWR — reuse cached beta if <7 days old (skips Dhan fetch entirely)
    let betaVal = NaN, corrVal = NaN, r2Val = NaN, benchUsed: string | null = null;
    let benchFreshness: "swr_cached" | "computed" | "unavailable" = "unavailable";
    if (!body.force_beta_refresh) {
      const meta = await readBetaMeta(symbol);
      if (meta) {
        const ageDays = (Date.now() - new Date(meta.computed_at).getTime()) / 86_400_000;
        if (ageDays < BETA_REFRESH_DAYS && Number.isFinite(meta.beta)) {
          betaVal = meta.beta; corrVal = meta.correlation; r2Val = meta.r_squared;
          benchUsed = meta.benchmark; benchFreshness = "swr_cached";
          log.push(`beta:swr_cached(age=${ageDays.toFixed(1)}d)`);
        }
      }
    }

    // 4. If no fresh beta, resolve benchmark + compute
    if (benchFreshness !== "swr_cached") {
      const bench = await resolveBenchmark(benchmarkSymbol, auth, log);
      if (bench) {
        benchUsed = bench.symbol;
        const aligned = alignByDate(stock, bench.candles);
        if (aligned.a.length >= MIN_DAYS_REQUIRED) {
          const sR = dailyReturns(aligned.a.slice(-TRADING_DAYS_PER_YEAR - 1));
          const bR = dailyReturns(aligned.b.slice(-TRADING_DAYS_PER_YEAR - 1));
          betaVal = beta(sR, bR);
          corrVal = pearson(sR, bR);
          r2Val = Number.isFinite(corrVal) ? corrVal * corrVal : NaN;
          benchFreshness = "computed";
          if (Number.isFinite(betaVal)) {
            await writeBetaMeta(symbol, betaVal, corrVal, r2Val, benchUsed);
          }
        } else {
          log.push(`align_insufficient(${aligned.a.length})`);
        }
      }
    }

    const betaCls: "HIGH" | "NORMAL" | "LOW" | null =
      Number.isFinite(betaVal) ? (betaVal > 1.3 ? "HIGH" : betaVal >= 0.8 ? "NORMAL" : "LOW") : null;
    const marketRisk = benchUsed
      ? {
          benchmark: benchUsed,
          beta: safe(() => betaVal),
          beta_classification: betaCls,
          correlation_with_benchmark: safe(() => corrVal),
          r_squared: safe(() => r2Val),
          freshness: benchFreshness,
        }
      : null;

    // 5. Vol / Sharpe / Sortino / DD / VaR (always daily)
    const annVol = annualizedVol(stockReturns) * 100;
    const dailyVolPct = stdev(stockReturns) * 100;
    const r30 = annualizedVol(stockReturns.slice(-30)) * 100;
    const r90 = annualizedVol(stockReturns.slice(-90)) * 100;
    const trend = volTrend(r30, r90);

    const annRet = Math.pow(1 + mean(stockReturns), TRADING_DAYS_PER_YEAR) - 1;
    const sh = sharpe(annRet, annVol / 100);
    const so = sortino(stockReturns, annRet);
    const dd = drawdownAnalytics(stockCloses);
    const calmar = Number.isFinite(dd.max_drawdown_pct) && Math.abs(dd.max_drawdown_pct) > EPSILON
      ? annRet / (Math.abs(dd.max_drawdown_pct) / 100) : NaN;
    const sharpeRating: "EXCELLENT" | "GOOD" | "AVERAGE" | "POOR" =
      sh > 2 ? "EXCELLENT" : sh >= 1 ? "GOOD" : sh >= 0.5 ? "AVERAGE" : "POOR";

    const var_ = valueAtRisk(stockReturns);
    const last20 = stock.slice(-20);
    const avgVol20 = mean(last20.map((c) => c.volume));
    const avgTurnoverCr = mean(last20.map((c) => c.volume * c.close)) / 1e7;
    const liqClass: "HIGH" | "MEDIUM" | "LOW" =
      avgTurnoverCr > 100 ? "HIGH" : avgTurnoverCr >= 10 ? "MEDIUM" : "LOW";
    const beh = behavior(stockReturns, TRADING_DAYS_PER_YEAR);

    // 6. Signals
    const signals: string[] = [];
    if (annVol > 35) signals.push("high_volatility");
    if (annVol < 15) signals.push("low_volatility");
    if (Number.isFinite(betaVal) && betaVal > 1.5) signals.push("high_beta");
    if (Number.isFinite(betaVal) && betaVal < 0.7) signals.push("low_beta");
    if (Number.isFinite(sh) && sh > 1.5) signals.push("high_sharpe");
    if (Number.isFinite(sh) && sh < 0) signals.push("negative_sharpe");
    const curDDabs = Math.abs(dd.current_drawdown_pct);
    if (curDDabs > 25) signals.push("deep_drawdown");
    if (curDDabs >= 5 && curDDabs <= 25 && r30 < r90) signals.push("recovery_phase");
    if (curDDabs < 5) signals.push("near_ath");
    if (var_.var_95_pct > 3) signals.push("high_var");
    if (liqClass === "LOW") signals.push("low_liquidity");
    if (Number.isFinite(corrVal) && corrVal > 0.85) signals.push("high_correlation");
    if (Number.isFinite(corrVal) && corrVal < 0.4) signals.push("decoupled");
    if (beh.up_day_ratio >= 0.6) signals.push("trending_up");
    if (beh.up_day_ratio <= 0.4) signals.push("trending_down");

    // 7. Score
    const score = Math.round(
      volScore(annVol) +
      sharpeScore(sh) +
      ddScore(Math.abs(dd.max_drawdown_pct)) +
      betaScore(betaVal) +
      liqScore(liqClass)
    );
    const riskScore = Math.max(0, Math.min(100, score));
    const classification: "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK" | "VERY_HIGH_RISK" =
      riskScore >= 75 ? "LOW_RISK" : riskScore >= 55 ? "MEDIUM_RISK" : riskScore >= 35 ? "HIGH_RISK" : "VERY_HIGH_RISK";

    return json({
      success: true,
      symbol,
      benchmark: benchUsed,
      benchmark_requested: benchmarkSymbol,
      benchmark_warning: benchUsed ? null : "BENCHMARK_UNAVAILABLE",
      diagnostics: log,
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
