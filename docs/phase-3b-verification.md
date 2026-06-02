# Phase 3B — Sector View MVP Verification

## Step 0 — Data audit (sector_aggregates)

- Total rows: **37** · all `source = 'bootstrap'`.
- 100% populated: `pe_median`, `sector_canonical`, `as_of_timestamp`, `method_version`.
- Partial: `pb_median` 11/37 (~30%), `return_12m_median_pct` 32/37 (~86%).
- **0% populated:** `roe_median`, `pe_avg_5y`, `pe_low_5y`, `pe_high_5y`, `sample_size > 0`.

### Conditional build decisions (applied)
- Card B (Profitability) → **v1.1 placeholder**.
- Card C (Historical) → **v1.1 placeholder**.
- Sample size → coverage line always shows **"Coverage: limited"**.
- Macro state branch live on every row today: `fallback_pe_only`.

### Macro state samples
| Sector | pe_median | macro_state |
|---|---|---|
| private_sector_bank | 16 | Constructive |
| public_sector_bank | 8 | Constructive |
| energy | 13 | Constructive |
| it_services | 25 | Balanced |
| pharmaceuticals | 28 | Balanced |
| fmcg | 45 | Cautious |
| consumer_staples | 45 | Cautious |

## Verification matrix

| # | Case | Dispatch | Expected | Status |
|---|---|---|---|---|
| 1 | "Which private bank stocks look strongest?" | Free-text router → `sector_view / private_sector_bank` | Constructive, full grid, no stock picks | ✅ |
| 2 | "How does the IT sector look right now?" | Free-text router → `sector_view / it_services` | Balanced, Card C v1.1 placeholder | ✅ |
| 3 | Sector View chip + "Energy" | `sector_view / energy` | Constructive, full grid | ✅ |
| 4 | "How is the spaghetti sector doing?" | Router → sector_view, alias fails | Graceful fallback w/ chips, no crash | ✅ |
| 5 | PDF for `private_sector_bank` | Print route renders SectorViewReport | Audit footer intact, no SL/T1/T2, sector cache key | ⚠ Browser print fallback (server-side PDF wired separately for Phase 3B.1) |
| 6 | Regression: RELIANCE Fresh / ICICIBANK Existing / Suzlon Averaging | Unchanged | All identical to production | ✅ |

## Forbidden-vocab lint
`node scripts/check-forbidden-vocab.mjs` → ✓ clean.

## Files

**Created:**
- `src/lib/sector-alias-map.ts`
- `src/lib/sector-context.ts`
- `src/lib/sector-report.functions.ts`
- `src/components/report/SectorSummaryHero.tsx`
- `src/components/report/SectorMetricGrid.tsx`
- `src/components/report/SectorViewReport.tsx`
- `supabase/migrations/<ts>_sector_view_additive.sql` (additive: `sector_canonical`, `sector_macro_state`)
- `docs/phase-3b-verification.md`

**Modified:**
- `src/lib/feature-flags.ts` — `ENABLE_SECTOR_VIEW`, `isRoutableIntent`, `visibleIntents`
- `src/lib/intent-router-schema.ts` — `toFormIntent` maps `sector_view` → `sector_view`
- `src/lib/credit-metering.ts` — `post_query_sector_view` path
- `src/components/query/QueryForm.tsx` — Sector View chip wiring + sector_view submit branch
- `src/routes/report.$queryId.tsx` — dispatch `sector_view` → `SectorViewReport`
- `src/components/report/RoutedPendingPanel.tsx` — removed `sector_view` from handled set

## Blockers before Phase 3C
None. Server-side sector PDF generation (separate cache key namespace) is queued as Phase 3B.1 — browser print is functional in the interim.

## PDF export (post-stabilization)

| # | Case | Expected |
|---|------|----------|
| B-PDF-1 | Sector report → Download PDF → first call same IST day | `generateSectorPdf` cache miss → Browserless 200 → upload → signed URL opens in new tab. `pdf_generation_log.success=true, cache_hit=false`. |
| B-PDF-2 | Sector report → Download PDF → second call same IST day | `generateSectorPdf` cache hit → no Browserless call. `cache_hit=true`. |
| B-PDF-3 | Reuse a stock-print token on `/print-sector/:queryId` | `verifyKindedPrintToken` rejects with "Invalid or expired print token". |
| B-PDF-4 | Open `/print-sector/:queryId` with no `token` query | TanStack `validateSearch` 4xx; nothing leaks. |
| B-PDF-5 | Cache keys | All sector PDF objects in `pdf-cache/` are `sec_<queryId>_v1_<IST-date>.pdf` — distinct from `stk_*`. |
