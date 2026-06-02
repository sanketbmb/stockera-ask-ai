# PDF Export God-Mode Stabilization — Diagnostic + Fix Plan

## Findings

### 1. The "CLICK BUG" cannot be reproduced from current code
The button referenced in the mission (`src/components/analysis/DownloadPdfButton.tsx`) does **not exist**. The only `DownloadPdfButton` is defined inline in `src/routes/report.$queryId.tsx:227–268`. It is a plain shadcn `<Button onClick={handleClick}>` with **no `<Link>` wrapper, no `to=` prop, and no `<a href>`** — so a click cannot mutate the URL. The reported URL `/report/:queryId%20Click%20Download%20PDF` would require something to concatenate the button label into the `queryId` path param; nothing in the current tree does that.

What this likely is in practice:
- A stale build / cached preview from an earlier broken iteration, OR
- An external automation pasting button text into the URL bar.

**Action**: After we add proper download buttons to Sector + Educational reports (below), if the bug still reproduces, capture the exact URL with a session replay and we'll trace the offending Link. No code on `main` produces that URL.

### 2. Browserless wiring is correct, but there is NO `generate-report-pdf` edge function
There is no Supabase Edge Function for PDFs in this project. PDF generation runs in a **TanStack server function** — `generateAnalysisPdf` in `src/lib/pdf.functions.ts:167`. It reads `process.env.BROWSERLESS_TOKEN` (line 233) inside `.handler()`, which is the correct pattern for runtime secrets. The `BROWSERLESS_TOKEN` secret is already present. Wiring is healthy for the stock path; the function calls Browserless at `https://chrome.browserless.io/pdf` and uploads to the `pdf-cache` bucket.

The mission's reference to a `generate-report-pdf` Edge Function is incorrect for this stack — we keep everything in TanStack server functions per `server-side-modern` guidance.

### 3. Sector + Educational reports have no download button and no print template
- `src/components/report/SectorViewReport.tsx` — no `DownloadPdfButton`, no print route, no `printMode` prop.
- `src/components/report/EducationalReport.tsx` — same.
- Only the stock report has a print route (`src/routes/print.$symbol.tsx`) and a print payload server fn (`getPrintAnalysisPayload`).

Browserless cannot generate sector/educational PDFs because there is nothing for it to navigate to.

### 4. Cache keys
`cacheKeyFor` in `pdf.functions.ts:87` already namespaces stock keys as `stk_*`. We need parallel `sec_*` / `edu_*` keyers when we add the new server fns. No collision exists today because no other PDF path exists.

---

## Plan

### A. Stock download button — defensive cleanup
- Refactor the inline `DownloadPdfButton` out of `src/routes/report.$queryId.tsx` into `src/components/report/DownloadPdfButton.tsx`, parametrized by `{ kind: "stock" | "sector" | "educational"; queryId, symbol?, horizon? }`. This is the file the mission expected to find and removes any chance of a future regression wrapping it in a `<Link>`.

### B. Sector PDF pipeline
1. **Print route** — `src/routes/print-sector.$queryId.tsx` (token-gated, no navbar/CTA, motion-free, A4-friendly). Renders an extracted presentational subset of `SectorViewReport` (hero, metric grid, action buckets, audit footer, SEBI disclaimer) plus the same branded print header/footer used in `print.$symbol.tsx`.
2. **Split `SectorViewReport`** into `SectorReportContent` (pure presentational, accepts `payload` + `printMode` prop) and the existing `SectorViewReport` wrapper (Navbar + freeze fetcher + fallback). The new content component is shared between `/report/:queryId` and the print route. When `printMode` is true, hide CTA buttons and analyst banners.
3. **Print payload server fn** — `getPrintSectorPayload` in `src/lib/sector-report.functions.ts`: token-gated (reuses `verifyPrintToken` from `pdf.functions.ts`), returns the frozen `SectorReportPayload` for the given queryId.
4. **PDF server fn** — `generateSectorPdf` in `src/lib/pdf.functions.ts`:
   - `cacheKeyForSector(queryId)` → `sec_${queryId}_${SECTOR_PDF_TEMPLATE_VERSION}_${todayIST()}`
   - Same cache → Browserless → upload → log flow as `generateAnalysisPdf`.
   - Signs a print token bound to `{ queryId, kind: "sector", exp }`.
   - Object path under `pdf-cache/sec_*.pdf`.

### C. Educational PDF pipeline
Mirror image of B:
1. `src/routes/print-educational.$queryId.tsx`.
2. Split `EducationalReport` into `EducationalReportContent` (with `printMode`) + wrapper.
3. `getPrintEducationalPayload` in `src/lib/educational-report.functions.ts`.
4. `generateEducationalPdf` + `cacheKeyForEducational(queryId)` → `edu_${queryId}_${EDU_PDF_TEMPLATE_VERSION}_${todayIST()}`.

### D. Wire download buttons into the new variants
In `src/routes/report.$queryId.tsx`, the dispatcher already branches on `query_type`. Pass the right `kind` to the new `DownloadPdfButton` for sector/educational/stock, mounted in a header bar above each report variant (same visual slot used for the stock report). For "other" / RoutedPendingPanel, no PDF.

### E. Print-token signing
Extend the existing `signPrintToken` helper to accept `{ kind, queryId }` payloads in addition to `{ symbol, horizon, include_news }`. Validators on the new server fns must reject tokens whose `kind` doesn't match.

### F. Verification
Add a row to `docs/phase-3b-verification.md` and `docs/phase-3c-verification.md` for the PDF path:
- happy path (cache miss → Browserless 200 → upload → signed URL → browser opens PDF)
- cache hit (same key within IST day → no Browserless call)
- token kind mismatch (sector token used on stock print route → 401)

## Technical details

### File map
```
src/components/report/DownloadPdfButton.tsx       (new, shared)
src/components/report/SectorReportContent.tsx     (new, extracted)
src/components/report/EducationalReportContent.tsx (new, extracted)
src/routes/print-sector.$queryId.tsx              (new)
src/routes/print-educational.$queryId.tsx        (new)
src/lib/pdf.functions.ts                          (add generateSectorPdf, generateEducationalPdf, cache-key helpers)
src/lib/sector-report.functions.ts                (add getPrintSectorPayload)
src/lib/educational-report.functions.ts           (add getPrintEducationalPayload)
src/components/report/SectorViewReport.tsx        (refactor to use SectorReportContent)
src/components/report/EducationalReport.tsx       (refactor to use EducationalReportContent)
src/routes/report.$queryId.tsx                    (inline DownloadPdfButton removed; uses shared one)
```

### Cache-key namespacing (final)
```
stk_{SYMBOL}_{horizon}_n{0|1}_{tplVer}_{IST-date}.pdf
sec_{queryId}_{tplVer}_{IST-date}.pdf
edu_{queryId}_{tplVer}_{IST-date}.pdf
```

### Print URL shape
```
/print-sector/{queryId}?token=...
/print-educational/{queryId}?token=...
```
Both rendered through the same `PUBLIC_PRINT_FALLBACK` origin logic Browserless already uses.

### Non-changes
- `BROWSERLESS_TOKEN` secret — already set, do not re-add.
- `pdf-cache` bucket — already exists, private, signed URLs.
- Stock pipeline — no behavioral change, only the button is extracted.

## BUILD prompt to follow

> Build the PDF stabilization per the approved plan: (1) extract a shared `DownloadPdfButton` component supporting `kind: "stock" | "sector" | "educational"`; (2) split `SectorViewReport` and `EducationalReport` into presentational `*Content` components that accept a `printMode` prop (no Navbar, no CTAs, A4-friendly); (3) add token-gated print routes `/print-sector/$queryId` and `/print-educational/$queryId`; (4) add `getPrintSectorPayload` / `getPrintEducationalPayload` server fns; (5) add `generateSectorPdf` and `generateEducationalPdf` in `pdf.functions.ts` with `sec_*` and `edu_*` cache keys mirroring the existing `stk_*` flow; (6) extend `signPrintToken` / `verifyPrintToken` to carry a `kind` claim and reject mismatches; (7) wire the shared `DownloadPdfButton` into the sector and educational headers on `/report/:queryId`; (8) update `docs/phase-3b-verification.md` and `docs/phase-3c-verification.md` with the PDF verification rows.
