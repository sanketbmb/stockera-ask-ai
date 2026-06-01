// compute-intraday-microstructure
// Mission 1 B.1 — Intraday tier-shaped snapshot.
// Stateless; never throws; degrades to nulls with diagnostic trail.
//
// Sources:
//   • finedge-fetch "daily-quotes"  → OHLCV history (ATR14, realized vol, session H/L, gap)
//   • compute-momentum              → sector_rs_today_label (uses 1m RS as proxy)
//   • compute-sentiment             → today-only news catalysts
// Dhan intraday VWAP is intentionally not invoked here — daily-quotes already
// gives us a "post_market" snapshot that is correct for the orchestrator's
// degradation contract. VWAP can be wired in a follow-up when the live
// intraday feed is confirmed available.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function r2(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}
function num(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

async function callFn(name: string, body: unknown): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    const parsed = txt ? JSON.parse(txt) : null;
    if (!res.ok || parsed?.success !== true) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function freshnessFromDate(latestDateStr: string | null): "live" | "post_market" | "stale" {
  if (!latestDateStr) return "stale";
  const d = new Date(latestDateStr);
  if (Number.isNaN(d.getTime())) return "stale";
  const ageMs = Date.now() - d.getTime();
  // <12h → live (rare for EOD source), <48h → post_market, else stale
  if (ageMs < 12 * 3600_000) return "live";
  if (ageMs < 72 * 3600_000) return "post_market";
  return "stale";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);

  let symbol = "";
  try {
    const body = await req.json();
    symbol = String(body?.symbol ?? "").trim().toUpperCase();
  } catch { /* noop */ }
  if (!symbol) return json({ success: false, error: "SYMBOL_REQUIRED" }, 400);

  const diagnostic: Record<string, unknown> = { symbol, null_reasons: {} as Record<string, string> };
  const nullReasons = diagnostic.null_reasons as Record<string, string>;

  // ── 1. OHLCV via finedge daily-quotes (same source as compute-technicals) ──
  let atr_14: number | null = null;
  let daily_realized_volatility: number | null = null;
  let session_high: number | null = null;
  let session_low: number | null = null;
  let opening_range_15m_high: number | null = null;
  let opening_range_15m_low: number | null = null;
  let vwap: number | null = null;
  let price_vs_vwap_pct: number | null = null;
  let intraday_volume_profile_label: string | null = null;
  let gap_behavior_label: string | null = null;
  let data_freshness: "live" | "post_market" | "stale" = "stale";

  try {
    const dq = await callFn("finedge-fetch", { endpoint: "daily-quotes", symbol });
    const d = (dq?.data as Record<string, unknown> | undefined) ?? {};
    const inner = (d.data ?? d) as Record<string, unknown>;
    const rows = (inner.price ?? inner.quotes ?? inner.data ?? []) as Array<Record<string, unknown>>;
    if (Array.isArray(rows) && rows.length >= 2) {
      const sorted = [...rows].sort((a, b) =>
        String(a.quote_date ?? a.date ?? "").localeCompare(String(b.quote_date ?? b.date ?? "")),
      );
      const N = sorted.length;
      const last = sorted[N - 1];
      const prev = sorted[N - 2];

      session_high = r2(last.high_price ?? last.high);
      session_low  = r2(last.low_price  ?? last.low);
      const lastClose = num(last.close_price ?? last.close);
      const lastOpen  = num(last.open_price  ?? last.open);
      const lastVol   = num(last.volume);
      const prevClose = num(prev.close_price ?? prev.close);

      // ATR-14 (Wilder's true range mean over last 14 bars)
      const highs  = sorted.map((r) => num(r.high_price  ?? r.high));
      const lows   = sorted.map((r) => num(r.low_price   ?? r.low));
      const closes = sorted.map((r) => num(r.close_price ?? r.close));
      if (N >= 15) {
        const trs: number[] = [];
        for (let i = N - 14; i < N; i++) {
          const h = highs[i], l = lows[i], pc = closes[i - 1];
          if (h == null || l == null || pc == null) continue;
          trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
        }
        if (trs.length > 0) atr_14 = r2(trs.reduce((a, b) => a + b, 0) / trs.length);
      }
      if (atr_14 == null) nullReasons.atr_14 = "insufficient_history";

      // Daily realized vol (annualized %) over last 20 log returns
      if (N >= 21) {
        const rets: number[] = [];
        for (let i = N - 20; i < N; i++) {
          const c1 = closes[i - 1], c2 = closes[i];
          if (c1 == null || c2 == null || c1 <= 0) continue;
          rets.push(Math.log(c2 / c1));
        }
        if (rets.length >= 2) {
          const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
          const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
          daily_realized_volatility = r2(Math.sqrt(variance) * Math.sqrt(252) * 100);
        }
      }
      if (daily_realized_volatility == null) nullReasons.daily_realized_volatility = "insufficient_history";

      // Volume profile (last bar vs 20d avg)
      if (N >= 21) {
        const vols = sorted.slice(N - 21, N - 1).map((r) => num(r.volume ?? r.Volume)).filter((v): v is number => v != null);
        const avg = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
        if (avg && lastVol != null) {
          const ratio = lastVol / avg;
          intraday_volume_profile_label = ratio >= 1.25 ? "ABOVE_AVERAGE" : ratio <= 0.75 ? "BELOW_AVERAGE" : "AVERAGE";
        }
      }
      if (intraday_volume_profile_label == null) nullReasons.intraday_volume_profile_label = "insufficient_history_or_volume";

      // Gap behaviour: today open vs yesterday close + intra-day fill
      if (lastOpen != null && prevClose != null && prevClose > 0) {
        const gapPct = ((lastOpen - prevClose) / prevClose) * 100;
        if (Math.abs(gapPct) < 0.3) {
          gap_behavior_label = "FLAT";
        } else if (gapPct >= 0.3) {
          // Gap up: filled if low touched prev close
          gap_behavior_label = (session_low != null && session_low <= prevClose) ? "GAP_FILLED_UP" : "GAP_UP";
        } else {
          gap_behavior_label = (session_high != null && session_high >= prevClose) ? "GAP_FILLED_DOWN" : "GAP_DOWN";
        }
      } else {
        nullReasons.gap_behavior_label = "missing_open_or_prev_close";
      }

      // VWAP: not available from daily-quotes — leave null; mark price_vs_vwap_pct null
      nullReasons.vwap = "intraday_feed_unavailable";
      nullReasons.price_vs_vwap_pct = "vwap_null";
      nullReasons.opening_range_15m_high = "intraday_feed_unavailable";
      nullReasons.opening_range_15m_low  = "intraday_feed_unavailable";

      data_freshness = freshnessFromDate(String(last.date ?? last.Date ?? ""));
    } else {
      nullReasons.session_high = "no_daily_quotes";
      nullReasons.session_low  = "no_daily_quotes";
      nullReasons.atr_14 = "no_daily_quotes";
    }
  } catch (e) {
    nullReasons.daily_quotes_fetch = String(e).slice(0, 160);
  }

  // ── 2. Today-only news catalysts via compute-sentiment ──
  let intraday_news_catalysts: string[] | null = null;
  try {
    const sent = await callFn("compute-sentiment", { symbol });
    const top = (sent?.top_articles ?? []) as Array<Record<string, unknown>>;
    const today = new Date().toISOString().slice(0, 10);
    const items = top
      .filter((a) => String(a.published_at ?? a.publishedAt ?? "").slice(0, 10) === today)
      .map((a) => String(a.title ?? "").trim())
      .filter((t) => t.length > 0)
      .slice(0, 5);
    intraday_news_catalysts = items.length ? items : null;
    if (!intraday_news_catalysts) nullReasons.intraday_news_catalysts = "no_news_today";
  } catch {
    nullReasons.intraday_news_catalysts = "sentiment_call_failed";
  }

  // ── 3. Sector RS today via compute-momentum (1m RS used as today proxy) ──
  let sector_rs_today_label: string | null = null;
  try {
    const mom = await callFn("compute-momentum", { symbol });
    const rs = (mom?.relative_strength ?? {}) as Record<string, unknown>;
    const rs1m = num(rs["1m"]);
    if (rs1m != null) {
      sector_rs_today_label = rs1m > 1 ? "OUTPERFORMING" : rs1m < -1 ? "UNDERPERFORMING" : "INLINE";
    } else {
      nullReasons.sector_rs_today_label = "momentum_rs_unavailable";
    }
  } catch {
    nullReasons.sector_rs_today_label = "momentum_call_failed";
  }

  const snapshot = {
    atr_14,
    daily_realized_volatility,
    opening_range_15m_high,
    opening_range_15m_low,
    vwap,
    price_vs_vwap_pct,
    intraday_volume_profile_label,
    gap_behavior_label,
    session_high,
    session_low,
    sector_rs_today_label,
    intraday_news_catalysts,
    data_freshness,
  };

  return json({
    success: true,
    symbol,
    computed_at: new Date().toISOString(),
    intraday_microstructure_snapshot: snapshot,
    audit_meta: { intraday_microstructure_diagnostic: diagnostic },
  });
});
