// stock-overview — public aggregator for /stock/$symbol page.
// Fans out to Twelve Data (via twelvedata-fetch), get-price-data (Dhan/FinEdge),
// marketaux-fetch (news), and Supabase (stock_master + ai_reports + library_items).
// Any leg failure returns null in its slot; the response still shapes.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-client-info",
};
const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=60",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SB_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function invokeFn(name: string, body: unknown, timeoutMs = 12_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    if (!res.ok) throw new Error(`${name} ${res.status}: ${text.slice(0, 200)}`);
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function pgFetch(path: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`pgFetch ${path} ${res.status}`);
  return res.json();
}

// Verdict bucketing (verified against library_items live data):
// WAIT/HOLD/EXIT/BUY/AVERAGE/PARTIAL_EXIT known; NULL excluded; unknown -> other + log.
function bucketVerdict(raw: string | null | undefined): "buy" | "watchlist" | "hold" | "avoid" | "other" | null {
  if (raw == null) return null;
  const v = String(raw).trim().toUpperCase();
  switch (v) {
    case "BUY": return "buy";
    case "WATCHLIST": return "watchlist";
    case "HOLD": return "hold";
    case "WAIT": return "hold";
    case "AVOID":
    case "SELL":
    case "EXIT":
    case "PARTIAL_EXIT": return "avoid";
    case "AVERAGE": return "other";
    default:
      console.warn(`stock-overview: unknown verdict value bucketed as 'other': ${v}`);
      return "other";
  }
}

interface StockMasterRow {
  symbol: string;
  company_name: string | null;
  dhan_security_id: string | null;
  segment: string | null;
  exchange: string | null;
  isin: string | null;
  sector: string | null;
  industry: string | null;
  market_cap_rs: number | null;
  cap_band: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const rawSym = (body?.symbol ?? "").toString().trim().toUpperCase();
    const rawExch = (body?.exchange ?? "NSE").toString().trim().toUpperCase();
    if (!rawSym) return json({ success: false, error: "symbol required" }, 400);

    // Step 1: stock_master lookup (Indian universe, deterministic).
    let master: StockMasterRow | null = null;
    try {
      const rows = (await pgFetch(
        `stock_master?symbol=eq.${encodeURIComponent(rawSym)}&exchange=eq.${encodeURIComponent(rawExch)}&select=symbol,company_name,dhan_security_id,segment,exchange,isin,sector,industry,market_cap_rs,cap_band&limit=1`,
      )) as StockMasterRow[];
      if (rows.length > 0) master = rows[0];
      if (!master) {
        const fallback = (await pgFetch(
          `stock_master?symbol=eq.${encodeURIComponent(rawSym)}&select=symbol,company_name,dhan_security_id,segment,exchange,isin,sector,industry,market_cap_rs,cap_band&limit=1`,
        )) as StockMasterRow[];
        if (fallback.length > 0) master = fallback[0];
      }
    } catch (e) {
      console.error("stock_master lookup failed", e);
    }

    const symbol = master?.symbol ?? rawSym;
    const exchange = master?.exchange ?? rawExch;
    const tdSymbol = `${symbol}:${exchange}`; // Twelve Data expects TICKER:EXCHANGE

    // Step 2: fan out in parallel.
    const legs = await Promise.allSettled([
      invokeFn("twelvedata-fetch", { endpoint: "profile", params: { symbol: tdSymbol } }),
      invokeFn("twelvedata-fetch", { endpoint: "statistics", params: { symbol: tdSymbol } }),
      invokeFn("twelvedata-fetch", { endpoint: "logo", params: { symbol: tdSymbol } }),
      invokeFn("twelvedata-fetch", { endpoint: "dividends", params: { symbol: tdSymbol, range: "5y" } }),
      invokeFn("twelvedata-fetch", { endpoint: "splits", params: { symbol: tdSymbol, range: "5y" } }),
      invokeFn("twelvedata-fetch", { endpoint: "earnings", params: { symbol: tdSymbol, outputsize: 1 } }),
      invokeFn("get-price-data", {
        symbol,
        securityId: master?.dhan_security_id ?? undefined,
        exchangeSegment: exchange === "BSE" ? "BSE_EQ" : "NSE_EQ",
        mode: "live",
      }),
      invokeFn("get-price-data", {
        symbol,
        securityId: master?.dhan_security_id ?? undefined,
        exchangeSegment: exchange === "BSE" ? "BSE_EQ" : "NSE_EQ",
        mode: "historical",
        fromDate: new Date(Date.now() - 40 * 86400_000).toISOString().slice(0, 10),
        toDate: new Date().toISOString().slice(0, 10),
      }),
      invokeFn("marketaux-fetch", {
        endpoint: "news/all",
        symbols: exchange === "BSE" ? `${symbol}.BO` : `${symbol}.NS`,
        params: { limit: 8, language: "en" },
      }),
      pgFetch(`ai_reports?stock_symbol=eq.${encodeURIComponent(symbol)}&select=id`),
      pgFetch(
        `library_items?symbol=eq.${encodeURIComponent(symbol)}&kind=eq.report&is_tombstoned=eq.false&select=verdict,published_at`,
      ),
      // Stage 4A.2 — pre-warmed analytics cache (today, long-term horizon).
      (async () => {
        const ist = new Date(Date.now() + (5 * 60 + 30) * 60_000);
        const cacheDate = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
        return pgFetch(
          `stock_analytics_cache?symbol=eq.${encodeURIComponent(symbol)}` +
          `&exchange=eq.${encodeURIComponent(exchange)}` +
          `&horizon=eq.long-term&cache_date=eq.${cacheDate}` +
          `&select=payload,computed_at,formula_version,weighting_profile_id,action_bucket_version,origin&limit=1`,
        );
      })(),
    ]);

    const val = <T,>(i: number): T | null =>
      legs[i].status === "fulfilled" ? ((legs[i] as PromiseFulfilledResult<T>).value as T) : null;

    const rawProfile = val<{ success?: boolean; data?: Record<string, unknown> }>(0);
    const rawStats   = val<{ success?: boolean; data?: Record<string, unknown> }>(1);
    const rawLogo    = val<{ success?: boolean; data?: { url?: string } }>(2);
    const rawDiv     = val<{ success?: boolean; data?: unknown }>(3);
    const rawSplits  = val<{ success?: boolean; data?: unknown }>(4);
    const rawEarn    = val<{ success?: boolean; data?: unknown }>(5);
    const rawLive    = val<Record<string, unknown>>(6);
    const rawHist    = val<{ candles?: Array<{ date: string; close: number }> }>(7);
    const rawNews    = val<{ success?: boolean; data?: { data?: Array<Record<string, unknown>> } }>(8);
    const rawReports = val<Array<{ id: string }>>(9);
    const rawVerdict = val<Array<{ verdict: string | null; published_at: string | null }>>(10);
    const rawAnalyticsRows = val<Array<Record<string, unknown>>>(11);

    // Shape analytics for public /stock/$symbol page. Strips report-only fields.
    let analytics: Record<string, unknown> | null = null;
    let analytics_provenance: Record<string, unknown> | null = null;
    if (Array.isArray(rawAnalyticsRows) && rawAnalyticsRows.length > 0) {
      const row = rawAnalyticsRows[0];
      const payload = row.payload as Record<string, unknown> | undefined;
      if (payload && typeof payload === "object") {
        const fv = payload.final_verdict as Record<string, unknown> | undefined;
        analytics = {
          as_of_date: payload.as_of_date ?? null,
          stock: payload.stock ?? null,
          final_verdict: fv ? { action: fv.action ?? null, overall_score: fv.overall_score ?? null } : null,
          score_breakdown: payload.score_breakdown ?? null,
          returns_snapshot: payload.returns_snapshot ?? null,
          fundamental_snapshot: payload.fundamental_snapshot ?? null,
          risk_snapshot: payload.risk_snapshot ?? null,
          sentiment_snapshot: payload.sentiment_snapshot ?? null,
          long_term_quality_snapshot: payload.long_term_quality_snapshot ?? null,
          audit_meta: payload.audit_meta
            ? { formula_version: (payload.audit_meta as Record<string, unknown>).formula_version ?? null,
                tier_weights: (payload.audit_meta as Record<string, unknown>).tier_weights ?? null }
            : null,
          flags: payload.flags ?? null,
        };
        analytics_provenance = {
          computed_at: row.computed_at ?? null,
          formula_version: row.formula_version ?? null,
          weighting_profile_id: row.weighting_profile_id ?? null,
          action_bucket_version: row.action_bucket_version ?? null,
          origin: row.origin ?? null,
        };
      }
    }

    const profile   = rawProfile?.success ? rawProfile.data ?? null : null;
    const statistics = rawStats?.success ? rawStats.data ?? null : null;
    const logo_url  = rawLogo?.success ? (rawLogo.data?.url ?? null) : null;
    const dividends = rawDiv?.success ? rawDiv.data ?? null : null;
    const splits    = rawSplits?.success ? rawSplits.data ?? null : null;
    const earnings  = rawEarn?.success ? rawEarn.data ?? null : null;

    // Price shape
    let price: {
      value: number | null;
      source: string | null;
      as_of: string | null;
      change: number | null;
      change_pct: number | null;
    } | null = null;
    if (rawLive && typeof rawLive === "object") {
      const p = rawLive as { ltp?: number; last_price?: number; close?: number; source?: string; as_of?: string; timestamp?: string; change?: number; change_pct?: number };
      const value = p.ltp ?? p.last_price ?? p.close ?? null;
      if (value != null) {
        price = {
          value,
          source: p.source ?? null,
          as_of: p.as_of ?? p.timestamp ?? null,
          change: p.change ?? null,
          change_pct: p.change_pct ?? null,
        };
      }
    }

    // 30d candles for mini chart
    const candles_30d = Array.isArray(rawHist?.candles)
      ? rawHist!.candles.slice(-30).map((c) => ({ date: c.date, close: c.close }))
      : null;

    // News — with company_name fallback when suffixed symbol yields 0 items
    type NewsItem = { title: string | null; source: string | null; published_at: string | null; url: string | null; snippet: string | null };
    const mapNews = (arr: Array<Record<string, unknown>>): NewsItem[] =>
      arr.map((n) => ({
        title: (n.title as string | undefined) ?? null,
        source: (n.source as string | undefined) ?? null,
        published_at: (n.published_at as string | undefined) ?? null,
        url: (n.url as string | undefined) ?? null,
        snippet: (n.snippet as string | undefined) ?? (n.description as string | undefined) ?? null,
      }));
    let news: NewsItem[] | null = null;
    const primaryNews = rawNews?.success && Array.isArray(rawNews.data?.data) ? mapNews(rawNews.data.data) : [];
    if (primaryNews.length > 0) {
      news = primaryNews.slice(0, 8);
    } else if (master?.company_name) {
      try {
        const fb = await invokeFn("marketaux-fetch", {
          endpoint: "news/all",
          params: { search: master.company_name, limit: 8, language: "en" },
        }) as { success?: boolean; data?: { data?: Array<Record<string, unknown>> } } | null;
        const fbArr = fb?.success && Array.isArray(fb.data?.data) ? mapNews(fb.data!.data!) : [];
        const seen = new Set<string>();
        const merged = [...primaryNews, ...fbArr].filter((n) => {
          const k = n.url ?? `${n.title}|${n.published_at}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        news = merged.length > 0 ? merged.slice(0, 8) : null;
      } catch (e) {
        console.warn("marketaux company_name fallback failed", e);
        news = null;
      }
    }

    // AI report stats
    const total_reports_on_stock = Array.isArray(rawReports) ? rawReports.length : 0;
    const bucket_counts: Record<string, number> = { buy: 0, watchlist: 0, hold: 0, avoid: 0, other: 0 };
    let most_recent_report_date: string | null = null;
    if (Array.isArray(rawVerdict)) {
      for (const r of rawVerdict) {
        const b = bucketVerdict(r.verdict);
        if (b) bucket_counts[b] += 1;
        if (r.published_at && (!most_recent_report_date || r.published_at > most_recent_report_date)) {
          most_recent_report_date = r.published_at;
        }
      }
    }

    // Partial-data indicator
    const provider_failures = legs
      .map((l, i) => (l.status === "rejected" ? i : -1))
      .filter((i) => i >= 0);

    return json({
      success: true,
      symbol,
      exchange,
      name: master?.company_name ?? (profile as { name?: string } | null)?.name ?? symbol,
      isin: master?.isin ?? null,
      sector: master?.sector ?? null,
      industry: master?.industry ?? null,
      market_cap_rs: master?.market_cap_rs ?? null,
      cap_band: master?.cap_band ?? null,
      logo_url,
      price,
      candles_30d,
      profile,
      statistics,
      dividends,
      splits,
      earnings,
      news,
      ai_report_stats: {
        total_reports_on_stock,
        latest_verdict_distribution: bucket_counts,
        most_recent_report_date,
      },
      meta: {
        provider_failures,
        elapsed_ms: Date.now() - started,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("stock-overview fatal", msg);
    return json({ success: false, error: msg }, 500);
  }
});
