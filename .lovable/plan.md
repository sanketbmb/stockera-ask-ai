## Plan: Rotate Dhan secrets, apply IDX_I migration, validate Risk module

### Step 1 — Rotate Dhan credentials
- Call `secrets--update_secret` for `DHAN_CLIENT_ID` and `DHAN_ACCESS_TOKEN` so the user can paste:
  - `DHAN_CLIENT_ID` = `1111831735`
  - `DHAN_ACCESS_TOKEN` = new JWT (exp ~Nov 2026, partner-issued long-lived token — explains the unusual validity)

### Step 2 — Re-apply `stock_master` migration
Single migration that:
1. Drops and re-creates `stock_master_segment_check` to allow `IDX_I` (and keep `NSE_EQ`, `BSE_EQ`, `NSE_FNO`, `BSE_I`).
2. Seeds 8 benchmark indices (idempotent `ON CONFLICT (symbol) DO UPDATE`):

| symbol | dhan_security_id | exchange | segment | type |
|---|---|---|---|---|
| NIFTY | 13 | NSE | IDX_I | INDEX |
| BANKNIFTY | 25 | NSE | IDX_I | INDEX |
| NIFTYIT | 27 | NSE | IDX_I | INDEX |
| NIFTYAUTO | 35 | NSE | IDX_I | INDEX |
| NIFTYPHARMA | 31 | NSE | IDX_I | INDEX |
| NIFTYFMCG | 23 | NSE | IDX_I | INDEX |
| NIFTY100 | 17 | NSE | IDX_I | INDEX |
| SENSEX | 51 | BSE | IDX_I | INDEX |

### Step 3 — Auth probe (LTP)
`supabase--curl_edge_functions` → `dhan-fetch` POST `{endpoint:"ltp", securityId:"2885", exchangeSegment:"NSE_EQ"}` → expect RELIANCE last price. If 401/DH-810 → escalate token format.

### Step 4 — Index probe (Historical)
`dhan-fetch` POST `{endpoint:"historical", securityId:"13", exchangeSegment:"IDX_I", params:{instrument:"INDEX", fromDate:<T-40d>, toDate:<today>, interval:"1D"}}` → expect ~25–30 daily candles for NIFTY 50.

### Step 5 — Run compute-risk for 5 stocks
Sequentially curl `compute-risk` for RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK and tabulate:

```
Symbol     | Bench    | Vol% | Beta | Sharpe | MaxDD% | VaR95% | Score | Class
```

### Diagnostic gates
- ✅ Proceed to Task 2.4 if: LTP returns real price; NIFTY historical ≥20 candles; all 5 stocks return numeric Beta in 0.7–1.3 band; ICICIBANK Sharpe ≥ 0.
- ⚠️ Halt if: any Beta is `null` (benchmark fetch / alignment bug), Beta outside [0, 3], or LTP returns DH-810/401.

### Files touched
- `supabase/migrations/<ts>_allow_idx_i_seed_benchmarks.sql` (new)
- No code edits expected — `dhan-fetch` and `compute-risk` already updated in prior turn.

Approve to execute.
