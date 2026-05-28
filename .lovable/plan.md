# Remove Twelve Data + re-test dhan-fetch

## Findings

Twelve Data is referenced in three edge functions only (no frontend / server-fn usage):

1. `supabase/functions/fetch-stock-data/index.ts` — entire `fetchFromTwelveData` path, `TWELVE_DATA_API_KEY` env read, `source: "twelvedata"` type literal, normalize/format helpers used only by it.
2. `supabase/functions/gemini-analysis/index.ts` — `source: "twelvedata" | "gemini_estimate"` type, and the prompt string `"live from Twelve Data"`.
3. `supabase/functions/generate-ai-report/index.ts` — `TWELVE_DATA_API_KEY` env read, the Twelve Data branch inside `fetchStockData()`, and `twelve_data_set` flag in the health-check JSON.

The new market data path is `dhan-fetch` + `finedge-fetch`; Twelve Data is dead code.

## Changes

### `supabase/functions/fetch-stock-data/index.ts`
- Delete `fetchFromTwelveData()` entirely.
- Delete `normalizeSymbol()` helper (only used by TD; the Lovable AI path needs just a simple uppercase + suffix strip, inline that).
- Remove `tdKey` read and the `if (tdKey) { ... }` branch in `serve()`.
- Narrow `StockData.source` to just `"gemini_estimate"`.
- Update header comment to reflect Gemini-only fallback.

### `supabase/functions/gemini-analysis/index.ts`
- Change `StockData.source` type to `"gemini_estimate"`.
- In `buildGroundTruthBlock`, drop the ternary — always render `"AI-estimated fallback"`.

### `supabase/functions/generate-ai-report/index.ts`
- Delete line 10 (`TWELVE_DATA_API_KEY` const).
- Delete the `if (TWELVE_DATA_API_KEY) { ... }` block (lines ~173–186) and the surrounding `try { ... } catch` that only wraps it; keep the Gemini fallback block intact.
- Delete `twelve_data_set` from the health-check `checks` object.

### Secret cleanup
- `TWELVE_DATA_API_KEY` is no longer referenced. **Question: do you want me to also delete the `TWELVE_DATA_API_KEY` secret from Lovable Cloud, or leave it in place in case you revert?** I'll default to leaving it unless you say otherwise.

### Verification
- `grep -rn -i "twelve" supabase/ src/` returns no matches.
- Deploy the three edited functions.

## Re-run dhan-fetch smoke test
- `POST /dhan-fetch` with body `{ "endpoint": "ltp", "securityId": "11536", "exchangeSegment": "NSE_EQ" }` via `supabase--curl_edge_functions` (anon auth).
- Expected: HTTP 200, `success: true`, RELIANCE LTP in `data`.
- If still 401 `DHAN_TOKEN_EXPIRED`, surface the upstream message and stop.
