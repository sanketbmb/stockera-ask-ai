# Stage 4A.2b — Final APPLY-ready plan

## C1 — `long_term_quality_snapshot` key audit

Live keys (queried from INFY cache row):

```
fcf_yield, roe_5y_avg, eps_cagr_5y, roce_5y_avg, quality_label,
piotroski_f_score, margin_trend_label, promoter_holding_pct,
data_completeness_pct, debt_to_equity_current, market_share_trend_label,
earnings_consistency_label, long_quality_composite_banking
```

✅ Zero recommendation-shaped fields. No `staggered_plan`, `entry_zone`, `target_price`, `action`, `stop_loss`, `verdict`, or prose. Subtree is safe to pass through as-is.

## C2 — `final_verdict` field-by-field disposition


| Field            | Whitelisted?                            |
| ---------------- | --------------------------------------- |
| `overall_score`  | ✅ keep                                  |
| `risk_label`     | ✅ keep                                  |
| `time_horizon`   | ✅ keep                                  |
| `action`         | ❌ drop                                  |
| `summary_reason` | ❌ drop                                  |
| `verdict_reason` | ❌ drop                                  |
| `confidence_pct` | ❌ drop (confirmed per your instruction) |


## C3 — `derivation='sector_fallback'` reachability

Live and reachable. Source:

- `supabase/functions/generate-stock-analysis/index.ts:502` — `buildSectorFallbackFundamental()` sets `derivation: "sector_fallback"` and populates `sector_fallback_meta { sector_display, sample_size, pb_ratio }`.
- `supabase/functions/generate-stock-analysis/index.ts:1047–1065` — trigger: `(fundFetchFailed || snapEmpty) && (sector || industry)`. Compute-fundamentals fetch failure OR an empty snapshot (all of pe/roe/piotroski/altman/dcf null) plus known sector/industry both fire it.

The "NO DATA" chip rules in the new cards are not dead code. Currently no cached row exhibits the state only because pre-warm has run against liquid names where compute-fundamentals returned data. B5's forced IREDA compute will produce a live sector-fallback row.

## C4 — `audit_meta` trade-planning fields

All of the following are **explicitly dropped** by the new whitelist and never reach the browser:

```
tier_guardrails, horizon_shaping, entry_strategy, entry_strategy_code,
targets_meta, source_trace, trade_plan_flag, trade_plan_source,
trade_plan_vol_1y, trade_plan_validation, trade_plan_engine_version,
regime, regime_inputs, entry_anchor, regression_drift, regression_baseline,
volume_confirmation, volume_confirmation_method, volume_confirmation_reason,
overall_score_raw, overall_score_pre_carveout,
tier_applied, tier_modules_added_version,
symbol_resolution, modules_invoked, confidence_band, confidence_breakdown,
action_bucket_thresholds, verdict_model_version, fundamental_fallback,
risk_as_of, momentum_as_of, sentiment_as_of, technical_as_of, fundamental_as_of,
long_term_quality_diagnostic, intraday_microstructure_diagnostic
```

Only these 7 `audit_meta` keys pass: `formula_version, weighting_profile_id, action_bucket_version, tier_weights, dcf_status, dcf_method_used, banking_override_applied, banking_override_reason`.

---

## ALLOWED FILES (7)

1. `supabase/functions/stock-overview/index.ts` — rewrite `analytics` projection to the new whitelist.
2. `src/components/stock-overview/types.ts` — update `PublicAnalyticsPayload` interface.
3. `src/components/stock-overview/AnalyticsTab.tsx` — drop reference to removed `final_verdict.action` badge; no other consumer changes (still passes long_term_quality_snapshot).
4. `src/components/stock-overview/analytics-cards/ScoreRingBlock.tsx` — remove action pill, keep ring + pillar bars.
5. `src/components/stock-overview/analytics-cards/BusinessQualityCard.tsx` — add sector-fallback chip, banking-carveout chip, "NO DATA" chips for Piotroski/Altman/DCF when derivation='sector_fallback' or `dcf_status ∈ {DCF_UNAVAILABLE, DCF_SKIPPED}`; hide (not em-dash) rows whose values are null when derivation is null.
6. `src/components/stock-overview/analytics-cards/ValuationFairValueCard.tsx` — read `audit_meta.dcf_status`; hide DCF row unless `DCF_OK`; suppress "Fair"/"Premium" label when sector-fallback and label empty (render "Sector-based valuation only").
7. `src/components/stock-overview/analytics-cards/RiskProfileCard.tsx` — read `flags.benchmark_fallback_used` (chip) and `score_breakdown.risk_score`; hide null-metric rows instead of em-dash.

`LongTermReturnsCard.tsx` no longer needs edits (whitelist keeps `long_term_quality_snapshot`).

---

## Whitelist diff for `stock-overview` `analytics` projection

### ADD (fields not projected today)

- `final_verdict.risk_label`
- `final_verdict.time_horizon`
- `momentum_snapshot` (entire subtree — DB has it; not projected today)
- `audit_meta.weighting_profile_id`
- `audit_meta.action_bucket_version`
- `audit_meta.dcf_status`
- `audit_meta.dcf_method_used`
- `audit_meta.banking_override_applied`
- `audit_meta.banking_override_reason`

### KEEP (already projected)

- `stock`, `as_of_date`, `score_breakdown`, `returns_snapshot`, `fundamental_snapshot` (with its own `derivation` / `sector_fallback_meta`), `risk_snapshot`, `sentiment_snapshot`, `long_term_quality_snapshot`, `flags`, `audit_meta.formula_version`, `audit_meta.tier_weights`.

### DROP (currently projected → remove)

- `final_verdict.action`

### NEVER PROJECTED (confirm remain excluded)

- `levels`, `user_context`, `query_context`, `price_context`, `report_modules`, `technical_snapshot`, `intraday_microstructure_snapshot`, and all trade-planning `audit_meta.*` fields listed in C4.
- Also `final_verdict.summary_reason`, `final_verdict.verdict_reason`, `final_verdict.confidence_pct`.

Return `analytics: null` when no cache row (unchanged).

---

## Pre-UAT deploy actions

1. Deploy `stock-overview` (rewritten projection).
2. Deploy client bundle (types + 5 card/tab files).
3. **Seed IREDA sector-fallback row** — authenticated `public-analysis-fetch` call for `symbol=IREDA`, `exchange=NSE`, `compute=true`. Verify the resulting `stock_analytics_cache` row has `payload->'fundamental_snapshot'->>'derivation' = 'sector_fallback'`. Abort UAT if not — investigate before proceeding.

---

## UAT matrix (10 tests)


| #   | Anchor   | Surface                                                                      | Assertion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | IREDA    | `/stock/IREDA` Analytics tab                                                 | BusinessQualityCard shows chip "Sector-derived fallback · company fundamentals unavailable · sector: {sector_display}. Only sector medians shown; company-level quality scores withheld." Piotroski/Altman/DCF rows each render "NO DATA" sub-chip. P/E and ROE rows show sector-median values with "· sector median (n={sample_size})".                                                                                                                                                                                |
| 2   | IREDA    | `/stock/IREDA` Analytics tab                                                 | ValuationFairValueCard shows sector-median P/E labeled "sector median (n=…)". No "Fair"/"Premium" pill when `valuation_label` is missing; instead "Sector-based valuation only". DCF row hidden (dcf_status ≠ DCF_OK).                                                                                                                                                                                                                                                                                                  |
| 3   | IREDA    | `/stock/IREDA` Analytics tab                                                 | RiskProfileCard renders beta / vol_1y / sharpe / max_drawdown when present. Any null metric row is entirely absent (no em-dash). If `flags.benchmark_fallback_used === true`, chip "Benchmark fallback active — beta/RS derived vs proxy index" appears.                                                                                                                                                                                                                                                                |
| 4   | INFY     | `/stock/INFY` Analytics tab                                                  | Large-cap regression: BusinessQualityCard, ValuationFairValueCard, RiskProfileCard all render with real values, no sector-fallback chip, no NO-DATA chips. ScoreRingBlock shows composite score and pillar bars but **no action pill** under the ring.                                                                                                                                                                                                                                                                  |
| 5   | HDFCBANK | `/stock/HDFCBANK` Analytics tab                                              | If cached payload's `flags.banking_override_applied === true`, BusinessQualityCard renders chip "Banking carve-out applied — {banking_override_reason}". If flag is false, chip absent.                                                                                                                                                                                                                                                                                                                                 |
| 6   | INFY     | Anonymous `curl -X POST /functions/v1/stock-overview` with `{symbol:"INFY"}` | JSON response contains `analytics` but does NOT contain: `final_verdict.action`, `final_verdict.summary_reason`, `final_verdict.verdict_reason`, `final_verdict.confidence_pct`, any `levels`, `intraday_microstructure_snapshot`, `technical_snapshot`, `user_context`, `query_context`, `price_context`, `report_modules`, and `audit_meta.{tier_guardrails,horizon_shaping,entry_strategy,targets_meta,source_trace,trade_plan_*,regime,entry_anchor,…}`. `audit_meta` keys reduced to the 8 whitelisted names only. |
| 7   | IREDA    | Anonymous `curl` `/functions/v1/stock-overview` `{symbol:"IREDA"}`           | `analytics.fundamental_snapshot.derivation === "sector_fallback"` and `sector_fallback_meta.sector_display`, `sample_size`, `pb_ratio` are all populated (or explicit nulls where sector_aggregates lacks them).                                                                                                                                                                                                                                                                                                        |
| 8   | IREDA    | `/report/{id}` for any existing IREDA AI report                              | Visually identical to pre-4A.2b (StockAnalysisReport.tsx untouched; regression check on the paid page).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 9   | repo     | `git diff package.json package-lock.json`                                    | Empty. No npm dependency changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 10  | repo     | `tsgo --noEmit`                                                              | Clean. `supabase/migrations/` untouched (no schema/RLS delta).                                                                                                                                                                                                                                                                                                                                                                                                                                                          |


---

STOP HERE for founder APPLY. On approval I will:

1. Rewrite `stock-overview/index.ts` `analytics` block.
2. Update `types.ts` interface.
3. Edit the 4 cards + `AnalyticsTab.tsx`.
4. Deploy `stock-overview`.
5. Trigger the IREDA seed compute.
6. Report back with the anonymous-curl `analytics` payload for INFY + IREDA and a screenshot of `/stock/IREDA` Analytics tab for founder UAT sign-off.  
  
APPROVED with 2 final corrections before APPLY.
  CORRECTION 1 — IREDA seed compute
  Do NOT introduce a new `compute=true` request parameter unless it already exists in the live `public-analysis-fetch` contract.
  Use the existing authenticated on-demand path that is already implemented (the same one protected by the 401 + 5/day guard).
  If a force-refresh is required, only use an already-supported parameter/path; otherwise use a symbol with no cache row yet or another deterministic fallback symbol.
  No API-contract expansion in this patch.
  CORRECTION 2 — Valuation card fallback behavior
  Tighten the fallback rule:
  - If `fundamental_snapshot.derivation === "sector_fallback"`, ALWAYS suppress the company-style valuation pill/label `Fair`, `Premium`, `Overvalued`, etc.) even if `valuation_label` is present in the payload.
  - In fallback mode, always render:
    - sector-median P/E with sample size
    - "Sector-based valuation only"
  - Do NOT present sector-derived valuation_label as a company-specific fair-value conclusion.
  Everything else in the Stage 4A.2b plan is approved as-is.
  Please return the final APPLY-ready plan with:
  1. the `compute=true` wording removed unless already supported and explicitly confirmed,
  2. the valuation fallback rule tightened as above,
  3. confirmation that file scope remains exactly 7 files,
  4. confirmation that `final_verdict.action` is removed from both server response and UI,
  5. confirmation that `long_term_quality_snapshot` is retained,
  6. confirmation that a deterministic fallback symbol will be seeded for UAT using the existing authenticated path.
  Then STOP for founder APPLY.
  &nbsp;