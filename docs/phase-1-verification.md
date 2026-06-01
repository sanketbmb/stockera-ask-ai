# Phase 1 Verification Matrix

Mission 1.5 — Phase 1.1 hardening close-out. This document captures the
acceptance-test matrix for the immutable report artifact, explicit metering,
and forbidden-vocabulary guard.

> Sections A–D require a signed-in browser session. The agent ships the
> deterministic infrastructure (schema, server fns, lint guard); the live
> walk-through must be executed against the published preview and the results
> pasted under each scenario.

---

## Schema changes

```sql
ALTER TABLE public.queries
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_artifact_status TEXT;

CREATE INDEX IF NOT EXISTS idx_queries_frozen_at ON public.queries(frozen_at);
```

`ai_report JSONB` already existed and is reused — no migration of legacy rows.

## Code surfaces touched

| File | Purpose |
| --- | --- |
| `src/lib/credit-metering.ts` | Single source of truth — `meteringFor(path)` |
| `src/lib/freeze-report.functions.ts` | First-call freeze + cache read for v1 rows |
| `src/lib/regenerate-from-legacy.functions.ts` | Now records metering decision via the module |
| `src/routes/report.$queryId.tsx` | Dispatcher reads cached payload; adds frozen badge + 24h stale muting |
| `scripts/check-forbidden-vocab.mjs` | SEBI overclaim-word lint guard |
| `package.json` | Adds `bun lint:vocab` script |

`src/components/analysis/StockAnalysisReport.tsx`, the orchestrator, all Brain
modules, weighting profiles, action buckets, confidence engine, trade plan,
motion, and PDF Puppeteer pipeline are **untouched** in this task.

---

## A — Fresh Entry via `/post-query` (signed-in walk-through)

For each scenario:
- Submit Fresh Entry through the existing 3-step form.
- Capture `queries.id`, then SQL-verify the row and visit the report twice.

| Scenario | Symbol | Horizon | Result |
| --- | --- | --- | --- |
| A1 | RELIANCE | medium-term | _pending live run_ |
| A2 | ICICIBANK | long-term | _pending live run_ |
| A3 | TCS | intraday | _pending live run_ |

Acceptance for each row:
- [ ] `queries.engine_version = 'v1_tier_shaped'`
- [ ] `queries.engine_source = 'post_query'`
- [ ] `queries.horizon` set to the tier
- [ ] First visit: orchestrator invoked once; `queries.ai_report` populated; `queries.frozen_at` stamped; `queries.report_artifact_status = 'frozen'`
- [ ] `ai_report.audit_meta.credit_action = 'noop_dev_mode'`
- [ ] `ai_report.audit_meta.metering_mode = 'noop_dev_mode'`
- [ ] `ai_report.audit_meta.served_from_cache = false`
- [ ] Second visit (hard reload): no orchestrator call (verify via network panel and `audit_events` lack of new `report_frozen` row); `audit_meta.served_from_cache = true`
- [ ] Reflective Banner shows the exact question + interpretation line
- [ ] Fresh Entry Addendum renders entry / SL / T1 / T2 / invalidation
- [ ] SEBI disclaimer banner present
- [ ] Analyst CTA section present at the bottom

SQL probe for any A-row:
```sql
SELECT id, engine_version, engine_source, horizon, frozen_at,
       report_artifact_status,
       ai_report->'audit_meta'->>'credit_action'   AS credit_action,
       ai_report->'audit_meta'->>'metering_mode'   AS metering_mode,
       ai_report->'audit_meta'->>'served_from_cache' AS served_from_cache
FROM public.queries WHERE id = '<uuid>';
```

## B — Direct `/analysis/SYMBOL`

| Scenario | URL |
| --- | --- |
| B1 | `/analysis/RELIANCE?horizon=medium-term` |
| B2 | `/analysis/ICICIBANK?horizon=long-term` |
| B3 | `/analysis/TCS?horizon=intraday` |

Acceptance for each:
- [ ] No row inserted in `queries` (SQL: `SELECT count(*) FROM queries WHERE created_at > now() - interval '5 minutes' AND ...` returns 0)
- [ ] No wallet transaction created
- [ ] Renders the same tier-shaped report component
- [ ] PDF download works and produces the standard filename pattern
- [ ] (Implementation note) `/analysis/SYMBOL` does NOT route through `freezeOrReadReport` — verified by code review in `src/routes/analysis.$symbol.tsx`. Metering action for this path is conceptually `noop_dev_mode_direct` and is exposed via `meteringFor('analysis_direct')` for any future audit hook, but no `queries` row is written so the value is not currently persisted. **Tracked as a known gap to formalise in Phase 1.2 if direct-analysis audit logging becomes a requirement.**

## C — Legacy regenerate

- [ ] Open one existing legacy `/report/<uuid>` (engine_version IS NULL or `v0_legacy`).
- [ ] Legacy template (`AIReportCardV2`) renders untouched.
- [ ] `HybridRegenerateBanner` mounted above it.
- [ ] Click **Regenerate Free** → toast → navigate to new uuid.
- [ ] New row: `engine_version = 'v1_tier_shaped'`, `engine_source = 'regenerated_from_legacy'`, `regenerated_from_uuid` points at the legacy id.
- [ ] `audit_events` row with `event_type = 'report_regenerated_from_legacy'` and `payload.credit_action = 'noop_dev_mode_legacy_regenerate'`.
- [ ] First visit to new uuid freezes the artifact (`frozen_at` populated, `ai_report` non-null, `audit_meta.served_from_cache = false`).
- [ ] Second visit: served from cache.

## D — PDF side-by-side compare

For each of RELIANCE / ICICIBANK / TCS:

1. Generate PDF from `/report/<v1 uuid>` via the **Download PDF** button.
2. Generate PDF from `/analysis/SYMBOL?horizon=<tier>` via its **Download PDF** button.
3. Open both PDFs and diff visually + textually:

| Section | Match? | Notes |
| --- | --- | --- |
| Verdict block | _pending_ | |
| Composite score + pillars | _pending_ | |
| Trade Plan card | _pending_ | |
| Confidence card | _pending_ | |
| Action Zone | _pending_ | |
| Audit footer | _pending_ | |
| Filename `Stockera_Analysis_{SYM}_{HORIZON}_{YYYY-MM-DD}.pdf` | _pending_ | |

Implementation note (deterministic): both paths call the same
`generateAnalysisPdf` server fn which keys by `symbol + horizon + as_of_date`
and renders the same `/print/{symbol}` template — see `src/lib/pdf.functions.ts`
lines 85-86 (`cacheKeyFor`) and the `getPrintAnalysisPayload` server fn. The
only intentional divergence is the `as_of_date` slice; same trading day → same
file from the cache.

> **STOP rule**: if any row above is "different", stop Phase 1.1 close-out and
> file a separate ticket before declaring Phase 2 ready.

## E — Forbidden-vocab lint guard

Run: `bun lint:vocab` (or `node scripts/check-forbidden-vocab.mjs`).

Current run output (after script tightening to scan prose-only fragments):

```
[forbidden-vocab] ✗ 1 violation(s):
  src/components/landing/HeroSection.tsx:10  "100%"  → 100% Confidential
```

| File | Line | Word | Snippet |
| --- | --- | --- | --- |
| `src/components/landing/HeroSection.tsx` | 10 | `100%` | `100% Confidential` |

Per task instruction this is **reported, not auto-rewritten**. Suggested
replacements (for human review, not applied here):
- "100% Confidential" → "Fully confidential" or "Strictly confidential"

No other forbidden words (`guaranteed`, `sure shot`, `prediction`, `forecast`,
`promise`, `definitely`) appear in user-facing copy anywhere under
`src/components/**` or `src/lib/**` after tightening the matcher to prose-only
fragments (JSX text + string literals containing interior whitespace, with
TS-syntax punctuation rejected).

---

## Open blockers before Phase 2

1. The single HeroSection.tsx `100%` copy line above — needs a one-line copy
   change after product/legal review.
2. Live A/B/C/D walk-through still pending — these are signed-in browser
   tasks; this document is the template to fill in during the run.

No code blocker. Phase 2 (Existing Position + Averaging Decision) can begin
once the live walk-through is captured and the one copy edit is applied.
