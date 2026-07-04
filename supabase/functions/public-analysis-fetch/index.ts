// public-analysis-fetch — reads pre-warmed stock_analytics_cache for
// /stock/$symbol Analytics tab. Anonymous callers get cache-only.
// Authenticated callers can trigger on-demand compute via generate-stock-analysis
// (rate-limited to 5 compute invocations per user per day).
//
// Returns a shaped `analytics` payload with report-only fields stripped:
//   omitted: user_context, summary_reason, verdict_reason, confidence_pct,
//            risk_label, time_horizon.

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
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const FORMULA_VERSION = "v1.0";
const WEIGHTING_PROFILE_ID = "long-term-default";
const ACTION_BUCKET_VERSION = "v1";
const HORIZON = "long-term";
const DAILY_COMPUTE_CAP = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function istDate(): string {
  const ist = new Date(Date.now() + (5 * 60 + 30) * 60_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}

// Public-safe projection — strips report-only prose/personalization.
function shapeAnalytics(payload: Record<string, unknown>) {
  if (!payload || typeof payload !== "object") return null;
  const fv = payload.final_verdict as Record<string, unknown> | undefined;
  const finalVerdict = fv
    ? {
        action: fv.action ?? null,
        overall_score: fv.overall_score ?? null,
      }
    : null;
  return {
    as_of_date: payload.as_of_date ?? null,
    stock: payload.stock ?? null,
    final_verdict: finalVerdict,
    score_breakdown: payload.score_breakdown ?? null,
    returns_snapshot: payload.returns_snapshot ?? null,
    fundamental_snapshot: payload.fundamental_snapshot ?? null,
    risk_snapshot: payload.risk_snapshot ?? null,
    sentiment_snapshot: payload.sentiment_snapshot ?? null,
    long_term_quality_snapshot: payload.long_term_quality_snapshot ?? null,
    audit_meta: payload.audit_meta
      ? {
          formula_version: (payload.audit_meta as Record<string, unknown>).formula_version ?? FORMULA_VERSION,
          tier_weights: (payload.audit_meta as Record<string, unknown>).tier_weights ?? null,
        }
      : null,
    flags: payload.flags ?? null,
  };
}

async function readCache(symbol: string, exchange: string) {
  const url = `${SUPABASE_URL}/rest/v1/stock_analytics_cache` +
    `?symbol=eq.${encodeURIComponent(symbol)}` +
    `&exchange=eq.${encodeURIComponent(exchange)}` +
    `&horizon=eq.${HORIZON}` +
    `&cache_date=eq.${istDate()}` +
    `&select=payload,computed_at,formula_version,weighting_profile_id,action_bucket_version,origin,provider_failures` +
    `&limit=1`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json() as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

async function writeCache(
  symbol: string, exchange: string, payload: Record<string, unknown>,
  origin: "prewarm" | "on_demand_authenticated", durationMs: number,
) {
  const row = {
    symbol, exchange, horizon: HORIZON, cache_date: istDate(),
    payload, payload_version: 1,
    formula_version: FORMULA_VERSION,
    weighting_profile_id: WEIGHTING_PROFILE_ID,
    action_bucket_version: ACTION_BUCKET_VERSION,
    origin, compute_duration_ms: durationMs,
    provider_failures: [],
    computed_at: new Date().toISOString(),
  };
  await fetch(`${SUPABASE_URL}/rest/v1/stock_analytics_cache?on_conflict=symbol,exchange,horizon,cache_date`, {
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

async function userComputeCountToday(userId: string): Promise<number> {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const url = `${SUPABASE_URL}/rest/v1/cron_run_log` +
    `?function_name=eq.on_demand_analytics_${userId}` +
    `&started_at=gte.${since.toISOString()}` +
    `&select=id`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) return 0;
  const rows = await res.json() as unknown[];
  return rows.length;
}

async function logCompute(userId: string, symbol: string, ok: boolean, ms: number, err?: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/cron_run_log`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify({
      function_name: `on_demand_analytics_${userId}`,
      status: ok ? "ok" : "error",
      started_at: new Date(Date.now() - ms).toISOString(),
      finished_at: new Date().toISOString(),
      error_message: err ?? null,
      metrics: { symbol, ms },
    }),
  });
}

async function getUserId(auth: string | null): Promise<string | null> {
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  if (!token || token === ANON_KEY || token === SERVICE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = await res.json() as { id?: string };
    return body.id ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const symbol = String(body?.symbol ?? "").trim().toUpperCase();
    const exchange = String(body?.exchange ?? "NSE").trim().toUpperCase();
    const compute = body?.compute === true;
    if (!symbol) return json({ success: false, error: "symbol required" }, 400);

    // 1. Cache read (both anon + authenticated).
    const cached = await readCache(symbol, exchange);
    if (cached && !compute) {
      return json({
        success: true, cached: true,
        analytics: shapeAnalytics(cached.payload as Record<string, unknown>),
        provenance: {
          computed_at: cached.computed_at,
          formula_version: cached.formula_version,
          weighting_profile_id: cached.weighting_profile_id,
          action_bucket_version: cached.action_bucket_version,
          origin: cached.origin,
          cache_date: istDate(),
        },
      });
    }

    // 2. On-demand compute — authenticated only + rate limit.
    if (compute) {
      const userId = await getUserId(req.headers.get("authorization"));
      if (!userId) {
        return json({ success: false, error: "AUTH_REQUIRED", cached: false }, 401);
      }
      const used = await userComputeCountToday(userId);
      if (used >= DAILY_COMPUTE_CAP) {
        return json({
          success: false, error: "RATE_LIMITED", cached: false,
          message: `Daily compute limit reached (${DAILY_COMPUTE_CAP}/day). Try again tomorrow.`,
        }, 429);
      }
      const t0 = Date.now();
      try {
        const genRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-stock-analysis`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ symbol, exchange, query_type: "long-term", include_news: true }),
        });
        const payload = await genRes.json();
        const ms = Date.now() - t0;
        if (!genRes.ok || payload?.success !== true) {
          await logCompute(userId, symbol, false, ms, String(payload?.error ?? genRes.status));
          return json({ success: false, error: "COMPUTE_FAILED", cached: false }, 502);
        }
        await writeCache(symbol, exchange, payload, "on_demand_authenticated", ms);
        await logCompute(userId, symbol, true, ms);
        return json({
          success: true, cached: false,
          analytics: shapeAnalytics(payload),
          provenance: {
            computed_at: new Date().toISOString(),
            formula_version: FORMULA_VERSION,
            weighting_profile_id: WEIGHTING_PROFILE_ID,
            action_bucket_version: ACTION_BUCKET_VERSION,
            origin: "on_demand_authenticated",
            cache_date: istDate(),
          },
        });
      } catch (e) {
        await logCompute(userId, symbol, false, Date.now() - t0, String(e));
        return json({ success: false, error: "COMPUTE_ERROR", cached: false }, 500);
      }
    }

    // 3. Anonymous cache miss.
    return json({ success: true, cached: false, analytics: null, provenance: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("public-analysis-fetch fatal", msg);
    return json({ success: false, error: msg }, 500);
  }
});
