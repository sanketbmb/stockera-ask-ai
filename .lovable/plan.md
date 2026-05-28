# Plan: `compute-technicals` Edge Function

First Brain module. Pure-JS indicator engine over FinEdge daily OHLCV.

## Files

1. **`supabase/functions/compute-technicals/index.ts`** (new) — handler + indicators
2. **`supabase/config.toml`** — register `[functions.compute-technicals] verify_jwt = true`

Single-file implementation (keeps deploy simple, matches sibling functions like `get-price-data`). Indicator functions are internal but each gets a JSDoc block.

## Handler flow

```
POST { symbol, lookback_days? = 365 }
  → CORS / OPTIONS
  → validate symbol
  → call sibling edge fn `finedge-fetch` { endpoint:"daily-quotes", symbol }
     using SUPABASE_URL + caller's Authorization header (same pattern as
     get-price-data → callEdge)
  → parse rows via the same shape parseFinedgeDailyQuotes already handles
    (close_price/high_price/low_price/open_price/quote_date/volume)
  → sort ascending, slice last `lookback_days`
  → guard: candles.length < 200 → { success:false, error:"INSUFFICIENT_HISTORY" }
  → compute indicators → signals → score
  → return JSON in the exact shape from the spec
```

Errors:
- finedge call !ok or success≠true → `{ success:false, error:"DATA_FETCH_FAILED", details }`
- thrown exception → 500 `{ success:false, error:"INTERNAL_ERROR", details }`

## Indicator math (pure JS, no deps)

All operate on arrays of numbers; OHLCV split into `closes`, `highs`, `lows`, `volumes`.

- `sma(values, period)` → array
- `ema(values, period)` → array, seeded with SMA of first `period`
- `rsi(closes, 14)` → Wilder's smoothing
- `macd(closes, 12, 26, 9)` → { line[], signal[], histogram[] }
- `stochastic(highs, lows, closes, 14, 3, 3)` → { k[], d[] }
- `roc(closes, 12)`
- `bollinger(closes, 20, 2)` → { upper, middle, lower, bandwidth, percentB } as arrays
- `atr(highs, lows, closes, 14)` → Wilder TR smoothing
- `stdDev(values, 20)` → annualized × √252 × 100
- `obv(closes, volumes)` → cumulative array; trend = sign of linear slope over last 20
- `adx(highs, lows, closes, 14)` → { adx[], plusDI[], minusDI[] }, Wilder smoothing
- `pivots(prevHigh, prevLow, prevClose)` → classic PP/R1-3/S1-3

Each function has a JSDoc header documenting inputs, period semantics, and the formula source.

## Signals (return string[])

Implemented as small predicates on the computed series + last candle:

| Signal | Rule |
|---|---|
| golden_cross / death_cross | ema50 vs ema200 crossover within last 5 bars |
| rsi_oversold / overbought | rsi_last < 30 / > 70 |
| macd_bullish/bearish_crossover | line vs signal crossover within last 3 bars |
| bollinger_squeeze | last bandwidth == min(bandwidth over last ~126 bars) |
| bollinger_breakout_up/down | last close vs last upper/lower band |
| volume_surge | lastVol > 2 × volSMA20 |
| new_52w_high/low | last close ≥ max / ≤ min of last 252 closes |
| above_all_emas / below_all_emas | close vs ema20/50/200 ordering |

## Scoring (0–100)

```
trend       0–30   EMA alignment + slope of EMA50
momentum    0–25   RSI band (40–60 mid = full) + MACD hist sign/magnitude
volatility  0–15   %B near 0.5 best; ATR% reasonableness
volume      0–15   ratio vs SMA20, OBV trend sign
signals     0–15   +3 per bullish signal, –3 per bearish, clamp 0–15
```
Final = round, clamped 0–100. `trend` field mirrors `indicators.trend.direction`.

## Output

Exactly the schema in the spec (current_price = last close, computed_at = `new Date().toISOString()`, data_range from first/last candle dates).

## Deploy + smoke test

1. Deploy `compute-technicals` via `supabase--deploy_edge_functions`.
2. Call via `supabase--curl_edge_functions` for RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK.
3. Render markdown table: Symbol | Price | RSI | Trend | Signals | Score.

## Out of scope

- No DB writes / caching (pure compute).
- No Dhan fallback (FinEdge alone gives 13y per Task 2.0).
- No TanStack server function wrapper yet — added when Brain orchestrator lands.
