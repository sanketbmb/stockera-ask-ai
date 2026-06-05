// compute-momentum
// Pure-JS momentum engine over FinEdge daily OHLCV with Dhan-sourced benchmark.
// Fourth Brain module. Stateless compute, reuses benchmark_cache from compute-risk.
//
// METRICS:
// - Absolute returns (1w / 1m / 3m / 6m / 12m), simple close-to-close
// - Relative strength vs sector benchmark (1m / 3m / 6m / 12m)
// - SMA50 / SMA200 + % above + golden/death cross status
// - 52-week high/low + % from each
// - Blended momentum score (Jegadeesh-Titman 1993 + George-Hwang 2004 composite)
//
// REUSE: BENCHMARK_MAP, selectBenchmark, IST timestamp pattern, benchmark_cache
// are duplicated from compute-risk (canonical source) — Edge Functions are
// isolated runtimes so we cannot share modules across them. Any change to the
// IST conversion or sector mapping MUST be mirrored in compute-risk/index.ts.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const LOOKBACK_DAYS = 400;                  // need ≥252 + 200 SMA buffer
const TRADING_DAYS_YEAR = 252;
const BENCHMARK_HISTORY_DAYS = 500;
const BENCHMARK_CACHE_TTL_HOURS = 24;
const MIN_FULL_HISTORY = 252;
const MIN_PARTIAL_HISTORY = 21;             // need at least 1 month for any score

// ── Benchmark map — MIRROR of compute-risk BENCHMARK_MAP. SEBI audit trail:
// NIFTYAUTO/NIFTYPHARMA/NIFTY100 corrected 2026-05-29.
const BENCHMARK_MAP: Record<string, { dhan_security_id: string; segment: "IDX_I" }> = {
  NIFTY:       { dhan_security_id: "13", segment: "IDX_I" },
  BANKNIFTY:   { dhan_security_id: "25", segment: "IDX_I" },
  NIFTYIT:     { dhan_security_id: "29", segment: "IDX_I" },
  NIFTYAUTO:   { dhan_security_id: "14", segment: "IDX_I" },
  NIFTYPHARMA: { dhan_security_id: "32", segment: "IDX_I" },
  NIFTYFMCG:   { dhan_security_id: "28", segment: "IDX_I" },
  NIFTY100:    { dhan_security_id: "17", segment: "IDX_I" },
  SENSEX:      { dhan_security_id: "51", segment: "IDX_I" },
};

interface Candle { date: string; close: number }
interface StockCandle extends Candle { open: number; high: number; low: number; volume: number }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
function r2(n: number): number | null { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// Supabase REST
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
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
}

// ── data fetch ──
async function fetchStockCandles(symbol: string, auth: string | null): Promise<StockCandle[]> {
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
  const candles: StockCandle[] = rows.map((r) => {
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
 * IST DATE HANDLING — mirrored from compute-risk/fetchBenchmarkFromDhan.
 * Dhan timestamps are midnight-IST as Unix seconds; shift +19800s (5h30m)
 * BEFORE slicing to ISO date so keys match FinEdge quote_date (also IST).
 * DO NOT REGRESS — this fix shipped 2026-05-29.
 */
async function fetchBenchmarkFromDhan(symbol: string, auth: string | null): Promise<Candle[]> {
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
  const wrap = body.data as Record<string, unknown> | undefined;
  const inner = (wrap?.data ?? wrap) as Record<string, unknown> | undefined;
  const closes = inner?.close as number[] | undefined;
  const ts = inner?.timestamp as number[] | undefined;
  if (!Array.isArray(closes) || !Array.isArray(ts) || closes.length !== ts.length) {
    throw new Error("dhan: malformed historical payload");
  }
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = Number(closes[i]);
    if (!Number.isFinite(close) || close <= 0) continue;
    // IST shift — see compute-risk/index.ts canonical reference
    const date = new Date((ts[i] + 19800) * 1000).toISOString().slice(0, 10);
    out.push({ date, close });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function readBenchmarkCache(symbol: string): Promise<Candle[] | null> {
  const rows = await sbSelect(`benchmark_cache?benchmark_symbol=eq.${encodeURIComponent(symbol)}&select=daily_candles,last_updated_at&limit=1`);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0] as { daily_candles: Candle[]; last_updated_at: string };
  return r.daily_candles;
}
async function cacheIsFresh(symbol: string): Promise<boolean> {
  const rows = await sbSelect(`benchmark_cache?benchmark_symbol=eq.${encodeURIComponent(symbol)}&select=last_updated_at&limit=1`);
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const ts = new Date((rows[0] as { last_updated_at: string }).last_updated_at).getTime();
  return (Date.now() - ts) / 3_600_000 < BENCHMARK_CACHE_TTL_HOURS;
}
async function writeBenchmarkCache(symbol: string, candles: Candle[]): Promise<void> {
  await sbUpsert("benchmark_cache", {
    benchmark_symbol: symbol,
    daily_candles: candles,
    candle_count: candles.length,
    last_updated_at: new Date().toISOString(),
  }, "benchmark_symbol");
}
async function resolveBenchmark(preferred: string, auth: string | null, log: string[]): Promise<Candle[] | null> {
  if (await cacheIsFresh(preferred)) {
    const c = await readBenchmarkCache(preferred);
    if (c && c.length >= MIN_FULL_HISTORY) { log.push(`bench:${preferred}:cache_hit`); return c; }
  }
  try {
    const c = await fetchBenchmarkFromDhan(preferred, auth);
    if (c.length >= MIN_FULL_HISTORY) {
      await writeBenchmarkCache(preferred, c);
      log.push(`bench:${preferred}:dhan_ok(${c.length})`);
      return c;
    }
  } catch (e) {
    log.push(`bench:${preferred}:err(${String(e).slice(0, 80)})`);
  }
  const stale = await readBenchmarkCache(preferred);
  if (stale && stale.length >= MIN_FULL_HISTORY) { log.push(`bench:${preferred}:stale`); return stale; }
  return null;
}

/** Sector → benchmark. MIRROR of compute-risk/selectBenchmark. */
function selectBenchmark(sector: string | null | undefined): string {
  const s = (sector ?? "").toLowerCase();
  if (s.includes("bank")) return "BANKNIFTY";
  if (s.includes("information technology") || s.includes("software") || s.includes(" it ") || s === "it") return "NIFTYIT";
  if (s.includes("auto")) return "NIFTYAUTO";
  if (s.includes("pharm")) return "NIFTYPHARMA";
  if (s.includes("fmcg") || s.includes("consumer")) return "NIFTYFMCG";
  return "NIFTY";
}
async function fetchSector(symbol: string, auth: string | null): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/finedge-fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: auth ?? `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ endpoint: "company-profile", symbol }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (body.success !== true) return null;
    const data = body.data as Record<string, unknown> | undefined;
    const inner = (data?.data ?? data) as Record<string, unknown> | undefined;
    const sector = inner?.sector ?? inner?.industry ?? inner?.Sector ?? null;
    return sector ? String(sector) : null;
  } catch { return null; }
}

// ── metric helpers ──
/** Simple return over `n` trading days back from end of `closes`. % units. */
function returnOverDays(closes: number[], n: number): number {
  if (closes.length < n + 1) return NaN;
  const cur = closes[closes.length - 1];
  const past = closes[closes.length - 1 - n];
  if (!(past > 0)) return NaN;
  return ((cur - past) / past) * 100;
}
function sma(closes: number[], n: number): number {
  if (closes.length < n) return NaN;
  let s = 0;
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i];
  return s / n;
}
/** Cross status: GOLDEN if sma50 currently > sma200 AND was ≤ at some point in last `lookbackDays`. */
function crossStatus(closes: number[], lookbackDays = 30): "GOLDEN_CROSS" | "DEATH_CROSS" | "NONE" {
  if (closes.length < 200 + lookbackDays + 1) return "NONE";
  const today50 = sma(closes, 50);
  const today200 = sma(closes, 200);
  if (!Number.isFinite(today50) || !Number.isFinite(today200)) return "NONE";
  // Iterate last `lookbackDays` worth of historical SMAs
  let sawSma50LeSma200 = false, sawSma50GtSma200 = false;
  for (let back = lookbackDays; back >= 1; back--) {
    const endIdx = closes.length - back; // inclusive end index of the past window
    const win = closes.slice(0, endIdx + 1);
    const a = sma(win, 50), b = sma(win, 200);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a <= b) sawSma50LeSma200 = true;
    if (a > b) sawSma50GtSma200 = true;
  }
  if (today50 > today200 && sawSma50LeSma200) return "GOLDEN_CROSS";
  if (today50 < today200 && sawSma50GtSma200) return "DEATH_CROSS";
  return "NONE";
}
function normalize(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  const clamped = Math.min(max, Math.max(min, v));
  return ((clamped - min) / (max - min)) * 100;
}

// ── main ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({})) as { symbol?: string; benchmark?: string; sector?: string };
    const symbol = body.symbol?.trim();
    if (!symbol) return json({ success: false, error: "SYMBOL_REQUIRED" }, 400);
    const auth = req.headers.get("authorization");
    const log: string[] = [];
    const warnings: string[] = [];

    // 1. Stock data
    let stockCandles: StockCandle[];
    try { stockCandles = await fetchStockCandles(symbol, auth); }
    catch (e) { return json({ success: false, error: "DATA_FETCH_FAILED", details: String(e) }, 200); }
    if (stockCandles.length < MIN_PARTIAL_HISTORY) {
      return json({ success: false, error: "INSUFFICIENT_HISTORY", got: stockCandles.length, need: MIN_PARTIAL_HISTORY }, 200);
    }
    const stock = stockCandles.slice(-LOOKBACK_DAYS);
    const stockCloses = stock.map((c) => c.close);
    const stockVolumes = stock.map((c) => c.volume);
    const close = stockCloses[stockCloses.length - 1];
    const asOf = stock[stock.length - 1].date;
    const tradingDays = stock.length;

    if (tradingDays < MIN_FULL_HISTORY) warnings.push("INSUFFICIENT_HISTORY_FOR_12M");

    // 2. Absolute returns
    const ret1w  = returnOverDays(stockCloses, 5);
    const ret1m  = returnOverDays(stockCloses, 21);
    const ret3m  = returnOverDays(stockCloses, 63);
    const ret6m  = returnOverDays(stockCloses, 126);
    const ret12m = returnOverDays(stockCloses, 252);

    // 3. Benchmark + relative strength
    let benchmarkSymbol = body.benchmark?.trim()?.toUpperCase();
    if (!benchmarkSymbol || !BENCHMARK_MAP[benchmarkSymbol]) {
      const sector = body.sector ?? (await fetchSector(symbol, auth));
      benchmarkSymbol = selectBenchmark(sector);
      log.push(`benchmark_selected:${benchmarkSymbol}(sector=${sector ?? "unknown"})`);
    }
    let benchUsed: string | null = null;
    let relStrength: Record<string, number | null> = { "1m": null, "3m": null, "6m": null, "12m": null };
    let benchmarkWarning: string | null = null;

    const benchCandles = await resolveBenchmark(benchmarkSymbol, auth, log);
    if (benchCandles && benchCandles.length >= MIN_PARTIAL_HISTORY) {
      benchUsed = benchmarkSymbol;
      // Align benchmark closes to stock dates (intersection) before computing windowed returns
      const bMap = new Map(benchCandles.map((c) => [c.date, c.close]));
      const alignedBench: number[] = [];
      const alignedStock: number[] = [];
      for (const c of stock) {
        const bc = bMap.get(c.date);
        if (bc !== undefined) { alignedStock.push(c.close); alignedBench.push(bc); }
      }
      const rsFor = (n: number): number | null => {
        const s = returnOverDays(alignedStock, n);
        const b = returnOverDays(alignedBench, n);
        if (!Number.isFinite(s) || !Number.isFinite(b)) return null;
        return r2(s - b);
      };
      relStrength = { "1m": rsFor(21), "3m": rsFor(63), "6m": rsFor(126), "12m": rsFor(252) };
    } else {
      benchmarkWarning = "UNAVAILABLE";
      log.push(`bench:${benchmarkSymbol}:unavailable`);
    }

    // 4. Moving averages
    const sma50 = sma(stockCloses, 50);
    const sma200 = sma(stockCloses, 200);
    const pctAboveSma50  = Number.isFinite(sma50)  ? ((close - sma50)  / sma50)  * 100 : NaN;
    const pctAboveSma200 = Number.isFinite(sma200) ? ((close - sma200) / sma200) * 100 : NaN;
    const cross = crossStatus(stockCloses, 30);

    // 5. 52-week high/low
    const window252 = stockCloses.slice(-Math.min(TRADING_DAYS_YEAR, stockCloses.length));
    const high52 = Math.max(...window252);
    const low52  = Math.min(...window252);
    const pctFromHigh = ((close - high52) / high52) * 100;
    const pctFromLow  = ((close - low52)  / low52)  * 100;

    // 6. Blended momentum score
    // Weights per source: Jegadeesh-Titman 1993 (3-12m returns) + George-Hwang 2004 (52w high proximity)
    const components: Array<{ w: number; v: number }> = [
      { w: 0.30, v: normalize(ret3m,            -20,  30) },
      { w: 0.25, v: normalize(ret6m,            -30,  50) },
      { w: 0.20, v: normalize(ret12m,           -40,  80) },
      { w: 0.15, v: normalize(pctAboveSma50,    -15,  20) },
      { w: 0.10, v: normalize(pctFromHigh,      -40,   0) },
    ];
    // Reweight if some inputs are NaN (graceful degradation for short history)
    const valid = components.filter((c, idx) => {
      const srcs = [ret3m, ret6m, ret12m, pctAboveSma50, pctFromHigh];
      return Number.isFinite(srcs[idx]);
    });
    let score: number;
    if (valid.length === 0) {
      // Last-resort fallback: use 1m return if even 3m is missing
      score = normalize(ret1m, -15, 20);
    } else {
      const totalW = valid.reduce((s, c) => s + c.w, 0);
      score = valid.reduce((s, c) => s + (c.w / totalW) * c.v, 0);
    }
    score = Math.round(Math.max(0, Math.min(100, score)));

    const classification: "STRONG_UP" | "UP" | "NEUTRAL" | "DOWN" | "STRONG_DOWN" =
      score >= 75 ? "STRONG_UP" :
      score >= 60 ? "UP" :
      score >= 40 ? "NEUTRAL" :
      score >= 25 ? "DOWN" : "STRONG_DOWN";

    // Volume signal — derived from last bar's volume vs 20-day SMA.
    // Mission 6.4 Move 3b: prior orchestrator consumer reads `volume_signal.label`
    // (generate-stock-analysis/index.ts:511) and falls back to "NEUTRAL" when
    // absent. This was always-NEUTRAL until now. Additive; not consumed by
    // scoring path today, so no overall_score impact.
    let volumeSignal: { label: "POSITIVE" | "NEUTRAL" | "NEGATIVE"; method: string; ratio: number | null; reason: string | null };
    if (stockVolumes.length < 21) {
      volumeSignal = { label: "NEUTRAL", method: "volume_ratio_20d_v1", ratio: null, reason: "insufficient_history" };
    } else {
      const volSma20 = sma(stockVolumes, 20);
      const lastVol = stockVolumes[stockVolumes.length - 1];
      if (!(volSma20 > 0) || !Number.isFinite(lastVol)) {
        volumeSignal = { label: "NEUTRAL", method: "volume_ratio_20d_v1", ratio: null, reason: "no_volume" };
      } else {
        const ratio = lastVol / volSma20;
        const label: "POSITIVE" | "NEUTRAL" | "NEGATIVE" =
          ratio >= 1.5 ? "POSITIVE" : ratio <= 0.7 ? "NEGATIVE" : "NEUTRAL";
        volumeSignal = { label, method: "volume_ratio_20d_v1", ratio: Math.round(ratio * 100) / 100, reason: null };
      }
    }

    return json({
      success: true,
      symbol,
      volume_signal: volumeSignal,
      as_of_date: asOf,
      returns: {
        "1w":  r2(ret1w),
        "1m":  r2(ret1m),
        "3m":  r2(ret3m),
        "6m":  r2(ret6m),
        "12m": r2(ret12m),
      },
      relative_strength: relStrength,
      moving_averages: {
        sma_50:  r2(sma50),
        sma_200: r2(sma200),
        pct_above_sma_50:  r2(pctAboveSma50),
        pct_above_sma_200: r2(pctAboveSma200),
        cross_status: cross,
      },
      high_low_52w: {
        high_52w: r2(high52),
        low_52w:  r2(low52),
        pct_from_52w_high: r2(pctFromHigh),
        pct_from_52w_low:  r2(pctFromLow),
      },
      momentum_score: score,
      classification,
      data_quality: {
        trading_days_available: tradingDays,
        min_required: MIN_FULL_HISTORY,
        benchmark_used: benchUsed,
        benchmark_warning: benchmarkWarning,
        freshness: "computed",
        warnings,
      },
      metadata: {
        computed_at: new Date().toISOString(),
        source: "Jegadeesh-Titman 1993 + George-Hwang 2004 composite",
        formula_version: "1.0",
      },
      diagnostics: log,
    });
  } catch (e) {
    console.error("compute-momentum:", e);
    return json({ success: false, error: "INTERNAL_ERROR", details: String(e) }, 500);
  }
});
