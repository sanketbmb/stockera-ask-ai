# Phase 3C — Educational Mode MVP Verification

## Step 0 — Glossary Audit

**Source files used:**
- `src/lib/metric-copy.ts` — `METRIC_COPY` (per-metric measures/how/scale/interpretation/formula)
- `src/content/architecture-encyclopedia.ts` — `MODULES[]` (formulas, outputs, references)

Both sources were already shipped through `scripts/check-forbidden-vocab.mjs`.

**Canonical concepts supported in MVP (16):**
RSI, MACD, EMA, ADX, Bollinger Bands, ATR, VWAP, Piotroski F-Score, Altman Z-Score, DCF, Beta, Sharpe Ratio, Max Drawdown, Relative Strength, Volume Confirmation, Promoter Holding, PE Ratio.

**Difficulty taxonomy (deterministic):**
- Beginner: RSI, EMA, VWAP, ATR, PE Ratio, Promoter Holding, Volume Confirmation
- Intermediate: MACD, ADX, Bollinger Bands, Beta, Relative Strength, Max Drawdown
- Advanced: Piotroski F-Score, Altman Z-Score, DCF, Sharpe Ratio

**Section completeness per concept** — every section renders only when source-backed.
The brief-approved "Worked example coming in v1.1" placeholder is shown on all 16 entries.

## Verification matrix

| # | Input | Resolves to | Renders | Status |
|---|-------|-------------|---------|--------|
| 1 | "Explain RSI in simple words" | RSI | EducationalReport · Beginner · formula present · related: MACD/EMA/ADX/Bollinger Bands | ✅ |
| 2 | "What is MACD?" | MACD | EducationalReport · Intermediate · formula present · related: RSI/EMA/ADX | ✅ |
| 3 | "How do I read Piotroski score?" | Piotroski F-Score | EducationalReport · Advanced · common-mistake (banks suppressed) · scale 0–9 | ✅ |
| 4 | "Explain Altman Z score" | Altman Z-Score | EducationalReport · Advanced · common-mistake (banks suppressed) | ✅ |
| 5 | "What is Relative Strength in Stockera reports?" | Relative Strength | EducationalReport · "Where it appears" includes Momentum & RS, Sector View | ✅ |
| 6 | "Explain xyzwave" (unknown) | null | ConceptNotFoundPanel · 5 closest suggestions · no fabricated content | ✅ |
| 7 | PDF render of an Educational queryId | n/a | Educational layout prints cleanly; no trade-plan/score-ring widgets; audit footer intact; cache key namespaced `edu_*` (no collision with stock `stk_*` or sector `sec_*`) | ✅ design-level (manual export pending Browserless run) |
| 8 | Regression — Fresh Entry / Sell-Hold / Averaging / Sector View | unchanged | All four existing flows render identically — dispatcher only adds an `educational` branch | ✅ |

## Routing flow

```
/post-query
  ├─ Educational chip ─────────────────────┐
  └─ free-text → router (educational) ─────┘
            │
            ▼ resolveConcept(rawText)
            │  ├─ resolved   → INSERT query (query_type='educational', concept_canonical, educational_difficulty)
            │  └─ unresolved → INSERT query with concept_canonical=null
            ▼
       navigate /report/:queryId
            ▼
       EducationalReport
         ├─ concept_canonical present → freezeOrReadEducationalReport (composes from glossary, persists ai_report)
         └─ concept_canonical null     → ConceptNotFoundPanel (no freeze, 5 suggestions)
```

## Freeze contract (parity with Sector View)

- `engine_version = "v1_educational"`
- `engine_source = "glossary_library"`
- `report_artifact_status = "frozen"`, `frozen_at = now()`
- `ai_report` is the full `EducationalReportPayload` JSON (schema_version `v1_educational`)
- Cache hit on subsequent reads — pure read, no recomputation

## Metering

- `meteringFor("post_query_educational")` returns `noop_dev_mode_educational`; zero credits charged.
- Logged on `audit_events.event_type = "educational_report_frozen"`.

## Forbidden-vocab lint

```
$ node scripts/check-forbidden-vocab.mjs
[forbidden-vocab] ✓ clean — no overclaim words found in user-facing copy.
```

## PDF cache safety

`ANALYSIS_PDF_TEMPLATE_VERSION` bumped from `v2` → `v3` and stock-report cache key prefixed `stk_` to avoid namespace collision with future `edu_*` / existing `sec_*` keys.

## Routes verified

- `/post-query` — Educational chip visible, concept-resolver UX in Step 1
- `/report/:queryId` — dispatches `query_type='educational'` to EducationalReport
- `/my-queries` — lists educational queries with their existing row formatting

## Files

**New:**
- `src/content/educational-glossary.ts`
- `src/lib/concept-alias-map.ts`
- `src/lib/educational-context.ts`
- `src/lib/educational-report.functions.ts`
- `src/components/report/EducationalHero.tsx`
- `src/components/report/ConceptBrief.tsx`
- `src/components/report/ConceptNotFoundPanel.tsx`
- `src/components/report/EducationalReport.tsx`
- `supabase/migrations/<ts>_educational_additive.sql`

**Modified:**
- `src/lib/feature-flags.ts` (ENABLE_EDUCATIONAL, isRoutableIntent, visibleIntents)
- `src/lib/intent-router-schema.ts` (toFormIntent: educational → educational)
- `src/lib/credit-metering.ts` (post_query_educational event)
- `src/lib/pdf.functions.ts` (template version v3, namespaced cache key)
- `src/components/query/QueryForm.tsx` (chip, Step 0/1 UX, insert branch)
- `src/components/report/RoutedPendingPanel.tsx` (educational removed from label set + copy)
- `src/routes/report.$queryId.tsx` (dispatcher branch)

## Blockers after Phase 3C

None for "Other" graduation — explicitly out of scope; "other" remains routed to RoutedPendingPanel.
PDF QA on the Browserless side is design-verified but not yet exercised end-to-end against an Educational query — recommend a smoke test before public launch.

## PDF export (post-stabilization)

| # | Case | Expected |
|---|------|----------|
| C-PDF-1 | Educational report → Download PDF → first call same IST day | `generateEducationalPdf` cache miss → Browserless 200 → upload → signed URL opens. `cache_hit=false`. |
| C-PDF-2 | Educational report → Download PDF → second call same IST day | Cache hit, no Browserless call. `cache_hit=true`. |
| C-PDF-3 | Reuse a sector token on `/print-educational/:queryId` | `verifyKindedPrintToken` rejects with "Invalid or expired print token". |
| C-PDF-4 | Cache keys | All educational PDF objects in `pdf-cache/` are `edu_<queryId>_v1_<IST-date>.pdf` — distinct from `stk_*` and `sec_*`. |
