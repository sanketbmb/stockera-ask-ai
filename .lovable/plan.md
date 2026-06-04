# Mission 5.0 — Partial Plan (audits + safe-phase queue)

> Mode note: I'm in PLAN mode, so I have not written any code in this turn — including the "safe" phases. Approve this plan and I'll execute the safe queue (Part 1) in one BUILD pass, then wait again before touching Stock Picker / SL widening.

## 1. Safe-phase build queue (will execute on approval)

Phase 4 — Error surfacing

- File: `src/lib/error-capture.ts` (extend) + every `toast.error("Unknown")` call site in `src/components/query/QueryForm.tsx`, `src/components/report/*`, `src/lib/*.functions.ts` callers.
- Map Postgres codes: 23514 → "Value not allowed", 42501 → "Permission denied", 23502 → "Missing required field", 23505 → "Duplicate", PGRST116 → "Not found".
- Always `console.error(JSON.stringify({code, message, details, hint}))`.

Phase 2A — Glossary +30 concepts

- Edit `src/content/educational-glossary.ts` and `src/lib/concept-alias-map.ts`. Strict additive (no rename).

Phase 2B — Concept LLM fallback

- New `src/lib/concept-infer.functions.ts` mirroring `sector-infer.functions.ts`: Gemini Flash, 8s timeout, `response_format: json_object`, LRU(100) in-module map + daily counter persisted via `audit_events` (`event_type='concept_infer_call'`) capped at 500/day.
- Remove red "Not recognized" toast in `QueryForm.tsx`; add green "Concept inferred by AI" badge when `source==='llm'`.

Phase 2C — EducationalReport UI upgrade

- Edit `src/components/report/EducationalReport.tsx` + `EducationalHero.tsx`: Hero, Quick Definition, Formula, How to Calculate, How to Interpret, When to Use, Common Pitfalls, Indian-stock Example (pulled from glossary `appears_in`), Related Concepts chips, Ask Follow-up CTA. No verdicts.

Phase 3A — Verdict suppression (no math change)

- Edit `src/lib/freeze-report.functions.ts` (freeze layer only): map `reasoning_code` → verdict override:
  - `TRENDING_DOWN` + `fresh_entry` → `WAIT_FOR_CLARITY`, strip `trade_plan.entry/sl/t1/t2`.
  - `_ZONE_INVERTED_FALLBACK` → `MONITOR`, strip levels.
  - `SHORT_CORRECTIVE_LOW_CONVICTION` → `WAIT_FOR_CLARITY`, strip levels.
- `compute-trade-plan/index.ts` untouched (per guardrails).

Intent Router extension (dark)

- Edit `src/lib/intent-router-schema.ts`: add `"stock_picker"` to `RouterIntentEnum`; keep `toFormIntent` mapping to `"other"` for now.
- Edit `src/lib/intent-router.functions.ts` system prompt: add stock_picker description + keywords ("which stock to buy", "best stock for intraday", "top picks", "recommend stocks"). No UI chip yet.

Verification per phase: `bun run check-forbidden-vocab`, build pass, smoke test one educational query + one stock-picker-phrased query (router only, returns `other`).

## 2. Stock Picker audit answers

A) Data persistence audit (verified live)

- `compute-fundamentals/index.ts` — NO `insert/upsert` to any per-stock table. Output returned to caller only.
- `compute-technicals/index.ts` — reads `ltp_cache`; does NOT persist its own pillar output.
- `compute-momentum/index.ts` — NO persistence calls.
- `compute-risk/index.ts` — NO persistence calls. (`risk_compute_meta` stores run metadata, not per-stock scores.)
- Only persistence of pillar scores: `queries.ai_report` (jsonb), per user query, written by `generate-stock-analysis` → `freeze-report.functions.ts`.

B) Read-without-recompute path

- None. There is no per-stock latest-scores table or view. The only read path is `SELECT ai_report FROM queries WHERE stock_symbol=$1 ORDER BY frozen_at DESC LIMIT 1`, which yields whatever the last user happened to ask — sparse, biased, sometimes stale by weeks.

C) Strategy choice — **Strategy 1: pre-warmed nightly score table** (recommended)

- Justification: B confirms zero read-without-recompute path; Strategy 2 gives <10% NSE coverage and skews to popular tickers; Strategy 3 still requires on-demand compute which violates "no overload" guardrail. Strategy 1 is the only one that delivers consistent results inside Part 3(E) budget.
- New table `public.stock_picker_scores` (one row per symbol × horizon × style; nightly rebuild). Picker reads only this table.
- New edge function `warm-stock-picker-scores` (cron 22:00 IST) iterates a curated universe of ~500 liquid NSE symbols (sourced from `stock_master` filtered by liquidity flag, fallback to a hardcoded Nifty 500 seed list in `src/data/backtest-universe.ts`).
- Acceptable staleness: 1 trading day. UI surfaces "Scores as of &nbsp; close".

D) Weighting profiles — **picker-only, NOT engine weights**

- The 30/25/20/15/10 split from the prior prompt is invented. It does NOT match `intraday_v1 / short_v1 / medium_v1 / long_v1` profiles in `src/lib/weighting-profiles.ts`.
- Plan: define `PICKER_WEIGHTS_V1` in a NEW file `src/lib/picker-weights.ts` with banner comment `// Picker-only weights v1. NOT engine weighting-profiles. Do not confuse.` Engine profiles remain untouched.

E) Recommend-stocks budget

- Max universe scanned: 500 symbols (read from `stock_picker_scores` for the requested horizon/style only → ~500 rows max).
- Max DB read calls per picker request: 2 (one indexed SELECT + one `stock_master` join).
- External API calls per request: 0.
- p95 latency target: < 1.5s (cached table read + in-memory ranking).
- Cron `warm-stock-picker-scores`: max 500 symbols × 1 horizon batch per night; rate-limited to ≤ 5 parallel compute calls; hard 30-min wall clock; on overrun, partial result is acceptable (table tracks `warmed_at` per row).

## 3. Engine SL widening audit (Phase 3B/3C)

F) Engine touch impact

- `SHORT_PULLBACK_S1_DMA20` confirmed at `supabase/functions/compute-trade-plan/index.ts:665` (`reasoning_code` literal). SL math lives in the same branch above the reasoning_code assignment.
- Downstream SL consumers: `generate-stock-analysis/index.ts` (wraps trade_plan into ai_report), `freeze-report.functions.ts` (freezes), `compute-trade-plan` itself (RR computation), `run-backtest/index.ts` (uses SL for hit-rate stats), all report renderers (`StockAnalysisReport.tsx`, addendum cards), print routes, PDF.
- ENGINE_VERSION today: `"trade_plan_v3_regime_aware"` (line 25). Plan: bump to `"trade_plan_v3.1_sl_widened"` ONLY when the widening flag is on; gate behind `const SL_WIDEN_V31 = Deno.env.get("SL_WIDEN_V31") === "1"`. Old rows keep their `engine_version` literal so historical backtest results are immutable.

G) Backtest re-run feasibility

- Live DB shows `backtest_run_summary`: 1 completed, 2 failed. No stalled rows currently — both stalled runs from the prior message are already marked `failed`. Pilot can proceed without cleanup work.
- Plan: launch a fresh 45-case pilot under `engine_version='trade_plan_v3.1_sl_widened'`; compare hit-rate vs latest `completed` v3 run.

H) Roll-back gate

- Single env var `SL_WIDEN_V31`. Off ⇒ identical to v3 behavior (no code path change because the widening multiplier is `flag ? 1.30 : 1.00`). Removing the env var fully reverts. No DB migration needed for rollback.

## 4. Proposed Stock Picker implementation (revised)

New files / DB:

- Migration: `CREATE TABLE public.stock_picker_scores (symbol text, horizon text, style text, final_score numeric, components jsonb, warmed_at timestamptz, PRIMARY KEY(symbol,horizon,style));` + grants (`service_role` ALL, `authenticated` SELECT) + RLS (`SELECT` true to authenticated).
- New edge fn: `supabase/functions/warm-stock-picker-scores/index.ts` (cron-triggered, signed via `SEED_CRON_SECRET`).
- New server fn: `src/lib/stock-picker.functions.ts` → `freezeOrReadStockPicker` (reads `stock_picker_scores`, applies `PICKER_WEIGHTS_V1`, returns top-5 with RR ratio).
- New weights file: `src/lib/picker-weights.ts` (clearly labeled picker-only).
- New UI: `src/components/query/StockPickerForm.tsx`, `src/components/report/StockPickerReport.tsx`.
- New print route: `src/routes/print-stock-picker.$queryId.tsx`.
- Persistence: reuse `queries` row with `query_type='other'`, `engine_version='v1_stock_picker'`, payload in `ai_report.schema_version='v1_stock_picker'`. No new query_type enum needed.
- Output schema (ai_report): `{ schema_version, horizon, style, rr_min, picks: [{symbol, name, sector, final_score, rr, components, scores_as_of}], universe_size, generated_at, disclaimer }`.
- UI: StockPickerForm (chip+horizon+style+RR slider+sector multi-select) and StockPickerReport (5 cards w/ score breakdown, "Scores as of …", SEBI disclaimer, "Open full analysis" link per ticker → existing analysis route).
- PDF: reuse existing `pdf.functions.ts` with new print route.
- Feature flag: `ENABLE_STOCK_PICKER` in `src/lib/feature-flags.ts`, default OFF. Chip in `QueryForm` and router → form mapping both gated on this flag.

## 5. Proposed engine SL widening plan (revised)

- Diff (single hunk inside `compute-trade-plan/index.ts` SHORT_PULLBACK branch):
  ```
  const SL_WIDEN_V31 = Deno.env.get("SL_WIDEN_V31") === "1";
  const slMult = SL_WIDEN_V31 ? 1.30 : 1.00;
  sl = entry - (entry - rawSl) * slMult;
  const ENGINE_VERSION_OUT = SL_WIDEN_V31 ? "trade_plan_v3.1_sl_widened" : ENGINE_VERSION;
  ```
- ENGINE_VERSION isolation: emit `ENGINE_VERSION_OUT` on responses; backtest runner stamps it onto `backtest_run_summary.engine_version`.
- Pilot re-run: trigger 45-case backtest under flag ON; compare SL-hit % and T1-hit % side by side.
- Rollback: unset `SL_WIDEN_V31` secret.

## 6. Risks + mitigations


| Risk                                        | Mitigation                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Nightly warmer overruns                     | Per-batch wall-clock cap + per-row `warmed_at`; partial result is valid |
| Picker shows stale stocks                   | Surface `scores_as_of` date in UI                                       |
| Picker weights confused with engine weights | Dedicated `picker-weights.ts` file + banner comment + lint rule grep    |
| SL widening breaks reports                  | Pure flag gate; OFF ⇒ byte-identical output                             |
| Concept-LLM cost spike                      | Daily cap 500 + LRU 100                                                 |
| Removing "Unknown" toast hides real bugs    | Always `console.error` full envelope                                    |


## 7. Execution order

1. (BUILD now on approval) Safe queue — Phase 4, 2A, 2B, 2C, 3A, intent router dark extension.
2. (WAIT for separate "Approved. Proceed to BUILD") Stock Picker — migration → warmer cron → server fn → UI → flag flip in staging.
3. (WAIT same) Engine SL widening — flag-gated diff → pilot backtest → review hit-rate → decide flag flip.

## 8. Open questions

1. Picker universe seed: use `stock_master` liquidity filter (need to confirm column exists) or hardcoded Nifty 500 from `src/data/backtest-universe.ts`?
2. Nightly warmer schedule: 22:00 IST OK, or align with existing `cleanup-ltp-history` window?
3. Concept-infer daily cap 500 — confirm or change?
4. Should the "Concept inferred by AI" badge also log to `audit_events` for QA, or UI-only?  
  
APPROVED WITH CLARIFICATIONS.
  Proceed with Part 1 (Safe-Phase Build Queue) immediately in 
  one BUILD pass.
  Then PAUSE and wait for separate approvals before:
  - Phase 1 (Stock Picker)
  - Phase 3B/3C (SL widening + pilot re-run)
  ANSWERS TO YOUR 4 OPEN QUESTIONS:
  Q1 — Picker universe seed
  LIVE-VERIFIED FACT: stock_master columns are limited to 
  id, symbol, company_name, dhan_security_id, exchange, segment, 
  isin, lot_size, tick_size, updated_at, type. 
  There is NO liquidity flag, NO market cap, NO sector_canonical 
  on stock_master.
  Therefore:
  - Use the hardcoded Nifty 500 seed from 
    src/data/backtest-universe.ts as the picker universe.
  - If that file doesn't exist or is incomplete, create it with 
    the Nifty 500 constituents as a static seed.
  - Sector tagging for the picker must come from 
    sector_aggregates joined by symbol at warming time — NOT 
    from stock_master. If a symbol has no sector_aggregates row, 
    set sector = '__default__' and exclude it from sector-filtered 
    queries.
  - Document this clearly in the warm-stock-picker-scores edge 
    function header comment.
  Q2 — Nightly warmer schedule
  22:00 IST is fine. Do NOT align with cleanup-ltp-history (20:30) 
  because that may still be running. Use 22:00 IST as planned.
  Add a 30-minute wall clock as you already proposed.
  Q3 — Concept-infer daily cap
  500/day is approved. Implement exactly as planned:
  - LRU(100) in-module cache
  - Counter via audit_events (event_type='concept_infer_call')
  - Above 500 → return null and let UI gracefully fall back to 
    glossary suggestions ("Try these instead: …")
  Q4 — "Concept inferred by AI" badge logging
  YES, log to audit_events with event_type='concept_infer_resolved' 
  plus the canonical_name and a hash of the question. 
  This gives us QA telemetry without storing user PII.
  ADDITIONAL CLARIFICATIONS (binding):
  1. Picker sector tagging: warm-stock-picker-scores must call 
     sector_aggregates per symbol during the nightly run and 
     persist sector_canonical inside stock_picker_scores.components 
     jsonb so the picker can sector-filter without runtime joins.
  2. Picker liquidity gate: since stock_master has no liquidity 
     column, the Nifty 500 seed list IS the liquidity gate. 
     Document this assumption in code.
  3. Engine SL widening (Phase 3B):
     The flag-gated diff is correct, but DO NOT build Phase 3B 
     yet. It's still in PLAN. Only build the safe queue (Part 1) 
     in this pass.
  4. Stock Picker (Phase 1):
     Same — DO NOT build yet. Wait for separate approval.
  5. Safe queue regression coverage:
     After building the safe queue, run a quick smoke test on:
     - Sector view paragraph query (must still work)
     - Existing position query (must still work)
     - Averaging query (must still work)
     - Fresh entry on a normal stock (must still work)
     Confirm the 3A verdict-suppression layer doesn't accidentally 
     strip levels from healthy stocks.
  REPORT BACK AFTER SAFE-QUEUE BUILD:
  1. Files changed (full list)
  2. Concept-infer.functions.ts (full content)
  3. New 30 glossary entries (just the canonical names + categories)
  4. Diff summary for freeze-report.functions.ts verdict 
     suppression
  5. Smoke test results for the 4 regression flows above
  6. Confirmation: zero "Unknown" toasts, zero red "Not 
     recognized" toasts visible anywhere
  7. Confirmation: stock_picker is in router enum but 
     toFormIntent → "other" (dark)
  8. Any blockers
  After your report, I will:
  - Audit the safe-queue build
  - Then send a SEPARATE approval to start Stock Picker Phase 1
  - Then send a SEPARATE approval to start SL widening Phase 3B/3C
  Do NOT batch them. Each phase needs its own green light.
  &nbsp;