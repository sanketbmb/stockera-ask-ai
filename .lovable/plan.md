## Task 2.6 — `generate-stock-analysis` orchestrator

Build a new Supabase Edge Function that fans out to the five Brain modules and returns one normalized JSON payload matching the contract you specified. No LLM, no UI, minimal schema churn.

### Files

**New:**
- `supabase/functions/generate-stock-analysis/index.ts` — orchestrator

**No changes** to existing compute-* functions, marketaux-fetch, dhan-fetch, finedge-fetch, or DB schema. (`stock_master` already has symbol/company_name/exchange/segment; sector/industry come from `finedge-fetch` `company-profile` already used by compute-momentum/compute-risk.)

### Flow

1. **Validate input** — `{ symbol, exchange?, query_type?, language?, user_context?, include_news? }`. Default `query_type="medium-term"`, `language="en"`, `include_news=true`. Reject empty symbol.
2. **Resolve stock** — `stock_master` lookup by symbol (normalize to uppercase, strip `.NS`). Capture `company_name`, `exchange`, `segment`. Fetch sector/industry via `finedge-fetch` `company-profile` (best-effort; null on fail → `flags.incomplete_data` stays false unless multiple modules fail).
3. **Fan out in parallel** — `Promise.allSettled` to the five compute modules via `${SUPABASE_URL}/functions/v1/<fn>`, forwarding caller's `authorization` header (fallback `Bearer ${ANON_KEY}`) — same pattern as compute-sentiment. Skip `compute-sentiment` if `include_news=false`.
4. **Normalize** — for each settled-fulfilled response with `success:true`, extract into the snapshot shape. For rejected/`success:false`, leave snapshot fields null and append `{module, status, error}` to `audit_meta.source_trace`.
5. **Compute verdict + final JSON** — see below.
6. **Return** the unified payload (status 200 even when modules degrade; `success:false` only for orchestrator-level failure like unresolved symbol).

### Normalization mapping (compute-* → snapshot)

- **technical** → `technical_snapshot{rsi, macd_signal, trend_label, ema_stack, adx, bollinger_position, vwap_signal}`, `levels{support_1/2, resistance_1/2, entry_zone, stop_loss, target_1/2}`, `price_context{current_price, price_source:"finedge", as_of}`, `score_breakdown.technical_score`.
- **fundamentals** → `fundamental_snapshot{pe_ratio, roe, piotroski_f_score, altman_z_score, dcf_upside_pct, valuation_label}`, `score_breakdown.fundamental_score`. Detect banking from sector → `flags.banking_override_applied=true` when Altman Z is intentionally null.
- **risk** → `risk_snapshot{beta, volatility_1y, sharpe_ratio, sortino_ratio, max_drawdown, var_95, liquidity_label}`, `score_breakdown.risk_score`. If risk module reports benchmark fallback in diagnostics → `flags.benchmark_fallback_used=true`.
- **momentum** → `momentum_snapshot{relative_strength_vs_nifty, trend_strength, volume_confirmation, momentum_label}`, `returns_snapshot{one_week, one_month, three_month, one_year, vs_nifty_one_month, vs_nifty_three_month}`, `score_breakdown.momentum_score`.
- **sentiment** → `sentiment_snapshot{news_sentiment_score, sentiment_label, article_count, top_news_driver}`, `score_breakdown.sentiment_score`. If skipped or NO_NEWS → `flags.news_data_limited=true`, score treated as null (excluded from weighting).
- **audit_meta** — capture each module's `as_of_date`/`metadata.computed_at` and `formula_version`. `source_trace` lists `{module, ok, http_status, latency_ms, code?}`.

Each compute fn has its own field names — orchestrator owns a single `normalize<Module>()` helper that returns the snapshot + score + flags, isolating shape drift.

### Verdict logic (deterministic, no LLM)

```
weights (medium-term default):
  technical 0.25, fundamental 0.25, risk 0.20, momentum 0.20, sentiment 0.10
```
- Build `weighted = Σ(score_i × weight_i)` over **non-null** scores; renormalize weights so missing modules don't penalize blindly.
- Map `overall_score` → `action`: ≥75 BUY · 60–74 HOLD · 45–59 WATCHLIST · 30–44 SELL · <30 AVOID.
- **Guardrails (applied in order):**
  1. `risk_score < 25` → cap action at HOLD (no BUY).
  2. `max_drawdown < -50%` or `beta > 2.0` → demote BUY→HOLD, HOLD→WATCHLIST.
  3. Missing technical OR fundamental → cap at WATCHLIST.
  4. `≥3 of 5` modules missing → action = `AVOID`, `flags.incomplete_data=true`.
- **Confidence** = `100 − (missing_modules × 15) − (guardrail_demotions × 10)`, clamped 20–95.
- `risk_label` derived from risk_score (LOW ≥70, MODERATE 45–69, HIGH 25–44, VERY_HIGH <25).
- `time_horizon` mirrors `query_type` (intraday→"1–5 days", medium-term→"1–6 months", long-term→"12+ months").
- `summary_reason` = deterministic templated string concatenating top driver per pillar (e.g. `"Strong momentum (78), weak fundamentals (42), elevated risk (31)."`). No prose generation.

For non-medium-term `query_type`, swap weight presets:
- intraday: tech 0.45, momentum 0.30, risk 0.20, sentiment 0.05, fundamental 0.0
- long-term: fundamental 0.40, risk 0.20, technical 0.15, momentum 0.15, sentiment 0.10

### `report_modules` defaults

All true except `show_stocks_in_focus=false`. `show_news_widget` follows `include_news && !flags.news_data_limited`.

### Error handling

- Symbol not in `stock_master` → 200 with `{success:false, error:"SYMBOL_NOT_FOUND"}`.
- Orchestrator-level uncaught → 500 with `{success:false, error:"INTERNAL_ERROR", details}`.
- Per-module failure never throws — captured in `source_trace`.
- 25s overall timeout per module call (AbortController) — prevents hanging on slow Marketaux.

### Test plan

After deploy, invoke via `supabase--curl_edge_functions`:
```json
{"symbol":"RELIANCE","query_type":"medium-term"}
{"symbol":"TCS","query_type":"long-term"}
{"symbol":"HDFCBANK","include_news":false}   // banking override path
```
Verify: 200, `success:true`, all five `score_breakdown` populated for RELIANCE/TCS, `banking_override_applied=true` for HDFCBANK, deterministic verdict, `source_trace` complete.

### Deliverables checklist (post-build)

1. What was created — file list
2. What files changed — none beyond the new function
3. How verdict is computed — weight table + guardrail list
4. Test payload examples with actual responses
5. Blockers before 2.6.1 — flagged if any compute-* return shape disagrees with assumptions

### Open question before I build

The output contract has `levels.entry_zone / stop_loss / target_1 / target_2`. `compute-technicals` currently produces support/resistance and likely a swing-based stop, but I haven't confirmed it emits explicit `entry_zone` and `target_1/2`. **Plan:** if those fields aren't already in the technical payload, I'll derive them deterministically here (entry = current_price ± 1% near support; stop = nearest support − 1 ATR; targets = resistance_1, resistance_2) and tag them in `audit_meta.source_trace` as `derived:orchestrator`. OK to proceed with that fallback, or do you want me to push that into `compute-technicals` instead?
