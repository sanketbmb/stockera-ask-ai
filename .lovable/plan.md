
# Phase 3B — Sector View MVP

## Step 0 — Data Audit (sector_aggregates)

**Columns (18):** `sector, sector_canonical (NOT NULL), sector_display, source, method_version, bootstrap_source_reference, pe_median (NOT NULL), pe_p25, pe_p75, pb_median, roe_median, pe_avg_5y, pe_low_5y, pe_high_5y, return_12m_median_pct, sample_size (NOT NULL), updated_at, as_of_timestamp`.

**Row count:** 37. Every row has `source = 'bootstrap'` (synthetic baseline, not a live aggregate from real constituents — this affects disclosure copy).

**Null audit (populated / 37):**
| Field | Populated | % |
|---|---|---|
| pe_median | 37 | 100% |
| return_12m_median_pct | 32 | 86% |
| pb_median | 11 | 30% |
| **roe_median** | **0** | **0%** |
| **pe_avg_5y** | **0** | **0%** |
| **pe_low_5y / pe_high_5y** | **0** | **0%** |
| **sample_size > 0** | **0** | **0%** (all 0) |

**Distinct canonical sectors (33 user-facing + 2 default rows):**
`__default__, default, agriculture, auto_components, automobile, banks, capital_goods, cement, chemicals, construction, consumer_discretionary, consumer_staples, diversified, energy, engineering, financial_services, fmcg, healthcare, information_technology, infrastructure, it_services, it_software, media, metals_mining, oil_gas, petroleum_products, pharmaceuticals, power, private_sector_bank, public_sector_bank, real_estate, services, software_services, telecom, textiles, utilities` (sample — full list rendered from query).

**Sample rows:**
- `private_sector_bank` → pe_median 16, pb_median 2.4, roe_median NULL, pe_avg_5y NULL, sample_size 0, return_12m_median_pct NULL
- `it_services` → pe_median 25, pb_median 7, roe_median NULL, pe_avg_5y NULL, sample_size 0, return_12m_median_pct NULL

### Conditional build decisions (locked from audit)

| Card | Decision |
|---|---|
| Card A — Valuation Snapshot | **Render** with `pe_median` (always), `pb_median` when present, p25/p75 range when present. Drop 5Y line. |
| Card B — Profitability Snapshot | **Drop** (roe_median 0/37). Replace with placeholder card: *"Sector ROE & quality breadth coming in v1.1 — current view uses valuation-only signals."* |
| Card C — Historical Context | **Drop** (5Y fields 0/37). Use locked Step 0 placeholder copy. |
| Card D — What This Means | **Render** with deterministic copy derived from `pe_median` and `return_12m_median_pct`. |
| Coverage line | Always show *"Coverage: limited"* (sample_size 0). |
| 12m return chip | New optional micro-stat in Card A footer when `return_12m_median_pct` present (non-promissory framing: "Trailing 12m peer-set median return"). |

### Macro state — which branch actually runs

With 5Y avg and ROE both 100% null, **every sector falls into the PE-only extension branch**:
- Constructive: `pe_median ≤ 20`
- Cautious: `pe_median > 40`
- Balanced: otherwise

Sample outputs from current data:
- `private_sector_bank` (PE 16) → **Constructive**
- `public_sector_bank` (PE 8) → **Constructive**
- `it_services` (PE 25) → **Balanced**
- `pharmaceuticals` (PE 28) → **Balanced**
- `fmcg` (PE 45) → **Cautious**
- `consumer_staples` (PE 45) → **Cautious**
- `energy` (PE 13) → **Constructive**

Bootstrap-source disclosure will be added to the hero subtext so we don't overstate precision: *"Baseline sector profile · live constituent aggregation rolling out in v1.1."*

---

## Implementation

### Feature flags & routing
- `src/lib/feature-flags.ts` — add `ENABLE_SECTOR_VIEW = true`; extend `visibleIntents()` to include `sector_view` whenever `ENABLE_SECTOR_VIEW` OR `ENABLE_PHASE3_QUERY_TYPES` is true; extend `isRoutableIntent` similarly; keep `educational` gated.
- `src/components/query/QueryForm.tsx` — expose Sector View chip; when chip is active, swap the main textarea helper copy to *"Enter a sector like Private Banks, IT, Energy, Pharma"*; on submit with `sector_view`, resolve sector via alias map → canonical; if unresolved, keep form on Step 1 with inline clarification (don't submit). No new heavy picker.
- `src/routes/report.$queryId.tsx` — in the routed-pending branch, split `sector_view` out to `<SectorViewReport />`; `other` + `educational` stay on `RoutedPendingPanel`.
- `src/components/report/RoutedPendingPanel.tsx` — remove `sector_view` from its handled set (defensive; primary gate is the dispatcher).

### New files
- `src/lib/sector-alias-map.ts` — case-insensitive alias resolver returning the canonical sector slug that exists in `sector_aggregates` (verified against Step 0 list). Reuses/extends `src/lib/sector-aliases.ts` (already partially populated). Adds Hinglish + plural variants. Exports `resolveSector(raw): { canonical, display } | null` and `SUPPORTED_SECTORS` (top 8 for fallback chips).
- `src/lib/sector-context.ts` — pure deterministic composer (mirrors `position-context.ts`). Given a `sector_aggregates` row, returns:
  ```
  { macro_state, macro_state_inputs, valuation_card, profitability_placeholder,
    historical_placeholder, what_this_means, action_buckets, audit_meta }
  ```
  Pure function, no LLM, no network. Round PE to 1dp, ROE to 1dp.
- `src/lib/sector-report.functions.ts` — `createServerFn` `freezeOrReadSectorReport({ queryId })` with `requireSupabaseAuth`. Reads the query row; on first call: resolves canonical sector, loads `sector_aggregates` row, composes via `sector-context`, writes the composed payload into `queries.ai_report` plus `frozen_at`, `report_artifact_status = 'frozen'`, `engine_version = 'v1_sector_view'`, `engine_source = 'sector_aggregates'`. On subsequent calls returns the frozen payload. Routes through existing `credit-metering` utility; in `noop_dev_mode` logs a no-charge `credit_action` for `sector_view`.
- `src/components/report/SectorSummaryHero.tsx` — hero with one of three states (`Constructive | Balanced | Cautious`) or `Coverage Limited` empty state. Plain-English 2–3 line explanation derived from the same inputs.
- `src/components/report/SectorMetricGrid.tsx` — 4-card grid. Cards B & C use the locked v1.1 placeholders. Reuses existing card primitives + tokens from `StockAnalysisReport`.
- `src/components/report/SectorViewReport.tsx` — top-level variant. Shell parity with stock report: `Navbar`, max-w container, `ReflectiveBanner` (sector interpretation + optional auto-routed note from `router_meta`), header (canonical name title-cased, horizon, `as_of_timestamp`, "SEBI-aligned sector overview" label), `<SectorSummaryHero />`, `<SectorMetricGrid />`, deterministic action-buckets section, "Top names in this sector" placeholder, `AnalystCtaCard` with sector copy, `SEBIDisclaimer`, audit footer block. Calls `freezeOrReadSectorReport` via `useServerFn` + `useQuery`.

### PDF
- `src/lib/pdf.functions.ts` — extend `generateAnalysisPdf` (or add `generateSectorPdf` if the existing API is too stock-shaped) so:
  - cache key includes `query_type | engine_version | sector_canonical | horizon` (currently keyed by symbol+horizon — would collide).
  - bump `PDF_TEMPLATE_VERSION` constant so old cached stock PDFs can't ever match.
  - print route renders `<SectorViewReport static />` when the row is `sector_view`.
- `src/routes/print.$symbol.tsx` (or sibling print route) — add a sector branch keyed by `query_type === 'sector_view'`; filename pattern `Stockera_Sector_<SECTOR>_<HORIZON>_<YYYY-MM-DD>.pdf`.

### Migration (additive only)
`supabase/migrations/<ts>_sector_view_additive.sql`:
```sql
ALTER TABLE public.queries
  ADD COLUMN IF NOT EXISTS sector_canonical TEXT,
  ADD COLUMN IF NOT EXISTS sector_macro_state TEXT;
```
No RLS / grant changes (existing policies cover). All other state lives inside `ai_report` JSONB + `router_meta`.

### Audit footer (parity with stock report)
Fields: `engine_version, engine_source, as_of_timestamp, sector_canonical, macro_state, macro_state_inputs (pe_median, pb_median, return_12m_median_pct, sample_size), method_version, bootstrap_source_reference, sebi_reg_line, "Past performance does not guarantee future results"`.

### Forbidden-vocab safety
All new copy reviewed against `scripts/check-forbidden-vocab.mjs`. Banned: guaranteed, sure shot, predict, forecast, promise, definitely, 100%, Bullish, Bearish. Hero copy uses "may", "tends to", "currently looks", "warrants caution".

### Safe fallbacks
- Unknown / unresolved sector → graceful card with `SUPPORTED_SECTORS` chips (top 6 canonical from audit: Private Sector Bank, Public Sector Bank, IT Services, Energy, Pharmaceuticals, FMCG). "Try one of these sectors" inline.
- Resolved canonical missing from `sector_aggregates` (shouldn't happen post-validation, defensive) → same graceful state + console warning for analytics.
- Both `pe_median` and `roe_median` null on a row → `macro_state = "Coverage Limited"`, hero shows empty-state copy (impossible with current data but logic kept for v1.1).

---

## Verification (docs/phase-3b-verification.md)

Matrix of 6 cases (case → expected dispatch → expected macro state → render notes):

1. *"Which private bank stocks look strongest?"* → free-text router → `sector_view / private_sector_bank` → **Constructive** → full grid, no stock picks.
2. *"How does the IT sector look right now?"* → free-text router → `sector_view / it_services` → **Balanced** → Card C shows v1.1 placeholder.
3. Chip + "Energy" → `sector_view / energy` → **Constructive** → full grid.
4. *"How is the spaghetti sector doing?"* → router classifies sector_view but alias resolver fails → graceful fallback w/ supported chips, query row preserved, no crash.
5. PDF for `private_sector_bank` → downloads, audit footer intact, no SL/T1/T2, filename `Stockera_Sector_Private_Sector_Bank_medium-term_<date>.pdf`.
6. Regression: RELIANCE Fresh Entry, ICICIBANK Existing Position, Suzlon Averaging → all unchanged (no shared code paths modified beyond dispatcher branch).

---

## Files (final list)

**New:** `src/lib/sector-alias-map.ts`, `src/lib/sector-context.ts`, `src/lib/sector-report.functions.ts`, `src/components/report/SectorViewReport.tsx`, `src/components/report/SectorSummaryHero.tsx`, `src/components/report/SectorMetricGrid.tsx`, `supabase/migrations/<ts>_sector_view_additive.sql`, `docs/phase-3b-verification.md`.

**Modified:** `src/lib/feature-flags.ts`, `src/components/query/QueryForm.tsx`, `src/routes/report.$queryId.tsx`, `src/components/report/RoutedPendingPanel.tsx`, `src/lib/pdf.functions.ts`, `src/routes/print.$symbol.tsx` (or new sector print route), `src/lib/sector-aliases.ts` (extend with new variants only).

**Untouched:** Brain modules, stock orchestrator, Phase 2 addenda, wallet logic, legacy report path, educational/other routing.

## Key honesty call-out

`sector_aggregates.source = 'bootstrap'` for every row, and `sample_size = 0` everywhere. The hero subtext and audit footer will explicitly label this as a baseline profile, not live constituent aggregation. This is the truthful version of the MVP given current data — better than implying precision we don't have.

## Blockers before Phase 3C
None. The PE-only macro path renders cleanly for all 33 user-facing sectors. v1.1 follow-ups (real ROE, 5Y range, live sample_size) are explicitly flagged in placeholders.
