/**
 * dhan-fetch — Supabase Edge Function
 *
 * Wrapper for the Dhan API (SEBI-registered broker) providing live Indian
 * stock data: LTP, OHLC, full quote, historical charts, and holdings.
 *
 * Docs: https://dhanhq.co/docs/v2/
 */

/** CORS headers for browser access */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Whitelisted endpoints — anything else is rejected with 400 */
const ALLOWED_ENDPOINTS = new Set([
  "ltp",
  "ohlc",
  "quote",
  "marketfeed",
  "historical",
  "holdings",
]);

type ExchangeSegment = "NSE_EQ" | "BSE_EQ" | "NSE_FNO" | "IDX_I" | "BSE_I";

interface RequestBody {
  endpoint: string;
  securityId?: string;
  exchangeSegment?: ExchangeSegment;
  params?: {
    fromDate?: string;
    toDate?: string;
    interval?: string;
    instrument?: "EQUITY" | "INDEX";
  };
}

const BASE_URL = "https://api.dhan.co/v2";

/** Build a JSON response with CORS headers */
function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

Deno.serve(async (req) => {
  /** OPTIONS preflight — short-circuit with 204 */
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    /** Input parsing */
    const body = (await req.json()) as RequestBody;
    const endpoint = body?.endpoint;
    const securityId = body?.securityId;
    const exchangeSegment: ExchangeSegment = body?.exchangeSegment ?? "NSE_EQ";
    const params = body?.params ?? {};

    if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
      return jsonResponse(
        {
          success: false,
          error: `Invalid or missing endpoint. Allowed: ${[...ALLOWED_ENDPOINTS].join(", ")}`,
          status: 400,
        },
        400,
      );
    }

    /** Per-endpoint required-field validation */
    if (endpoint !== "holdings" && !securityId) {
      return jsonResponse(
        { success: false, error: "securityId is required for this endpoint", status: 400 },
        400,
      );
    }
    if (endpoint === "historical" && (!params.fromDate || !params.toDate)) {
      return jsonResponse(
        { success: false, error: "fromDate and toDate are required for historical", status: 400 },
        400,
      );
    }

    /** Secrets */
    const clientId = Deno.env.get("DHAN_CLIENT_ID");
    const accessToken = Deno.env.get("DHAN_ACCESS_TOKEN");
    if (!clientId || !accessToken) {
      return jsonResponse(
        { success: false, error: "Dhan credentials not configured", status: 500 },
        500,
      );
    }

    /** URL + method + upstream body */
    let url = "";
    let method: "GET" | "POST" = "POST";
    let upstreamBody: unknown = undefined;

    switch (endpoint) {
      case "ltp":
      case "ohlc":
      case "quote":
      case "marketfeed": {
        const path = endpoint === "marketfeed" ? "quote" : endpoint;
        url = `${BASE_URL}/marketfeed/${path}`;
        upstreamBody = { [exchangeSegment]: [Number(securityId)] };
        break;
      }
      case "historical": {
        url = `${BASE_URL}/charts/historical`;
        upstreamBody = {
          securityId,
          exchangeSegment,
          instrument: params.instrument ?? "EQUITY",
          expiryCode: 0,
          oi: false,
          fromDate: params.fromDate,
          toDate: params.toDate,
          ...(params.interval ? { interval: params.interval } : {}),
        };
        break;
      }
      case "holdings": {
        url = `${BASE_URL}/holdings`;
        method = "GET";
        break;
      }
    }

    /** Upstream fetch with Dhan auth headers */
    if (endpoint === "historical") {
      console.log("dhan-fetch historical upstream body:", JSON.stringify(upstreamBody));
    }
    const upstream = await fetch(url, {
      method,
      headers: {
        "access-token": accessToken,
        "client-id": clientId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: method === "POST" ? JSON.stringify(upstreamBody) : undefined,
    });

    const rawText = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = rawText;
    }

    /** Response shaping */
    if (upstream.ok) {
      /** Detect empty marketfeed responses (status:success but no segment data).
       *  Dhan returns this when: market is closed, Data API marketfeed tier is
       *  not active on the plan, or the segment is not enabled on the token. */
      const isMarketfeed =
        endpoint === "ltp" ||
        endpoint === "ohlc" ||
        endpoint === "quote" ||
        endpoint === "marketfeed";

      if (isMarketfeed && typeof data === "object" && data !== null) {
        const outer = data as Record<string, unknown>;
        const inner = outer.data;
        if (typeof inner === "object" && inner !== null) {
          const segs = inner as Record<string, unknown>;
          const segKeys = Object.keys(segs);
          const allEmpty =
            segKeys.length === 0 ||
            segKeys.every((k) => {
              const v = segs[k];
              return (
                v !== null &&
                typeof v === "object" &&
                Object.keys(v as Record<string, unknown>).length === 0
              );
            });
          if (allEmpty) {
            return jsonResponse(
              {
                success: false,
                error: "DHAN_EMPTY_QUOTE",
                message:
                  "Dhan returned no data for this security. Likely causes: market is closed (NSE: 09:15–15:30 IST Mon–Fri), Data API marketfeed tier not active on your Dhan plan, or the requested segment is not enabled on the token.",
                endpoint,
                securityId: securityId ?? null,
                exchangeSegment,
                raw: data,
              },
              200,
            );
          }
        }
      }

      return jsonResponse(
        {
          success: true,
          data,
          endpoint,
          securityId: securityId ?? null,
        },
        200,
      );
    }


    if (upstream.status === 401) {
      return jsonResponse(
        {
          success: false,
          error: "DHAN_TOKEN_EXPIRED",
          message:
            "Dhan access token expired or invalid — refresh the DHAN_ACCESS_TOKEN secret",
          status: 401,
        },
        401,
      );
    }

    if (upstream.status === 429) {
      const retryAfter = upstream.headers.get("Retry-After");
      return jsonResponse(
        { success: false, error: "Rate limited", status: 429 },
        429,
        retryAfter ? { "Retry-After": retryAfter } : {},
      );
    }

    const upstreamErrMsg =
      (typeof data === "object" && data && "errorMessage" in data
        ? String((data as Record<string, unknown>).errorMessage)
        : typeof data === "object" && data && "message" in data
        ? String((data as Record<string, unknown>).message)
        : null) ?? upstream.statusText;

    return jsonResponse(
      { success: false, error: upstreamErrMsg, status: upstream.status, data },
      upstream.status,
    );
  } catch (err) {
    console.error("dhan-fetch error:", err);
    return jsonResponse(
      { success: false, error: String(err), status: 500 },
      500,
    );
  }
});
