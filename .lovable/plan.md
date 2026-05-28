# Plan: `marketaux-fetch` Edge Function

Thin Supabase Edge Function wrapper around the Marketaux news API, mirroring the existing `dhan-fetch` / `finedge-fetch` pattern so the Brain can later consume news the same way it consumes price data.

## 1. New file: `supabase/functions/marketaux-fetch/index.ts`

**Runtime:** Deno (matches other functions in `supabase/functions/`).

**Request shape (POST JSON):**
```ts
{
  endpoint: "news/all" | "news/by-symbol",
  symbols?: string,           // e.g. "RELIANCE.NSE,TCS.NSE"
  params?: {
    countries?: string;       // "in"
    filter_entities?: boolean;
    language?: string;        // "en"
    limit?: number;           // 1..100
    search?: string;
    published_after?: string; // YYYY-MM-DD or ISO
    // any other Marketaux passthrough param (kept permissive)
  }
}
```

**Logic:**
1. Handle `OPTIONS` preflight with standard CORS headers (`*` origin, `POST, OPTIONS`, `authorization, content-type, apikey, x-client-info`).
2. Reject non-POST with 405.
3. Read `MARKETAUX_API_TOKEN` from `Deno.env`. Missing → `500 { success:false, error:"MARKETAUX_API_TOKEN not configured" }`.
4. Parse body, validate `endpoint` ∈ {`news/all`, `news/by-symbol`}. Invalid → 400.
5. Build URL: `https://api.marketaux.com/v1/{endpoint}?api_token=...&...flat params`.
   - Append `symbols` if provided.
   - Flatten `params` into query string (skip undefined/null, coerce booleans/numbers to strings).
6. `fetch` GET. Map upstream status:
   - 200 → `{ success:true, endpoint, symbols, data }` (data = parsed JSON from Marketaux, includes `data[]` array + `meta`).
   - 401 → `401 { success:false, code:"MARKETAUX_UNAUTHORIZED", error:"Invalid Marketaux token" }`.
   - 429 → `429 { success:false, code:"MARKETAUX_RATE_LIMIT", error:"Rate limit exceeded" }`.
   - other non-2xx → forward status + `{ success:false, code:"MARKETAUX_UPSTREAM_ERROR", status, error: <upstream text> }`.
7. All responses include the same CORS headers + `Content-Type: application/json`.
8. Wrap entire handler in try/catch → 500 with `{ success:false, error: e.message }`.

## 2. Config: `supabase/config.toml`

Append:
```toml
[functions.marketaux-fetch]
verify_jwt = true
```
(Consistent with `dhan-fetch`, `finedge-fetch`, `get-price-data`.)

## 3. Deploy + smoke test

After implementation:
1. Deploy via `supabase--deploy_edge_functions` (`["marketaux-fetch"]`).
2. Call via `supabase--curl_edge_functions`:
   ```json
   { "endpoint": "news/all", "params": { "countries": "in", "limit": 3 } }
   ```
3. Verify response contains `success: true` and `data.data[]` with 3 items, each exposing `title`, `description`/`snippet`, `published_at`, `source`, and `entities[].sentiment_score` (Marketaux returns sentiment per matched entity; top-level `sentiment` is also surfaced when `filter_entities` is on).
4. Report the 3 headlines back to the user.

## 4. Out of scope

- No Brain (`generate-ai-report`) integration in this pass — only the wrapper + smoke test, matching the user's request.
- No caching layer, no DB persistence of news items.
- `MARKETAUX_API_TOKEN` secret already exists (visible in `fetch_secrets`); no `add_secret` call needed.
