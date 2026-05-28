// Marketaux news API wrapper
// Endpoints: news/all, news/by-symbol

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" };

const BASE_URL = "https://api.marketaux.com/v1/";
const ALLOWED_ENDPOINTS = new Set(["news/all", "news/by-symbol"]);

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
    const token = Deno.env.get("MARKETAUX_API_TOKEN");
    if (!token) {
      return json(
        { success: false, code: "MISSING_TOKEN", error: "MARKETAUX_API_TOKEN not configured" },
        500,
      );
    }

    const body = await req.json().catch(() => ({}));
    const { endpoint, symbols, params } = body as {
      endpoint?: string;
      symbols?: string;
      params?: Record<string, unknown>;
    };

    if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
      return json(
        {
          success: false,
          code: "INVALID_ENDPOINT",
          error: `endpoint must be one of: ${[...ALLOWED_ENDPOINTS].join(", ")}`,
        },
        400,
      );
    }

    const qs = new URLSearchParams();
    qs.set("api_token", token);
    if (symbols) qs.set("symbols", symbols);
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "") continue;
        qs.set(k, String(v));
      }
    }

    const url = `${BASE_URL}${endpoint}?${qs.toString()}`;
    const upstream = await fetch(url, { method: "GET" });
    const text = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (upstream.status === 401) {
      return json(
        { success: false, code: "MARKETAUX_UNAUTHORIZED", error: "Invalid Marketaux token", data },
        401,
      );
    }
    if (upstream.status === 429) {
      return json(
        { success: false, code: "MARKETAUX_RATE_LIMIT", error: "Rate limit exceeded", data },
        429,
      );
    }
    if (!upstream.ok) {
      return json(
        {
          success: false,
          code: "MARKETAUX_UPSTREAM_ERROR",
          status: upstream.status,
          error: typeof data === "object" ? data : text.slice(0, 500),
        },
        upstream.status,
      );
    }

    return json({ success: true, endpoint, symbols: symbols ?? null, data });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
