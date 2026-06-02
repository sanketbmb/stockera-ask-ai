## Phase 3C — Educational Mode MVP

### Step 0 — Glossary Audit (findings)

**No dedicated educational glossary file exists yet.** Two approved internal sources qualify as the seed:

1. `src/lib/metric-copy.ts` — `METRIC_COPY` map. Per-metric `measures` / `how` / `scale?` / `interpretation?` / `formula?`. Beginner-friendly, already shipped in card tooltips.
2. `src/content/architecture-encyclopedia.ts` — `MODULES[]` with authoritative `formulas[]`, `outputs`, `failure`, `tiers`, `references`. Authoritative, technical.

**Concept coverage from approved sources (no fabrication):**

| Concept | metric-copy | encyclopedia (formula / module map) | Mapping (Stockera card) | MVP completeness |
|---|---|---|---|---|
| RSI | indirect (via card_intraday_trend_levels) | ✓ formula, compute-technicals | Trend & Structure | **Compact** (def from encyclopedia, no dedicated metric-copy line) |
| MACD | indirect | ✓ formula, compute-technicals | Trend & Structure | **Compact** |
| EMA | indirect | ✓ (stack 20/50/200) | Trend & Structure | **Compact** |
| ADX | indirect | ✓ formula | Trend & Structure | **Compact** |
| Bollinger Bands | indirect | ✓ formula | Trend & Structure | **Compact** |
| ATR | ✓ formula in card_intraday_microstructure | ✓ used in compute-trade-plan | Intraday Microstructure / Trade Levels | **Full** |
| VWAP | ✓ m_vwap | ✓ formula | Intraday Microstructure | **Compact** (note: live feed pending) |
| Piotroski F-Score | ✓ m_piotroski (def + scale) | ✓ formula | Light Fundamentals / Business Quality | **Full** |
| Altman Z-Score | — | ✓ formula | Light Fundamentals | **Compact** |
| DCF | — | ✓ formula, fallback ladder | Valuation & Fair Value | **Compact** |
| Beta | ✓ m_beta (def + interp) | ✓ formula | Risk Profile | **Full** |
| Sharpe Ratio | ✓ m_sharpe (def + interp) | ✓ formula | Risk Profile | **Full** |
| Sortino Ratio | — | ✓ formula | Risk Profile | **Compact** |
| Max Drawdown | ✓ m_max_dd | ✓ formula | Risk Profile | **Full** |
| VaR | — | ✓ formula | Risk Profile | **Compact** |
| Relative Strength | ✓ m_rs_vs_nifty | ✓ formula (compute-momentum) | Momentum & RS | **Full** |
| Volume Confirmation | ✓ m_volume_profile | ✓ formula (Jegadeesh-Titman) | Momentum & RS | **Full** |
| Promoter Holding | ✓ m_promoter_holding | — | Business Quality | **Full** |
| PE Ratio | ✓ m_pe_ratio | — | Light Fundamentals | **Full** |

**MVP concept allowlist (16 supported):** RSI, MACD, EMA, ADX, Bollinger Bands, ATR, VWAP, Piotroski F-Score, Altman Z-Score, DCF, Beta, Sharpe Ratio, Max Drawdown, Relative Strength, Volume Confirmation, Promoter Holding.

**Degraded (rendered "Compact" — definition + formula + Stockera mapping only, no worked example, no common-mistakes):** Sortino, VaR.

**Why-it-matters / Common-mistakes / Worked-example:** Not present in approved sources for most concepts. Per the brief's deterministic-content rule, these sections will be **omitted cleanly** when source-backed content is unavailable, with a "Worked example coming in v1.1" placeholder allowed since the brief explicitly permits it.

**Difficulty tag (deterministic, per brief):**
- Beginner: RSI, EMA, VWAP, ATR, PE Ratio, Promoter Holding, Volume Confirmation
- Intermediate: MACD, ADX, Bollinger Bands, Beta, Relative Strength, Max Drawdown
- Advanced: Piotroski F-Score, Altman Z-Score, DCF, Sharpe Ratio, Sortino, VaR

### Decision: bootstrap a single structured glossary file

Create `src/content/educational-glossary.ts` as the single, auditable system of record. Each entry composed **only** from `METRIC_COPY` + `MODULES` content already in the repo. No new prose is invented; the composer only re-arranges and labels existing approved strings. A small `common_mistake` field is allowed when it can be lifted verbatim from an existing `interpretation` string ("RSI > 70 alone is not a sell signal", etc.), otherwise the section is omitted.

### Files

**New**
- `src/content/educational-glossary.ts` — 16 entries, typed `GlossaryEntry`.
- `src/lib/concept-alias-map.ts` — case-insensitive resolver with shorthand/typo tolerance, returns `{ canonical, confidence, suggestions[] }`.
- `src/lib/educational-context.ts` — pure deterministic composer: takes `(canonical, rawQuestion)` → `EducationalReportArtifact`.
- `src/lib/educational-report.functions.ts` — `freezeOrReadEducationalReport` serverFn mirroring `freezeOrReadSectorReport` (engine_version `v1_educational`, engine_source `glossary_library`, persists into `queries.ai_report`, calls credit-metering with new `post_query_educational` no-charge event under noop_dev_mode).
- `src/components/report/EducationalReport.tsx` — outer shell (Navbar, ReflectiveBanner, EducationalHero, ConceptBrief, softened CTA, audit footer). No score ring, no trade levels, no addenda.
- `src/components/report/EducationalHero.tsx` — concept name, one-line def, Difficulty chip, "Educational only" trust label.
- `src/components/report/ConceptBrief.tsx` — sections A-G rendered only when source-backed; missing sections drop silently.
- `src/components/report/ConceptNotFoundPanel.tsx` — fallback with up to 5 closest supported concepts.
- `supabase/migrations/<ts>_educational_additive.sql` — additive: `concept_canonical TEXT NULL`, `educational_difficulty TEXT NULL` on `public.queries` (+ no policy changes; existing GRANTS untouched).
- `docs/phase-3c-verification.md` — 8-case verification matrix.

**Modified**
- `src/lib/feature-flags.ts` — add `ENABLE_EDUCATIONAL = true`; extend `isRoutableIntent` and `visibleIntents()` to include `"educational"` when flag on. Other stays gated.
- `src/components/query/QueryForm.tsx` — render Educational chip when flag on; when selected, swap Symbol/BuyPrice fields for a single concept text box with helper copy `"Ask about a concept like RSI, MACD, DCF, Beta, or Relative Strength"`; on submit resolve alias, insert query row with `query_type='educational'`, `concept_canonical`, `educational_difficulty`, then navigate to `/report/:id`.
- `src/routes/report.$queryId.tsx` — branch: `if (qt === 'educational') return <EducationalReport ... />`. Keep `"other"` on `RoutedPendingPanel`. Add `educational` to non-polling list (already conditional, just confirm).
- `src/components/report/RoutedPendingPanel.tsx` — drop educational from its handled copy (only other remains).
- `src/lib/credit-metering.ts` — add `post_query_educational` event (no-charge under noop_dev_mode).
- `src/lib/pdf.functions.ts` — include `query_type` + `concept_canonical` in cache key; bump `PDF_TEMPLATE_VERSION`.
- `src/routes/print.$symbol.tsx` — no change (educational uses queryId, not symbol). If a print route is needed for educational, add `src/routes/print.educational.$queryId.tsx` reusing the same shell.
- `src/integrations/supabase/types.ts` — regenerated after migration (automated).

### Routing & freeze flow

```text
/post-query
  ├─ explicit chip "Educational" ──┐
  └─ free-text → router → educational ┘
            │
            ▼ resolve alias (concept-alias-map)
            │  ├─ resolved   → insert query (query_type='educational', concept_canonical, educational_difficulty)
            │  └─ unresolved → insert query with concept_canonical=null
            ▼
       navigate /report/:queryId
            ▼
       EducationalReport
         ├─ concept_canonical present → freezeOrReadEducationalReport (composes from glossary, persists ai_report on first read)
         └─ concept_canonical null    → ConceptNotFoundPanel (no freeze, preserves query, shows 5 suggestions)
```

Freeze contract identical to Sector View:
- engine_version `v1_educational`, engine_source `glossary_library`
- `report_artifact_status = 'frozen'`, `frozen_at = now()`
- subsequent visits read `queries.ai_report` verbatim

### Report UX (deterministic composition)

Reflective banner reuses existing `ReflectiveBanner` with `interpretation = { intent: "educational", concept_name }`, and shows `Auto-routed via free-text router · confidence: <high|medium>` when `router_meta?.source === 'free_text_router'`.

Hero: concept name + one-line def (from `METRIC_COPY[measures]` or first sentence of encyclopedia `outputs`), Difficulty chip, "Educational only" trust label. No verdict, no ring, no price.

ConceptBrief renders only the sections that have source-backed content:
- **What it means** — `measures` line
- **Why it matters** — derived from `MODULES[].purpose` (one-liner). Omitted if no mapping.
- **How to read it** — `how` + `scale` + `interpretation` from METRIC_COPY (composed verbatim, joined with `· `)
- **Worked example** — placeholder card `"Worked example coming in v1.1"` (brief-approved).
- **Where it appears in Stockera** — chip list derived from `MODULES[].outputs` containing this concept's name; chips are informational only (no deep links in MVP).
- **Common mistakes** — only when a deterministic line exists (e.g. "Beta > 1.3 means amplified market moves; < 0.7 means defensive" surfaces a common misread). For most concepts: omitted.
- **Related concepts** — siblings from the same `MODULES[]` entry (e.g. RSI → MACD, EMA, ADX, Bollinger Bands). Cap at 5.

Softened CTA: `"Try this concept on a real stock query"` linking to `/post-query`. AnalystCtaCard not reused.

Audit footer: engine_version, engine_source, concept_canonical, educational_difficulty, frozen_at, educational-only disclaimer + existing SEBI line.

### Forbidden-vocab compliance

Glossary file passes existing `scripts/check-forbidden-vocab.mjs` (no "guaranteed/sure shot/predict/forecast/promise/definitely/100%"). All content is copy-of-existing-approved-strings, which already passed lint.

### Verification matrix (`docs/phase-3c-verification.md`)

8 cases per brief: 5 supported (RSI, MACD, Piotroski, Altman Z, Relative Strength), 1 unknown ("explain xyzwave"), 1 PDF render, 1 regression matrix (Fresh Entry / Existing Position / Averaging / Sector View — all unchanged).

### What is intentionally NOT touched

Brain modules, orchestrator, sector_aggregates, generate-stock-analysis, generate-ai-report edge fn, Fresh/Sell-Hold/Averaging/Sector report renderers, "Other" chip, multilingual, voice, paid path. No LLM call at request time anywhere in the Educational path.
