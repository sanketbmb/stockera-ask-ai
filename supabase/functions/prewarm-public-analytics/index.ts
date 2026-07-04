// prewarm-public-analytics — nightly job that pre-warms
// stock_analytics_cache for the top ~200 most-relevant Indian equities:
//   • top 20 by 30-day query volume (from public.queries)
//   • Nifty 50 constituents
//   • Nifty Next 50 constituents
// dedup + cap at 200. Sequential invocations with 300ms sleep to avoid
// overwhelming generate-stock-analysis / downstream providers.
// Logs summary to cron_run_log (function_name='prewarm-public-analytics').

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-client-info",
};
const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SB_SERVICE_ROLE_KEY")!;

const FORMULA_VERSION = "v1.0";
const WEIGHTING_PROFILE_ID = "long-term-default";
const ACTION_BUCKET_VERSION = "v1";
const HORIZON = "long-term";
const MAX_SYMBOLS = 200;
const SLEEP_MS = 300;

// Nifty 50 + Nifty Next 50 (~100 symbols). Stable seed universe. Additional
// top-queried symbols merge in ahead of these.
const NIFTY_50 = [
  "RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS","HINDUNILVR","ITC","LT",
  "SBIN","BHARTIARTL","KOTAKBANK","AXISBANK","BAJFINANCE","ASIANPAINT","MARUTI",
  "HCLTECH","SUNPHARMA","ULTRACEMCO","WIPRO","NTPC","TITAN","POWERGRID","ONGC",
  "TATASTEEL","M&M","NESTLEIND","TATAMOTORS","JSWSTEEL","ADANIENT","ADANIPORTS",
  "COALINDIA","HDFCLIFE","SBILIFE","BAJAJFINSV","GRASIM","INDUSINDBK","DRREDDY",
  "TECHM","CIPLA","BRITANNIA","EICHERMOT","BPCL","HINDALCO","DIVISLAB","APOLLOHOSP",
  "HEROMOTOCO","BAJAJ-AUTO","UPL","TATACONSUM","LTIM",
];
const NIFTY_NEXT_50 = [
  "ADANIGREEN","ADANIPOWER","AMBUJACEM","BANKBARODA","BEL","BERGEPAINT","BOSCHLTD",
  "CANBK","CGPOWER","CHOLAFIN","COLPAL","DABUR","DLF","DMART","GAIL","GODREJCP",
  "HAVELLS","ICICIGI","ICICIPRULI","INDIGO","IOC","IRCTC","JINDALSTEL","LICI",
  "MARICO","MOTHERSON","NAUKRI","PIDILITIND","PIIND","PNB","RECLTD","SBICARD",
  "SHREECEM","SIEMENS","SRF","TORNTPHARM","TRENT","TVSMOTOR","VBL","VEDL",
  "ZOMATO","ZYDUSLIFE","IRFC","PFC","HAL","BAJAJHLDNG","IOB","JSWENERGY",
  "LODHA","POLYCAB",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function istDate(): string {
  const ist = new Date(Date.now() + (5 * 60 + 30) * 60_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}

async function topQueriedSymbols(limit = 20): Promise<string[]> {
  try {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const url = `${SUPABASE_URL}/rest/v1/queries?created_at=gte.${since}&select=stock_symbol&limit=5000`;
    const res = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) return [];
    const rows = await res.json() as Array<{ stock_symbol: string | null }>;
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!r.stock_symbol) continue;
      const s = r.stock_symbol.trim().toUpperCase();
      if (!s) continue;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([s]) => s);
  } catch (e) {
    console.warn("topQueriedSymbols failed", e);
    return [];
  }
}

async function alreadyCachedToday(symbols: string[]): Promise<Set<string>> {
  const cacheDate = istDate();
  const filter = `in.(${symbols.map((s) => `"${s}"`).join(",")})`;
  const url = `${SUPABASE_URL}/rest/v1/stock_analytics_cache` +
    `?symbol=${encodeURIComponent(filter)}` +
    `&cache_date=eq.${cacheDate}` +
    `&horizon=eq.${HORIZON}` +
    `&select=symbol`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) return new Set();
  const rows = await res.json() as Array<{ symbol: string }>;
  return new Set(rows.map((r) => r.symbol));
}

async function computeOne(symbol: string, exchange = "NSE"): Promise<{ ok: boolean; ms: number; err?: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-stock-analysis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ symbol, exchange, query_type: "long-term", include_news: true }),
    });
    const ms = Date.now() - t0;
    if (!res.ok) return { ok: false, ms, err: `HTTP ${res.status}` };
    const payload = await res.json();
    if (payload?.success !== true) return { ok: false, ms, err: String(payload?.error ?? "unknown") };
    // Write cache
    const row = {
      symbol, exchange, horizon: HORIZON, cache_date: istDate(),
      payload, payload_version: 1,
      formula_version: FORMULA_VERSION,
      weighting_profile_id: WEIGHTING_PROFILE_ID,
      action_bucket_version: ACTION_BUCKET_VERSION,
      origin: "prewarm", compute_duration_ms: ms,
      provider_failures: [],
      computed_at: new Date().toISOString(),
    };
    const w = await fetch(`${SUPABASE_URL}/rest/v1/stock_analytics_cache?on_conflict=symbol,exchange,horizon,cache_date`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!w.ok) return { ok: false, ms, err: `cache-write ${w.status}` };
    return { ok: true, ms };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: String(e) };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const started = Date.now();
  const startedIso = new Date().toISOString();
  try {
    const body = await req.json().catch(() => ({}));
    const skipExisting = body?.skip_existing !== false;
    const customLimit = typeof body?.limit === "number" ? Math.min(body.limit, MAX_SYMBOLS) : MAX_SYMBOLS;

    // Assemble target set: top queried → Nifty 50 → Next 50.
    const top = await topQueriedSymbols(20);
    const seen = new Set<string>();
    const target: string[] = [];
    for (const s of [...top, ...NIFTY_50, ...NIFTY_NEXT_50]) {
      const u = s.trim().toUpperCase();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      target.push(u);
      if (target.length >= customLimit) break;
    }

    // Skip already-cached symbols.
    let toRun = target;
    let skipped = 0;
    if (skipExisting && target.length) {
      const done = await alreadyCachedToday(target);
      toRun = target.filter((s) => !done.has(s));
      skipped = target.length - toRun.length;
    }

    let ok = 0, fail = 0;
    const failures: Array<{ symbol: string; err: string }> = [];
    for (const sym of toRun) {
      const r = await computeOne(sym);
      if (r.ok) ok++; else { fail++; failures.push({ symbol: sym, err: r.err ?? "unknown" }); }
      await sleep(SLEEP_MS);
    }

    const finished = new Date().toISOString();
    const durationMs = Date.now() - started;
    const status = fail === 0 ? "ok" : (ok === 0 ? "error" : "partial");
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/cron_run_log`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json", Prefer: "return=minimal",
        },
        body: JSON.stringify({
          function_name: "prewarm-public-analytics",
          status, started_at: startedIso, finished_at: finished,
          error_message: fail > 0 ? failures.slice(0, 3).map((f) => `${f.symbol}:${f.err}`).join("; ") : null,
          metrics: {
            status, processed: ok, errors_count: fail,
            details: { target_total: target.length, skipped_existing: skipped, ran: toRun.length, failures: failures.slice(0, 10) },
            duration_ms: durationMs, ran_at: finished,
          },
        }),
      });
    } catch { /* swallow */ }

    return json({
      success: true, status, target_total: target.length, skipped_existing: skipped,
      ran: toRun.length, ok, fail, duration_ms: durationMs, failures: failures.slice(0, 10),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("prewarm-public-analytics fatal", msg);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/cron_run_log`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json", Prefer: "return=minimal",
        },
        body: JSON.stringify({
          function_name: "prewarm-public-analytics", status: "error",
          started_at: startedIso, finished_at: new Date().toISOString(),
          error_message: msg,
          metrics: { status: "error", errors_count: 1, error_message: msg },
        }),
      });
    } catch { /* swallow */ }
    return json({ success: false, error: msg }, 500);
  }
});
