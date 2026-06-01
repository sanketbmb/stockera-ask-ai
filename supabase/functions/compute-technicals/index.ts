// compute-technicals
// Pure-JS technical indicator engine over FinEdge daily OHLCV.
// First Brain module. Stateless. Returns indicators, signals and a 0-100 score.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ──────────────────────────── helpers ────────────────────────────
const last = <T,>(a: T[]): T => a[a.length - 1];
const nz = (x: number) => (Number.isFinite(x) ? x : 0);

/** Simple Moving Average over `period`. Returns array aligned to input (NaN for warmup). */
function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential Moving Average seeded with SMA of first `period` values. */
function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  out[period - 1] = seed / period;
  for (let i = period; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k);
  return out;
}

/** Wilder's RSI(period). */
function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = 100 - 100 / (1 + (loss === 0 ? Infinity : gain / loss));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = 100 - 100 / (1 + (loss === 0 ? Infinity : gain / loss));
  }
  return out;
}

/** MACD(fast, slow, signal) — returns line/signal/histogram arrays. */
function macd(closes: number[], fast = 12, slow = 26, signalP = 9) {
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const line = closes.map((_, i) => ef[i] - es[i]);
  // signal EMA over the defined section of line
  const startIdx = slow - 1;
  const lineDef = line.slice(startIdx).filter((v) => Number.isFinite(v));
  const sigDef = ema(lineDef, signalP);
  const signal: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < sigDef.length; i++) signal[startIdx + i] = sigDef[i];
  const histogram = line.map((v, i) => v - signal[i]);
  return { line, signal, histogram };
}

/** Stochastic %K (with SMA smoothing) and %D. */
function stochastic(highs: number[], lows: number[], closes: number[], kP = 14, kSmooth = 3, dP = 3) {
  const rawK: number[] = new Array(closes.length).fill(NaN);
  for (let i = kP - 1; i < closes.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kP + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    rawK[i] = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
  }
  const k = sma(rawK.map((v) => (Number.isFinite(v) ? v : 0)), kSmooth)
    .map((v, i) => (i < kP - 1 + kSmooth - 1 ? NaN : v));
  const d = sma(k.map((v) => (Number.isFinite(v) ? v : 0)), dP)
    .map((v, i) => (i < kP - 1 + kSmooth - 1 + dP - 1 ? NaN : v));
  return { k, d };
}

/** Rate of Change over `period` bars (%) */
function roc(closes: number[], period = 12): number[] {
  return closes.map((c, i) => (i < period ? NaN : ((c - closes[i - period]) / closes[i - period]) * 100));
}

/** Bollinger Bands (period, k-sigma). */
function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);
  const bandwidth: number[] = new Array(closes.length).fill(NaN);
  const percentB: number[] = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
    bandwidth[i] = mid[i] === 0 ? 0 : ((upper[i] - lower[i]) / mid[i]) * 100;
    percentB[i] = upper[i] === lower[i] ? 0.5 : (closes[i] - lower[i]) / (upper[i] - lower[i]);
  }
  return { upper, middle: mid, lower, bandwidth, percentB };
}

/** Wilder ATR(period). */
function atr(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const tr: number[] = new Array(closes.length).fill(0);
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) tr[i] = highs[i] - lows[i];
    else tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  const out: number[] = new Array(closes.length).fill(NaN);
  let seed = 0;
  for (let i = 1; i <= period; i++) seed += tr[i];
  out[period] = seed / period;
  for (let i = period + 1; i < closes.length; i++) out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  return out;
}

/** Annualized standard deviation of daily returns (%). */
function annualizedVol(closes: number[], period = 20): number {
  if (closes.length < period + 1) return NaN;
  const rets: number[] = [];
  for (let i = closes.length - period; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}

/** On-Balance Volume cumulative series. */
function obv(closes: number[], volumes: number[]): number[] {
  const out: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) out[i] = out[i - 1] + volumes[i];
    else if (closes[i] < closes[i - 1]) out[i] = out[i - 1] - volumes[i];
    else out[i] = out[i - 1];
  }
  return out;
}

/** Linear regression slope sign over last N points; +1/0/-1. */
function trendSign(arr: number[], n = 20): number {
  const s = arr.slice(-n).filter(Number.isFinite);
  if (s.length < 3) return 0;
  const xMean = (s.length - 1) / 2;
  const yMean = s.reduce((a, b) => a + b, 0) / s.length;
  let num = 0, den = 0;
  for (let i = 0; i < s.length; i++) { num += (i - xMean) * (s[i] - yMean); den += (i - xMean) ** 2; }
  const slope = num / den;
  if (Math.abs(slope) < 1e-9) return 0;
  return slope > 0 ? 1 : -1;
}

/** Wilder ADX/+DI/-DI(period). */
function adx(highs: number[], lows: number[], closes: number[], period = 14) {
  const n = closes.length;
  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = highs[i] - highs[i - 1];
    const dn = lows[i - 1] - lows[i];
    plusDM[i] = up > dn && up > 0 ? up : 0;
    minusDM[i] = dn > up && dn > 0 ? dn : 0;
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  // Wilder smoothing
  const smooth = (arr: number[]): number[] => {
    const r: number[] = new Array(n).fill(NaN);
    let s = 0;
    for (let i = 1; i <= period; i++) s += arr[i];
    r[period] = s;
    for (let i = period + 1; i < n; i++) r[i] = r[i - 1] - r[i - 1] / period + arr[i];
    return r;
  };
  const trS = smooth(tr), pdmS = smooth(plusDM), mdmS = smooth(minusDM);
  const plusDI: number[] = new Array(n).fill(NaN);
  const minusDI: number[] = new Array(n).fill(NaN);
  const dx: number[] = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    plusDI[i] = (pdmS[i] / trS[i]) * 100;
    minusDI[i] = (mdmS[i] / trS[i]) * 100;
    const sum = plusDI[i] + minusDI[i];
    dx[i] = sum === 0 ? 0 : (Math.abs(plusDI[i] - minusDI[i]) / sum) * 100;
  }
  const adxArr: number[] = new Array(n).fill(NaN);
  // First ADX = average of first `period` DX values
  const firstAdxIdx = period * 2;
  if (n > firstAdxIdx) {
    let s = 0;
    for (let i = period + 1; i <= firstAdxIdx; i++) s += dx[i];
    adxArr[firstAdxIdx] = s / period;
    for (let i = firstAdxIdx + 1; i < n; i++) adxArr[i] = (adxArr[i - 1] * (period - 1) + dx[i]) / period;
  }
  return { adx: adxArr, plusDI, minusDI };
}

/** Classic pivot points from previous bar's HLC. */
function pivots(h: number, l: number, c: number) {
  const pp = (h + l + c) / 3;
  const r1 = 2 * pp - l, s1 = 2 * pp - h;
  const r2 = pp + (h - l), s2 = pp - (h - l);
  const r3 = h + 2 * (pp - l), s3 = l - 2 * (h - pp);
  return { pp, r1, r2, r3, s1, s2, s3 };
}

// ────────────────── data fetch ──────────────────
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

// ────────────────── live LTP resolution ──────────────────
// Cache (≤60s) → live Dhan → finedge EOD (lastClose). Returns the chosen
// price plus a source label and an ISO timestamp so the UI can render
// "Dhan live · 14:32 IST" vs "finedge EOD · 31 May".
interface LtpResolution { price: number; source: string; timestamp: string }

async function resolveLtp(symbol: string, eodClose: number, eodDate: string): Promise<LtpResolution> {
  const eodIso = (() => {
    // eodDate is YYYY-MM-DD from finedge; mark it as end-of-session in IST.
    try { return new Date(`${eodDate}T15:30:00+05:30`).toISOString(); }
    catch { return new Date().toISOString(); }
  })();
  const eodFallback: LtpResolution = { price: eodClose, source: "finedge_eod", timestamp: eodIso };

  // 1) Cache lookup (≤60s)
  try {
    const cacheRes = await fetch(
      `${SUPABASE_URL}/rest/v1/ltp_cache?symbol=eq.${encodeURIComponent(symbol)}&select=ltp,fetched_at,source`,
      { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (cacheRes.ok) {
      const rows = await cacheRes.json() as Array<{ ltp: number; fetched_at: string; source: string }>;
      const row = rows?.[0];
      if (row && Number.isFinite(Number(row.ltp))) {
        const ageMs = Date.now() - new Date(row.fetched_at).getTime();
        if (ageMs <= 60_000) {
          return { price: Number(row.ltp), source: `${row.source}_cache`, timestamp: row.fetched_at };
        }
      }
    }
  } catch { /* fall through */ }

  // 2) Live Dhan
  try {
    const masterRes = await fetch(
      `${SUPABASE_URL}/rest/v1/stock_master?symbol=eq.${encodeURIComponent(symbol)}&select=dhan_security_id,segment`,
      { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (masterRes.ok) {
      const masters = await masterRes.json() as Array<{ dhan_security_id: string; segment: string | null }>;
      const m = masters?.[0];
      if (m?.dhan_security_id) {
        const seg = m.segment === "BSE_EQ" ? "BSE_EQ" : "NSE_EQ";
        const dRes = await fetch(`${SUPABASE_URL}/functions/v1/dhan-fetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ endpoint: "ltp", securityId: m.dhan_security_id, exchangeSegment: seg }),
        });
        const dTxt = await dRes.text();
        let dBody: Record<string, unknown> = {};
        try { dBody = dTxt ? JSON.parse(dTxt) : {}; } catch { /* */ }
        if (dRes.ok && dBody.success === true) {
          const data = dBody.data as Record<string, unknown> | undefined;
          const inner = data?.data as Record<string, unknown> | undefined;
          const segNode = inner?.[seg] as Record<string, unknown> | undefined;
          const node = segNode?.[m.dhan_security_id] as Record<string, unknown> | undefined;
          const ltpRaw = node?.last_price ?? node?.ltp ?? node?.lastPrice;
          const ltp = typeof ltpRaw === "number" ? ltpRaw : Number(ltpRaw);
          if (Number.isFinite(ltp) && ltp > 0) {
            return { price: ltp, source: "dhan_live", timestamp: new Date().toISOString() };
          }
        }
      }
    }
  } catch { /* fall through */ }

  // 3) EOD close
  return eodFallback;
}


// ────────────────── main handler ──────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({})) as { symbol?: string; lookback_days?: number };
    const symbol = body.symbol?.trim();
    const lookback = Number.isFinite(body.lookback_days) && (body.lookback_days as number) > 0 ? body.lookback_days! : 365;
    if (!symbol) return json({ success: false, error: "SYMBOL_REQUIRED" }, 400);

    let allCandles: Candle[];
    try { allCandles = await fetchCandles(symbol, req.headers.get("authorization")); }
    catch (e) { return json({ success: false, error: "DATA_FETCH_FAILED", details: String(e) }, 200); }

    // Slice with enough warmup for EMA200 but limit display range to lookback days
    const candles = allCandles.slice(-Math.max(lookback, 250));
    if (candles.length < 200) return json({ success: false, error: "INSUFFICIENT_HISTORY", got: candles.length }, 200);

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const volumes = candles.map((c) => c.volume);
    const lastClose = last(closes);
    const lastIdx = closes.length - 1;

    // Indicators
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const ema200 = ema(closes, 200);
    const sma50 = sma(closes, 50);
    const rsi14 = rsi(closes, 14);
    const m = macd(closes, 12, 26, 9);
    const st = stochastic(highs, lows, closes, 14, 3, 3);
    const roc12 = roc(closes, 12);
    const bb = bollinger(closes, 20, 2);
    const atr14 = atr(highs, lows, closes, 14);
    const volAnn = annualizedVol(closes, 20);
    const volSma20 = sma(volumes, 20);
    const obvSeries = obv(closes, volumes);
    const ad = adx(highs, lows, closes, 14);

    // 52-week (≈252 trading days)
    const w52 = closes.slice(-252);
    const w52High = Math.max(...w52);
    const w52Low = Math.min(...w52);

    // Pivots from previous bar
    const prev = candles[lastIdx - 1];
    const piv = pivots(prev.high, prev.low, prev.close);

    // Trend direction
    const e50L = ema50[lastIdx], e200L = ema200[lastIdx];
    let direction: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (lastClose > e50L && e50L > e200L) direction = "BULLISH";
    else if (lastClose < e50L && e50L < e200L) direction = "BEARISH";

    // ── Signals ──
    const signals: string[] = [];
    const crossWithin = (a: number[], b: number[], bars: number, dir: "up" | "down") => {
      for (let i = lastIdx - bars + 1; i <= lastIdx; i++) {
        if (i <= 0) continue;
        const prevDiff = a[i - 1] - b[i - 1];
        const curDiff = a[i] - b[i];
        if (dir === "up" && prevDiff <= 0 && curDiff > 0) return true;
        if (dir === "down" && prevDiff >= 0 && curDiff < 0) return true;
      }
      return false;
    };
    if (crossWithin(ema50, ema200, 5, "up")) signals.push("golden_cross");
    if (crossWithin(ema50, ema200, 5, "down")) signals.push("death_cross");
    const rsiL = rsi14[lastIdx];
    if (rsiL < 30) signals.push("rsi_oversold");
    if (rsiL > 70) signals.push("rsi_overbought");
    if (crossWithin(m.line, m.signal, 3, "up")) signals.push("macd_bullish_crossover");
    if (crossWithin(m.line, m.signal, 3, "down")) signals.push("macd_bearish_crossover");
    // Bollinger squeeze: last bandwidth equals min over last 126 bars
    const bwWindow = bb.bandwidth.slice(-126).filter(Number.isFinite);
    if (bwWindow.length > 20 && bb.bandwidth[lastIdx] === Math.min(...bwWindow)) signals.push("bollinger_squeeze");
    if (lastClose > bb.upper[lastIdx]) signals.push("bollinger_breakout_up");
    if (lastClose < bb.lower[lastIdx]) signals.push("bollinger_breakout_down");
    if (volumes[lastIdx] > 2 * volSma20[lastIdx]) signals.push("volume_surge");
    if (lastClose >= w52High) signals.push("new_52w_high");
    if (lastClose <= w52Low) signals.push("new_52w_low");
    if (lastClose > ema20[lastIdx] && ema20[lastIdx] > e50L && e50L > e200L) signals.push("above_all_emas");
    if (lastClose < ema20[lastIdx] && ema20[lastIdx] < e50L && e50L < e200L) signals.push("below_all_emas");

    // ── Score 0-100 ──
    // Trend (0-30)
    let trendScore = 15;
    if (direction === "BULLISH") trendScore = 25;
    else if (direction === "BEARISH") trendScore = 5;
    trendScore += trendSign(ema50, 20) * 5;
    trendScore = Math.max(0, Math.min(30, trendScore));

    // Momentum (0-25): RSI mid-band best, MACD histogram sign
    const rsiScore = Math.max(0, 15 - Math.abs(rsiL - 55) * 0.5); // peaks ~55
    const histL = m.histogram[lastIdx];
    const macdScore = histL > 0 ? 10 : histL < 0 ? 2 : 5;
    const momentumScore = Math.max(0, Math.min(25, rsiScore + macdScore));

    // Volatility (0-15): %B near 0.5 best; penalize extreme ATR%
    const pB = bb.percentB[lastIdx];
    const pbScore = Math.max(0, 10 - Math.abs(pB - 0.5) * 12);
    const atrPct = (atr14[lastIdx] / lastClose) * 100;
    const atrScore = atrPct < 1.5 ? 5 : atrPct < 3 ? 3 : 1;
    const volScore = Math.max(0, Math.min(15, pbScore + atrScore));

    // Volume (0-15): ratio & OBV trend
    const volRatio = volumes[lastIdx] / nz(volSma20[lastIdx] || 1);
    const obvTrend = trendSign(obvSeries, 20);
    const ratioScore = Math.min(10, volRatio * 5);
    const obvScore = obvTrend > 0 ? 5 : obvTrend < 0 ? 0 : 3;
    const volumeScore = Math.max(0, Math.min(15, ratioScore + obvScore));

    // Signals (0-15)
    const bullSig = new Set(["golden_cross", "macd_bullish_crossover", "bollinger_breakout_up", "volume_surge", "new_52w_high", "above_all_emas", "rsi_oversold"]);
    const bearSig = new Set(["death_cross", "macd_bearish_crossover", "bollinger_breakout_down", "new_52w_low", "below_all_emas", "rsi_overbought"]);
    let sigNet = 0;
    for (const s of signals) { if (bullSig.has(s)) sigNet += 3; else if (bearSig.has(s)) sigNet -= 3; }
    const signalScore = Math.max(0, Math.min(15, 7 + sigNet));

    const technicalScore = Math.round(trendScore + momentumScore + volScore + volumeScore + signalScore);

    // Data range = visible (lookback) slice
    const visible = candles.slice(-lookback);
    // Resolve LTP: cache (≤60s) → live Dhan → EOD finedge close.
    // Indicator math stays on EOD closes (lastClose); current_price reflects freshest tick.
    const ltp = await resolveLtp(symbol, lastClose, last(visible).date);
    return json({
      success: true,
      symbol,
      current_price: ltp.price,
      ltp_source: ltp.source,
      ltp_timestamp: ltp.timestamp,
      eod_close: lastClose,
      computed_at: new Date().toISOString(),
      data_range: { from: visible[0].date, to: last(visible).date, days: visible.length },
      indicators: {
        trend: {
          ema_20: nz(ema20[lastIdx]),
          ema_50: nz(e50L),
          ema_200: nz(e200L),
          sma_50: nz(sma50[lastIdx]),
          direction,
        },
        momentum: {
          rsi_14: nz(rsiL),
          macd: { line: nz(m.line[lastIdx]), signal: nz(m.signal[lastIdx]), histogram: nz(histL) },
          stochastic: { k: nz(st.k[lastIdx]), d: nz(st.d[lastIdx]) },
          roc_12: nz(roc12[lastIdx]),
        },
        volatility: {
          bollinger: {
            upper: nz(bb.upper[lastIdx]), middle: nz(bb.middle[lastIdx]), lower: nz(bb.lower[lastIdx]),
            bandwidth: nz(bb.bandwidth[lastIdx]), percent_b: nz(bb.percentB[lastIdx]),
          },
          atr_14: nz(atr14[lastIdx]),
          volatility_annual_pct: nz(volAnn),
        },
        volume: {
          sma_20: nz(volSma20[lastIdx]),
          current_ratio: nz(volRatio),
          obv_trend: obvTrend > 0 ? "RISING" : obvTrend < 0 ? "FALLING" : "FLAT",
        },
        strength: {
          adx_14: nz(ad.adx[lastIdx]),
          plus_di: nz(ad.plusDI[lastIdx]),
          minus_di: nz(ad.minusDI[lastIdx]),
        },
        levels: {
          week_52_high: w52High,
          week_52_low: w52Low,
          pct_from_52w_high: ((lastClose - w52High) / w52High) * 100,
          pct_from_52w_low: ((lastClose - w52Low) / w52Low) * 100,
          pivot: piv,
        },
      },
      signals,
      technical_score: technicalScore,
      trend: direction,
    });
  } catch (e) {
    console.error("compute-technicals:", e);
    return json({ success: false, error: "INTERNAL_ERROR", details: String(e) }, 500);
  }
});
