## Plan: Improve `dhan-fetch` empty-quote error surfacing

### Goal
Update the `dhan-fetch` edge function so realtime marketfeed calls (`ltp`, `ohlc`, `quote`) that come back with `status: "success"` but an empty segment map return a clear, actionable error instead of silently returning `success: true` with `{}`.

### Changes

**File:** `supabase/functions/dhan-fetch/index.ts`

After the Dhan API response is parsed for `ltp` / `ohlc` / `quote` endpoints:

1. Check whether `data.data` exists and every segment key (e.g. `NSE_EQ`, `BSE_EQ`) is an empty object.
2. If so, return:
   ```json
   {
     "success": false,
     "error": "DHAN_EMPTY_QUOTE",
     "message": "Dhan returned no data for this security. Likely causes: market is closed (NSE: 09:15–15:30 IST Mon–Fri), Data API marketfeed tier not active on your Dhan plan, or NSE_EQ segment not enabled on the token.",
     "endpoint": "<endpoint>",
     "securityId": "<id>",
     "raw": <original response>
   }
   ```
   with HTTP 200 (so the frontend can read the structured error).
3. Leave populated responses, `historical`, `holdings`, and other endpoints untouched.

### Verification
- Call `dhan-fetch { endpoint: "ltp", securityId: "2885" }` → expect `success: false, error: "DHAN_EMPTY_QUOTE"`.
- Call `dhan-fetch { endpoint: "historical", securityId: "2885", ... }` → expect populated candles (unchanged).
- Call `dhan-fetch { endpoint: "holdings" }` → unchanged.

### Out of scope
- No frontend changes. UI surfaces consuming this can be updated in a follow-up once we confirm tomorrow's market-hours test (Plan A) whether the empty response was market-closure or entitlement.
- No retry/fallback logic to `historical` for last-close — separate decision.
