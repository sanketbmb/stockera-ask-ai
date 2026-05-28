## Goal
Add a Supabase Edge Function `dhan-fetch` that proxies the Dhan API (SEBI-registered broker) for live Indian stock data, mirroring the structure and JSDoc style of `finedge-fetch`.

## Files

### 1. `supabase/functions/dhan-fetch/index.ts` (new)
Deno HTTP handler with JSDoc-commented sections matching `finedge-fetch`:

- **CORS** — `Access-Control-Allow-Origin: *`, allow headers `authorization, x-client-info, apikey, content-type`, methods `POST, OPTIONS`. Short-circuit `OPTIONS` with 204.
- **Input parsing** — JSON body: `endpoint` (required, whitelisted), `securityId?: string`, `exchangeSegment?: "NSE_EQ" | "BSE_EQ" | "NSE_FNO"` (default `NSE_EQ`), `params?: { fromDate?, toDate?, interval? }`.
  - Whitelist: `ltp`, `ohlc`, `quote`, `historical`, `holdings`, `marketfeed`. Anything else → 400.
- **Secrets** — `Deno.env.get("DHAN_CLIENT_ID")` + `Deno.env.get("DHAN_ACCESS_TOKEN")`. Missing either → `{ success:false, error:"Dhan credentials not configured", status:500 }`, HTTP 500.
- **URL + method + body build** (base `https://api.dhan.co/v2`):
  - `ltp` → `POST /marketfeed/ltp`, body `{ [exchangeSegment]: [Number(securityId)] }`
  - `ohlc` → `POST /marketfeed/ohlc`, body `{ [exchangeSegment]: [Number(securityId)] }`
  - `quote` → `POST /marketfeed/quote`, body `{ [exchangeSegment]: [Number(securityId)] }`
  - `marketfeed` → alias of `quote` (same shape)
  - `historical` → `POST /charts/historical`, body `{ securityId, exchangeSegment, instrument: "EQUITY", fromDate: params.fromDate, toDate: params.toDate, ...(params.interval ? { interval: params.interval } : {}) }`
  - `holdings` → `GET /holdings` (no body)
  - Validate that `securityId` is present for non-`holdings` endpoints; reject 400 otherwise. For `historical`, require `fromDate` + `toDate`.
- **Headers** — `access-token`, `client-id`, `Content-Type: application/json`, `Accept: application/json`.
- **Fetch + response shaping**
  - Parse upstream body as JSON, fall back to text.
  - 2xx → `{ success:true, data, endpoint, securityId: securityId ?? null }`, HTTP 200.
  - 401 → `{ success:false, error:"DHAN_TOKEN_EXPIRED", message:"Dhan access token expired — refresh DHAN_ACCESS_TOKEN secret", status:401 }`, HTTP 401.
  - 429 → forward `Retry-After`, body `{ success:false, error:"Rate limited", status:429 }`, HTTP 429.
  - Other non-2xx → forward upstream `error`/`statusText` and status.
  - Exceptions → `{ success:false, error:String(err), status:500 }`, HTTP 500.
- All responses include CORS headers + `Content-Type: application/json`.

### 2. `supabase/config.toml` (edit)
Append:
```toml
[functions.dhan-fetch]
verify_jwt = true
```

## Deploy & test
1. `supabase--deploy_edge_functions(["dhan-fetch"])`.
2. Smoke test via `supabase--curl_edge_functions` → `POST /dhan-fetch` body `{"endpoint":"ltp","securityId":"11536","exchangeSegment":"NSE_EQ"}` (RELIANCE). Expect HTTP 200, `success:true`, LTP present in `data`.
3. If Dhan returns 401, surface `DHAN_TOKEN_EXPIRED` so the user knows to rotate `DHAN_ACCESS_TOKEN`.

## Out of scope
- No client-side wrapper / React hooks.
- No caching (live market data).
- No retry/backoff beyond forwarding 429 + `Retry-After`.
- `DHAN_CLIENT_ID` and `DHAN_ACCESS_TOKEN` already exist in project secrets — no `add_secret` step.
