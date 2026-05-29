
# Plan: `compute-risk` Edge Function

Third Brain module. Same shape as `compute-technicals` / `compute-fundamentals`: single Deno file, server-to-server `finedge-fetch` calls, pure-JS math with JSDoc + academic references, deterministic 0–100 score. **Higher score = safer**.

## Files

1. **`supabase/functions/compute-risk/index.ts`** (new) — handler + all formulas
2. **`supabase/config.toml`** — register `[functions.compute-risk] verify_jwt = true`

## Constants (top of file, SEBI-auditable)

```
RISK_FREE_RATE        = 0.071   // 10-yr G-Sec yield, India 2026
TRADING_DAYS_PER_YEAR = 252
LOOKBACK_DAYS         = 750     // ~3 yrs
MIN_DAYS_REQUIRED     = 252     // 1 yr hard floor
EPSILON               = 1e-9    // divide-by-zero guard
BENCHMARK_FALLBACKS   = ["NIFTY", "NIFTY50", "^NSEI", "SENSEX"]
```

## Handler flow

```
POST { symbol, benchmark? }
  → CORS / OPTIONS
  → validate symbol
  → fetch stock daily-quotes (parallel with first benchmark attempt)
  → if benchmark fails, walk BENCHMARK_FALLBACKS sequentially
  → normalize OHLCV (reuse the same patterns as compute-technicals:
     unwrap data.data, accept data/quotes/rows arrays, sort asc by date)
  → guard: stock candles < MIN_DAYS_REQUIRED → INSUFFICIENT_HISTORY
  → align stock & benchmark by date intersection
  → compute daily returns for both series
  → compute every metric block (each safe()-wrapped → null on failure)
  → detect signals
  → compute risk_score + classification
  → return spec JSON
```

Error envelope mirrors the other two modules:
- finedge !ok / success≠true → `{ success:false, error:"DATA_FETCH_FAILED", details }`
- < MIN_DAYS_REQUIRED after alignment → `INSUFFICIENT_HISTORY`
- all benchmark fallbacks fail → `BENCHMARK_UNAVAILABLE` (the rest of the report can still be returned with `market_risk: null`; emit a warning field rather than failing the whole call)
- thrown → 500 `INTERNAL_ERROR`

## Helpers

- `pick(row, ...aliases)` — case-insensitive field resolver (reused pattern)
- `safe(fn)` — try/catch → null
- `mean`, `stdev`, `variance`, `covariance`, `pearson` — textbook formulas, all guard `n>1` and use EPSILON
- `dailyReturns(closes)` — `(c[i] - c[i-1]) / c[i-1]`
- `alignByDate(stockRows, benchRows)` — intersection on ISO date, returns paired arrays

## Metric blocks (each formula carries a JSDoc with source)

**A. Volatility** (Hull, *Options, Futures and Other Derivatives*)
- `daily_pct = stdev(returns) * 100`
- `annualized_pct = stdev(returns) * sqrt(252) * 100`
- `rolling_30d_pct`, `rolling_90d_pct` — stdev of the last 30 / 90 returns
- `trend` = compare rolling_30d vs rolling_90d: `>+10%` INCREASING, `<-10%` DECREASING, else STABLE

**B. Beta + correlation** (CAPM, Sharpe 1964)
- `beta = cov(stock, bench) / var(bench)` on the last 252 aligned returns
- classification: `>1.3 HIGH | ≥0.8 NORMAL | else LOW`
- `correlation_with_nifty = pearson(stock, bench)`
- `r_squared = corr^2`

**C. Risk-adjusted returns**
- `annualized_return = (1 + mean(returns))^252 - 1`
- `sharpe = (annRet - RF) / annVol` — Sharpe 1966
- rating: `>2 EXCELLENT | ≥1 GOOD | ≥0.5 AVERAGE | else POOR`
- `sortino = (annRet - RF) / downsideDeviation` where downsideDeviation = stdev of `min(r-RF/252, 0)` × √252 — Sortino & Price 1994
- `calmar = annRet / |maxDrawdown|` — Young 1991

**D. Drawdown** (standard peak-to-trough)
- Walk the close series tracking running max; `dd_t = (close_t - peak_t) / peak_t`
- `max_drawdown_pct`, `current_drawdown_pct` (from all-time high)
- `avg_drawdown_pct` over all in-drawdown days
- `recovery_days` = days from max-DD trough back to a new peak (null if not yet recovered)
- `drawdown_duration_days` = length of the max-DD episode (peak → trough)

**E. Value at Risk** — historical method (Jorion, *Value at Risk*)
- Sort returns ascending
- `var_95_pct = -percentile(returns, 5) * 100`
- `var_99_pct = -percentile(returns, 1) * 100`
- `cvar_95_pct = -mean(returns ≤ percentile(returns,5)) * 100`
- `worst_day_pct = min(returns) * 100`
- `best_day_pct = max(returns) * 100`

**F. Liquidity**
- `avg_volume_20d = mean(volume[-20:])`
- `avg_daily_turnover_cr = mean(volume[-20:] * close[-20:]) / 1e7`
- classification: `>100 HIGH | ≥10 MEDIUM | else LOW`

**G. Behavior (last 252 days)**
- `up_days`, `down_days`, `up_day_ratio`
- `max_winning_streak`, `max_losing_streak` (single pass)

## Signals (one-liner predicates, skipped silently if input is null)

`high_volatility` (ann > 35), `low_volatility` (<15), `high_beta` (>1.5), `low_beta` (<0.7), `high_sharpe` (>1.5), `negative_sharpe` (<0), `deep_drawdown` (current >25), `recovery_phase` (5–25 + rolling_30d < rolling_90d), `near_ath` (current DD <5), `high_var` (var95 >3), `low_liquidity` (turnover <10 Cr), `high_correlation` (>0.85), `decoupled` (<0.4), `trending_up` (up_ratio ≥0.6), `trending_down` (up_ratio ≤0.4).

## risk_score (0–100, higher = safer)

```
volatility   0–25   piecewise: ann_vol ≤15→25, 15–25→linear→20, 25–35→linear→10, 35–50→linear→3, >50→0
sharpe       0–25   sharpe ≥2→25, 1–2→linear, 0–1→linear→8, <0→0
drawdown     0–20   |maxDD| ≤10→20, 10–25→linear→12, 25–40→linear→5, >40→0
beta normalcy 0–15  band 0.8–1.3 → 15, then linear decay each side, 0 outside [0.3,1.8]
liquidity    0–15   HIGH→15, MEDIUM→9, LOW→3, null→0
```
Round, clamp 0–100. **Classification bands:** `≥75 LOW_RISK | ≥55 MEDIUM_RISK | ≥35 HIGH_RISK | else VERY_HIGH_RISK`.

## SEBI-defensibility

- Every formula has a JSDoc citation (Sharpe 1964/66, Sortino & Price 1994, Young 1991, Jorion *VaR*, Hull *Derivatives*).
- All thresholds defined as named constants at the top of the file.
- Null inputs propagate to null outputs — no imputation, no black-box fallback.

## Out of scope

- No DB writes / caching
- No multi-benchmark blending (single benchmark with fallback chain only)
- No parametric/Monte-Carlo VaR (historical only, per spec)
- No TanStack server function wrapper yet

## Deploy + smoke test

1. `supabase--deploy_edge_functions ["compute-risk"]`
2. `supabase--curl_edge_functions` for RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK
3. Print: `Symbol | Vol% | Beta | Sharpe | MaxDD% | VaR95% | Score | Classification`
4. Note in the reply which benchmark symbol actually resolved (NIFTY vs fallback).
