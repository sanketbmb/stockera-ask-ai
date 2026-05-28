## Goal
Add a Supabase Edge Function `finedge-fetch` that proxies the FinEdge API (Indian fundamentals) so the frontend can call it without exposing `FINEDGE_API_KEY`.

## Files

### 1. `supabase/functions/finedge-fetch/index.ts` (new)
Deno HTTP handler with JSDoc-commented sections:

- **CORS** — `Access-Control-Allow-Origin: *`, allow headers `authorization, x-client-info, apikey, content-type`, methods `POST, OPTIONS`. Short-circuit `OPTIONS` with 204.
- **Input parsing** — parse JSON body: `endpoint` (required, whitelisted), `symbol?`, `params?: Record<string, string|number>`.
  - Whitelist: `quote`, `company-profile`, `ratios`, `financials`, `peers`, `daily-quotes`, `shareholdings/ownership-history`, `corporate-actions/all`, `stock-symbols`. Reject anything else with 400 (prevents arbitrary upstream calls).
- **Secret** — `Deno.env.get("FINEDGE_API_KEY")`; if missing return `{ success:false, error:"FINEDGE_API_KEY not configured", status:500 }` with HTTP 500.
- **URL build** —
  - Base: `https://data.finedgeapi.com/api/v1/${endpoint}`
  - If `symbol` present AND endpoint is path-style (`company-profile`, `ratios`, `financials`, `peers`, `daily-quotes`, `shareholdings/ownership-history`, `corporate-actions/all`) → append `/${encodeURIComponent(symbol)}`.
  - For `quote` and `stock-symbols` keep symbol as a query param when provided (matches the example `…/quote?symbol=RELIANCE`).
  - Append every `params` entry + `token=${FINEDGE_API_KEY}` via `URLSearchParams`.
- **Fetch** — GET with `Accept: application/json`. Read body as text, try `JSON.parse`, fall back to raw text.
- **Response shaping**
  - 2xx → `{ success:true, data, endpoint, symbol: symbol ?? null }`, HTTP 200, JSON.
  - 429 → forward `Retry-After` header from upstream, body `{ success:false, error:"Rate limited", status:429 }`, HTTP 429.
  - Other non-2xx → `{ success:false, error: <upstream message or statusText>, status: <upstreamStatus> }` with same HTTP status (forwarded).
  - Thrown exceptions → `{ success:false, error:String(err), status:500 }`, HTTP 500.
- All responses include CORS headers + `Content-Type: application/json`.

### 2. `supabase/config.toml` (edit)
Append:
```toml
[functions.finedge-fetch]
verify_jwt = true
```
(Matches the project's other functions; callers already pass the user's auth header.)

## Deploy & test
1. Deploy via `supabase--deploy_edge_functions(["finedge-fetch"])`.
2. Smoke test with `supabase--curl_edge_functions` → `POST /finedge-fetch` body `{"endpoint":"company-profile","symbol":"RELIANCE"}`, expect HTTP 200 and `success:true`.
3. If upstream returns non-200, surface the forwarded `error`/`status` to confirm error path works.

## Out of scope
- No client-side wrapper / React hooks (can add later once we know which screen consumes this).
- No caching layer (FinEdge is the source of truth; add a Postgres cache only if rate limits bite).
- No retry/backoff beyond forwarding 429 + `Retry-After`.
- `FINEDGE_API_KEY` is already present in project secrets — no `add_secret` step needed.
