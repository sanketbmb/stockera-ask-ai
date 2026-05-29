# Plan: `compute-fundamentals` Edge Function

Second Brain module. Mirrors `compute-technicals` shape: single Deno file, calls `finedge-fetch` server-to-server, pure-JS math with JSDoc, deterministic 0–100 score.

## Files

1. **`supabase/functions/compute-fundamentals/index.ts`** (new) — handler + all formulas
2. **`supabase/config.toml`** — register `[functions.compute-fundamentals] verify_jwt = true`

## Handler flow

```
POST { symbol }
  → CORS / OPTIONS
  → validate symbol
  → Promise.all 5 finedge-fetch calls (company-profile, ratios pr,
     financials pl, financials bs, financials cf — all consolidated)
  → normalize each payload (unwrap data.data, tolerate quotes/data/rows arrays)
  → guard: <3 annual rows of P&L+BS → { success:false, error:"INSUFFICIENT_HISTORY" }
  → compute valuation, profitability, growth, financial_health
  → compute Piotroski, Altman Z, Graham, simple DCF
  → detect signals → score → verdict
  → return spec JSON
```

Errors mirror compute-technicals:
- Any finedge call !ok or `success !== true` → `{ success:false, error:"DATA_FETCH_FAILED", details }`
- Insufficient history → `INSUFFICIENT_HISTORY`
- Thrown → 500 `INTERNAL_ERROR`
- Every field individually wrapped in `safe(() => …)` so a missing line item nulls one metric instead of failing the whole response.

## Data fetch (parallel)

Reuse the same auth pattern (`SUPABASE_URL` + service-role key fallback, forward caller's `Authorization`):

```
finedge-fetch { endpoint: "company-profile",  symbol }
finedge-fetch { endpoint: "ratios",     symbol, params: { statement_type:"c", ratio_type:"pr" } }
finedge-fetch { endpoint: "financials", symbol, params: { statement_type:"c", statement_code:"pl", period:"annual" } }
finedge-fetch { endpoint: "financials", symbol, params: { statement_type:"c", statement_code:"bs", period:"annual" } }
finedge-fetch { endpoint: "financials", symbol, params: { statement_type:"c", statement_code:"cf", period:"annual" } }
```

Normalizer probes common FinEdge keys (`data`, `rows`, `items`, `ratios`, `profitloss`, `balancesheet`, `cashflow`) and sorts ascending by fiscal year so index `-1` is the latest year.

A small `pick(row, ...aliases)` helper resolves field names case-insensitively against the row, since FinEdge uses snake/camel mixed keys (e.g. `net_income`/`netProfit`, `total_assets`/`totalAssets`). The whole alias map lives at the top of the file for SEBI auditability.

## Formulas (pure JS, JSDoc on each)

**Valuation**
- `pe = price / eps_ttm` (prefer ratios.pe if provided; else compute)
- `pb = price / bvps`
- `ps = market_cap / revenue_ttm`
- `peg = pe / (eps_cagr_3y * 100)` (guard div0 / negative growth → null)
- `ev_ebitda = (market_cap + total_debt - cash) / ebitda` (null if EBITDA missing)
- `dividend_yield` from ratios

**Profitability**
- `roe = net_income / shareholders_equity * 100`, plus 3y avg
- `roa = net_income / total_assets * 100`, plus 3y avg
- `roce = ebit / (total_assets - current_liabilities) * 100`
- `net_margin = net_income / revenue * 100`
- `operating_margin = operating_income / revenue * 100`
- `gross_margin = gross_profit / revenue * 100`

**Growth**
- `yoy(latest, prev) = (latest - prev) / |prev| * 100`
- `cagr(end, start, years) = (end/start)^(1/years) - 1` — returns null if either ≤ 0 (sign-flip undefined)
- Series for revenue, net profit, EPS

**Financial Health**
- `debt_equity = total_debt / equity`
- `current_ratio = current_assets / current_liabilities`
- `quick_ratio = (current_assets - inventory) / current_liabilities`
- `interest_coverage = ebit / interest_expense`
- `debt_to_assets = total_debt / total_assets`

**Piotroski F-Score** (9 binary checks, one function per check, return both score and breakdown):
```
1 netIncome[-1] > 0
2 roa[-1] > 0
3 cfo[-1] > 0
4 cfo[-1] > netIncome[-1]
5 longTermDebt[-1] < longTermDebt[-2]
6 currentRatio[-1] > currentRatio[-2]
7 sharesOutstanding[-1] <= sharesOutstanding[-2]
8 grossMargin[-1] > grossMargin[-2]
9 assetTurnover[-1] > assetTurnover[-2]    // revenue / avg assets
```

**Altman Z-Score** (public-company formula exactly as specified):
```
A = (currentAssets - currentLiabilities) / totalAssets
B = retainedEarnings / totalAssets
C = ebit / totalAssets
D = marketCap / totalLiabilities
E = revenue / totalAssets
Z = 1.2A + 1.4B + 3.3C + 0.6D + 1.0E
zone = Z>3 SAFE | Z>=1.8 GREY | else DISTRESS
```

**Graham Number**
```
graham = sqrt(22.5 * eps_ttm * bvps)   // null if either ≤ 0
graham_vs_price_pct = (graham - price) / price * 100
```

**Simple DCF** (only if ≥5 yrs CF; else null)
```
fcf0 = freeCashFlow[-1]                    // operating CF − capex
project 5 years at g=10%, terminal g=4%, WACC=12%
PV = Σ fcf_t / (1+WACC)^t + terminal / (1+WACC)^5
intrinsic_per_share = PV / sharesOutstanding
```

All constants (g=0.10, terminal=0.04, WACC=0.12) defined as named consts at top of file.

## Signals

Each predicate is a one-liner against computed fields. Includes everything in the spec: `high_roe`, `strong_growth`, `low_debt`, `high_debt`, `improving_margins`, `cheap_pe` (vs 5y avg of historical PE if available; sector P/E may be missing — degrade gracefully), `expensive_pe`, `graham_undervalued`, `graham_overvalued`, `altman_safe`, `altman_distress`, `high_piotroski`, `low_piotroski`, `consistent_profit` (net_income > 0 in last 5 yrs), `dividend_paying`.

When a required input is null, the signal is simply not emitted (never crashes).

## Score (0–100)

```
profitability   0–25   ROE band + margin band (gradual, not step)
growth          0–20   revenue_cagr_3y + profit_cagr_3y (clamped)
financial_health 0–20  D/E inverse + current ratio + Altman zone
valuation       0–20   P/E reasonableness + Graham gap
quality         0–15   piotroski_f_score / 9 × 15
```
Round, clamp 0–100.

**Verdict bands:** ≥75 `STRONG_FUNDAMENTALS`, ≥60 `GOOD`, ≥40 `AVERAGE`, else `WEAK`.

## SEBI-defensibility

- No black-box weights — every score sub-component is the result of a named, documented formula.
- Every formula has a JSDoc block with the textbook source (Piotroski 2000, Altman 1968, Graham 1973, standard DCF).
- Inputs that fall back to null are reported as null in the output rather than imputed.

## Out of scope

- No DB writes / caching.
- No sector P/E lookup table (signals using sector avg simply require it; otherwise omitted).
- No TanStack server function wrapper yet.

## Deploy + smoke test

1. `supabase--deploy_edge_functions ["compute-fundamentals"]`
2. `supabase--curl_edge_functions` for RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK
3. Print: `Symbol | P/E | ROE | D/E | F-Score | Z-Score | Signals | Score`
