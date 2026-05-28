# Plan: Unified `get-price-data` Edge Function

Single source of price truth for the Brain. Routes between FinEdge (accurate EOD/historical settlement closes) and Dhan (live LTP during market hours), with automatic fallback.

## 1. New edge function: `supabase/functions/get-price-data/index.ts`

**Input:**
```ts
{ symbol: string;          // FinEdge symbol, e.g. "RELIANCE"
  securityId?: string;     // Dhan numeric ID, e.g. "2885" (required for live)
  exchangeSegment?: "NSE_EQ" | "BSE_EQ";  // default NSE_EQ
  mode: "live" | "eod" | "historical";
  fromDate?: string;       // historical only (YYYY-MM-DD)
  toDate?: string;         // historical only
}
```

**Output (unified shape):**
```ts
{ success: true,
  mode, symbol,
  price: number | null,           // single price for live/eod
  timestamp: string | null,       // ISO
  candles?: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>,
  source: "finedge" | "dhan" | "finedge-fallback" | "dhan-fallback",
  marketStatus: "open" | "closed" | "pre" | "post" | "holiday",
  fallbackUsed: boolean,
  primaryError?: string }
```

**Routing logic per mode:**

| mode | primary | fallback |
|---|---|---|
| `live` | `dhan-fetch` ltp | `finedge-fetch` quote (latest tick) |
| `eod` | `finedge-fetch` daily-quotes (last row) | `dhan-fetch` historical (last candle) |
| `historical` | `finedge-fetch` daily-quotes (range) | `dhan-fetch` historical (range) |

Primary considered failed if: HTTP error, `success: false`, `DHAN_EMPTY_QUOTE`, or empty/null price field. Falls back transparently and sets `fallbackUsed: true` + records `primaryError`.

**Market hours helper (`isMarketOpen()`):**
- IST timezone (UTC+5:30)
- Mon–Fri, 09:15–15:30
- NSE holiday list 2026 hardcoded (Republic Day, Holi, Good Friday, etc. — small constant array)
- Returns `"open" | "closed" | "pre" | "post" | "holiday"`

For `mode: "live"` when market is closed → still call Dhan ltp (returns last tick), but mark `marketStatus` accordingly so the Brain can decide whether to prefer EOD instead.

**Implementation pattern:** Internal HTTP calls to existing `dhan-fetch` and `finedge-fetch` functions (forwarding auth header), so we reuse upstream wrappers and secrets — no duplication of API logic.

**Config:** Add `[functions.get-price-data]` with `verify_jwt = true` to `supabase/config.toml`.

## 2. Brain integration (`generate-ai-report/index.ts`)

Replace the Gemini-estimate `fetchStockData()` (lines 170–209) with a real call to `get-price-data`:

- During market hours → `mode: "live"` (Dhan LTP).
- Outside market hours / weekends / holidays → `mode: "eod"` (FinEdge settlement close).
- Return `{ ltp, ltp_timestamp, source, exchange }` in the same shape so downstream code (lines 376+) is unchanged.
- Gemini fallback retained only if both Dhan + FinEdge fail.

The Brain now always gets the most accurate price for the context: settlement close after-hours, live tick during trading.

## 3. Out of scope

- No frontend changes.
- No changes to `dhan-fetch` or `finedge-fetch` internals.
- Historical OHLCV bulk usage by other parts of the app (chart components etc.) is not migrated in this pass — they can adopt `get-price-data` incrementally.
- NSE holiday calendar is hardcoded for 2026; a DB-backed calendar can come later.

## 4. Verification

After deploy, via `curl_edge_functions`:
1. `{symbol:"RELIANCE", securityId:"2885", mode:"live"}` → returns Dhan LTP, `marketStatus` reflects current time.
2. `{symbol:"RELIANCE", mode:"eod"}` → returns FinEdge close ≈ ₹1352 for 27 May 2026.
3. `{symbol:"RELIANCE", securityId:"2885", mode:"eod"}` with FinEdge key temporarily wrong → falls back to Dhan historical, `fallbackUsed: true`.
4. Re-run an AI report and confirm `ltp_source` in the saved report is `finedge` or `dhan` (not `Gemini estimate`).
