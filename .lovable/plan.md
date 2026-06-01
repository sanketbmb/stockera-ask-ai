
# Stockera Architecture & Brain Encyclopedia — Build Plan

A single premium, SEBI-defensible PDF that documents the entire AI Report Brain end-to-end. Rendered as a React printable route and exported through the existing server-side Puppeteer / @sparticuz/chromium pipeline (same pipeline that powers the stock report PDF).

## Deliverables

1. **New printable route**: `/docs/architecture/print` — full-bleed, print-optimized, A4 pagination via CSS `@page` rules and `page-break-*` utilities.
2. **New React component**: `src/components/docs/ArchitectureEncyclopedia.tsx` — composes 12 sections from small subcomponents (one per section) so the file stays maintainable.
3. **Admin export entry**: `/admin/exports` route with a "Download Architecture PDF" action. Internal-only (gated by existing admin auth). Hits the existing PDF server function with the new printable URL.
4. **PDF naming**: `Stockera_Architecture_Encyclopedia_v{DOC_VERSION}_{YYYYMMDD}.pdf` (e.g. `Stockera_Architecture_Encyclopedia_v1.0_20260601.pdf`).
5. **Versioning constants** in `src/lib/doc-version.ts`: `DOC_VERSION`, `FORMULA_VERSION`, `MODEL_VERSION` — surfaced in footer + filename.

## Page structure (12 sections, in order)

1. Cover + SEBI line + ToC
2. End-to-End Architecture Flow (sequence diagram + per-step table)
3. APIs & Data Sources (FinEdge, Dhan, Marketaux, Supabase, Claude, Gemini) — rate limits, costs, failure behavior
4. Database Schema essentials (7 tables)
5. Brain Modules Deep — 8 modules incl. trade-plan SL formulas + fallback ladder + banking-adjusted long-term-quality
6. Verdict + Confidence — frozen weight table, bucket_v1, confidence engine
7. Tier-Specific Composition — included/excluded matrix per tier
8. Trade Levels Explained — worked examples for RELIANCE / TCS / HDFCBANK / ICICIBANK (numbers pulled at generation time from live orchestrator? → **see open question 1**)
9. Audit Trail surface (full `audit_meta` field reference)
10. Live vs Roadmap (two columns)
11. Cost & Scaling posture (reference)
12. Glossary

Expected length: **~28–36 pages** at A4. Final page count surfaced after first render and tuned (typography scale, section breaks).

## Design system

- **Palette**: deep navy `#0B1B2B`, ivory `#F5F1E8`, gold accent `#C9A24C`, charcoal text `#1A1A1A`, muted rule `#D8D2C2`. Added as scoped CSS vars on the print route only (does not leak into app tokens).
- **Typography**: editorial pair — `Instrument Serif` (display) + `Inter Tight` (body) + `JetBrains Mono` (formulas, audit fields). Already aligned with our existing report aesthetic.
- **Layout primitives**: section cover pages, drop-cap intros, two-column body for dense sections, full-bleed tables for weights/buckets/APIs, sequence diagram as inline SVG, footnote rule per page.
- **Footer (every page)**: `Stockera · SEBI RA INH000019071 · Doc v{X} · Formula v{Y} · Model v{Z} · Generated {ISO} · Page N/M`
- **Cover marks**: "Curated by Stockera", SEBI registration, standard disclaimer block.

## Technical approach

- Pure presentational React. **No** orchestrator/Brain/PDF-pipeline changes — content is sourced from existing frozen constants:
  - `src/lib/weighting-profiles.ts` → Section 6 weight table (single source of truth, no duplication)
  - `src/lib/action-buckets.ts` → Section 6 bucket thresholds
  - `src/lib/regression-baseline.ts` → Section 9 audit surface
  - `src/lib/metric-copy.ts` → Section 12 glossary entries cross-checked
  - `src/types/stock-analysis.ts` → Section 9 audit_meta field list
- All other prose (architecture descriptions, formulas, tier matrices, roadmap) lives in a new content module `src/content/architecture-encyclopedia.ts` so copy can be edited without touching layout.
- Sequence diagram in Section 2: hand-authored inline SVG (no mermaid runtime in print bundle) — clean vector for crisp PDF.
- Page breaks via `@media print { .page-break { break-before: page } }` and per-section wrappers.
- Printable route excluded from public sitemap / robots.

## Files to create

```
src/routes/docs.architecture.print.tsx
src/routes/admin.exports.tsx
src/components/docs/ArchitectureEncyclopedia.tsx
src/components/docs/sections/01_ExecutiveSummary.tsx
src/components/docs/sections/02_ArchitectureFlow.tsx
src/components/docs/sections/03_DataSources.tsx
src/components/docs/sections/04_Schema.tsx
src/components/docs/sections/05_BrainModules.tsx
src/components/docs/sections/06_VerdictConfidence.tsx
src/components/docs/sections/07_TierComposition.tsx
src/components/docs/sections/08_TradeLevels.tsx
src/components/docs/sections/09_AuditTrail.tsx
src/components/docs/sections/10_LiveVsRoadmap.tsx
src/components/docs/sections/11_CostScaling.tsx
src/components/docs/sections/12_Glossary.tsx
src/components/docs/parts/{Cover,ToC,Footer,SequenceDiagram,WeightTable,BucketTable,ApiTable,TierMatrix,FormulaBlock}.tsx
src/content/architecture-encyclopedia.ts
src/lib/doc-version.ts
src/styles/print-encyclopedia.css
```

## Files to modify

- `src/routeTree.gen.ts` → auto-regenerated, do not hand-edit.
- Existing PDF server function (if it takes a URL/slug parameter): add `'architecture'` to its allow-list. If it currently hard-codes the analysis route, extend it with a `kind: 'analysis' | 'architecture'` discriminator — minimal, additive change. **See open question 2.**

## Verification

After first render:
1. Spot-check Brain module list against `supabase/config.toml` function registry.
2. Confirm weight table matches `WEIGHTING_PROFILES` constants verbatim (single import, no manual copy).
3. Trade-plan fallback ladder text matches `compute-trade-plan/index.ts` switch ordering.
4. Tier matrix included/excluded lists match `compute-intraday-microstructure` + `compute-long-term-quality` field outputs.
5. Generate PDF once; QA every page via `pdftoppm` and inspect for overflow / clipped tables.

## Open questions before I build

1. **Section 8 worked examples** — pull live numbers from a real orchestrator call at generation time (dynamic, always-current), or hard-code captured snapshots dated in the doc (deterministic, audit-stable)? Recommend **captured snapshots** for auditability.
2. **PDF pipeline shape** — is the existing PDF function URL-parameterized (any printable route works), or hard-wired to `/print/$symbol`? If hard-wired, I'll add a minimal `kind` discriminator. Will inspect `src/lib/pdf.functions.ts` first thing in build mode.
3. **Admin export page scope** — just the architecture PDF button for now, or scaffold it as a generic exports hub (audit CSV, regression baselines, etc.) we can grow into? Recommend **architecture-only for this task**, hub later.

Will proceed with the recommended defaults unless you say otherwise.
