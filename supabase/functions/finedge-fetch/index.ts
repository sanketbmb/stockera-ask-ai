// finedge-fetch
// Wrapper for FinEdge API (Indian fundamentals data provider).
// Keeps FINEDGE_API_KEY server-side and exposes a small JSON proxy to the browser.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * CORS headers shared by every response (including errors & preflight).
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Endpoints we are willing to proxy. Anything outside this list is rejected
 * so callers can't use this function as an open-ended HTTP relay.
 */
const ALLOWED_ENDPOINTS = new Set([
  "quote",
  "company-profile",
  "ratios",
  "financials",
  "peers",
  "daily-quotes",
  "shareholdings/ownership-history",
  "corporate-actions/all",
  "stock-symbols",
]);

/**
 * Endpoints where the symbol belongs in the URL path (`/endpoint/SYMBOL`).
 * Everything else keeps `symbol` as a query parameter.
 */
const PATH_SYMBOL_ENDPOINTS = new Set([
  "company-profile",
  "ratios",
  "financials",
  "peers",
  "daily-quotes",
  "shareholdings/ownership-history",
  "corporate-actions/all",
]);

interface RequestBody {
  endpoint?: string;
  symbol?: string;
  params?: Record<string, string | number | boolean>;
}

/**
 * Build a standard JSON response with CORS + content-type set.
 */
function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

serve(async (req) => {
  // --- CORS preflight ---------------------------------------------------
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed", status: 405 }, 405);
  }

  try {
    // --- Input parsing --------------------------------------------------
    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (!body || typeof body.endpoint !== "string") {
      return jsonResponse(
        { success: false, error: "Body must include an 'endpoint' string", status: 400 },
        400,
      );
    }

    const endpoint = body.endpoint.trim();
    if (!ALLOWED_ENDPOINTS.has(endpoint)) {
      return jsonResponse(
        { success: false, error: `Unsupported endpoint: ${endpoint}`, status: 400 },
        400,
      );
    }

    const symbol = typeof body.symbol === "string" && body.symbol.trim() ? body.symbol.trim() : undefined;

    // --- Secret ---------------------------------------------------------
    const apiKey = Deno.env.get("FINEDGE_API_KEY");
    if (!apiKey) {
      return jsonResponse(
        { success: false, error: "FINEDGE_API_KEY not configured", status: 500 },
        500,
      );
    }

    // --- URL construction ----------------------------------------------
    let url = `https://data.finedgeapi.com/api/v1/${endpoint}`;
    if (symbol && PATH_SYMBOL_ENDPOINTS.has(endpoint)) {
      url += `/${encodeURIComponent(symbol)}`;
    }

    const qs = new URLSearchParams();
    if (symbol && !PATH_SYMBOL_ENDPOINTS.has(endpoint)) {
      qs.set("symbol", symbol);
    }
    if (body.params && typeof body.params === "object") {
      for (const [k, v] of Object.entries(body.params)) {
        if (v === undefined || v === null) continue;
        qs.set(k, String(v));
      }
    }
    qs.set("token", apiKey);
    url += `?${qs.toString()}`;

    // --- Upstream fetch -------------------------------------------------
    const upstream = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const text = await upstream.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    // --- Response shaping ----------------------------------------------
    if (upstream.ok) {
      return jsonResponse(
        { success: true, data, endpoint, symbol: symbol ?? null },
        200,
      );
    }

    if (upstream.status === 429) {
      const retryAfter = upstream.headers.get("retry-after");
      return jsonResponse(
        { success: false, error: "Rate limited", status: 429, data },
        429,
        retryAfter ? { "Retry-After": retryAfter } : {},
      );
    }

    const upstreamMessage =
      (data && typeof data === "object" && "message" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).message)
        : undefined) ?? upstream.statusText ?? `Upstream HTTP ${upstream.status}`;

    return jsonResponse(
      { success: false, error: upstreamMessage, status: upstream.status, data },
      upstream.status,
    );
  } catch (err) {
    // --- Unexpected failure --------------------------------------------
    console.error("finedge-fetch threw:", err);
    return jsonResponse(
      { success: false, error: (err as Error).message ?? String(err), status: 500 },
      500,
    );
  }
});
