// twelvedata-fetch — thin REST wrapper for Twelve Data endpoints.
// Whitelisted endpoints only. Reads TWELVE_DATA_API_KEY from Deno.env.
// Called by stock-overview (server-to-server) and by MasterSearch fallback.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-client-info",
};
const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" };

const BASE_URL = "https://api.twelvedata.com";
const ALLOWED_ENDPOINTS = new Set<string>([
  "profile",
  "statistics",
  "logo",
  "dividends",
  "splits",
  "earnings",
  "insider_transactions",
  "symbol_search",
  "time_series",
  "quote",
  "ipo_calendar",
  "price_target",
  "recommendations",
  "growth_estimates",
  "market_state",
  "earliest_timestamp",
  "exchange_schedule",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const apiKey = Deno.env.get("TWELVE_DATA_API_KEY");
    if (!apiKey) {
      return json(
        { success: false, code: "MISSING_TOKEN", error: "TWELVE_DATA_API_KEY not configured" },
        500,
      );
    }

    const body = await req.json().catch(() => ({}));
    const { endpoint, params } = body as {
      endpoint?: string;
      params?: Record<string, unknown>;
    };

    if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
      return json(
        {
          success: false,
          code: "TWELVEDATA_ENDPOINT_NOT_ALLOWED",
          error: `endpoint must be one of: ${[...ALLOWED_ENDPOINTS].join(", ")}`,
        },
        400,
      );
    }

    const qs = new URLSearchParams();
    qs.set("apikey", apiKey);
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "") continue;
        qs.set(k, String(v));
      }
    }

    const url = `${BASE_URL}/${endpoint}?${qs.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let upstream: Response;
    try {
      upstream = await fetch(url, { method: "GET", signal: controller.signal });
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      return json(
        { success: false, code: "TWELVEDATA_UPSTREAM_ERROR", error: `Fetch failed: ${msg}` },
        502,
      );
    }
    clearTimeout(timer);

    const text = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (upstream.status === 401) {
      return json(
        { success: false, code: "TWELVEDATA_UNAUTHORIZED", error: "Invalid Twelve Data key", data },
        401,
      );
    }
    if (upstream.status === 429) {
      return json(
        { success: false, code: "TWELVEDATA_RATE_LIMIT", error: "Rate limit exceeded", data },
        429,
      );
    }
    // Twelve Data returns 200 even on API-level errors: `{ status: "error", ... }`.
    if (
      !upstream.ok ||
      (data && typeof data === "object" && (data as { status?: string }).status === "error")
    ) {
      return json(
        { success: false, code: "TWELVEDATA_UPSTREAM_ERROR", error: `Upstream ${upstream.status}`, data },
        upstream.ok ? 502 : upstream.status,
      );
    }

    return json({ success: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ success: false, code: "TWELVEDATA_UPSTREAM_ERROR", error: msg }, 500);
  }
});
