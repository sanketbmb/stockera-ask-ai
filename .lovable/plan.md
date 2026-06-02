## Confirmed root causes

1. **Stock PDFs still re-run live orchestration during print**
   - `src/lib/pdf.functions.ts:161` returns `callOrchestrator(data.symbol, data.horizon, data.include_news)` inside `getPrintAnalysisPayload`.
   - That means `/print/$symbol` is not using a frozen artifact; it waits on live Brain/Edge orchestration before `#print-ready` can exist.

2. **Unified `/report/:queryId` stock downloads discard the frozen query artifact**
   - `src/routes/report.$queryId.tsx:171` renders `<DownloadPdfButton symbol={symbol} horizon={horizon} />`.
   - `src/routes/report.$queryId.tsx:229` delegates to `SharedDownloadPdfButton kind="stock" symbol={symbol} horizon={horizon} includeNews />`.
   - The `queryId` and `queries.ai_report` frozen payload are not passed into the PDF generator, so unified stock reports fall back to the direct live stock path.

3. **Print routes depend on client hydration/client RPC before readiness markers appear**
   - `src/routes/print.$symbol.tsx:39-41`
   - `src/routes/print-sector.$queryId.tsx:29-31`
   - `src/routes/print-educational.$queryId.tsx:28-30`
   - These use `useQuery` + `useServerFn` from the browser page. The initial SSR HTML is only a loading screen with no `#print-ready` or `#print-error`. If Browserless hydration/RPC is delayed or fails, it waits until timeout.

4. **Runtime evidence matches the hydration/readiness bottleneck**
   - Current report `908be801-81ba-4213-a7cc-f74b974f9f18` is educational, has `queries.ai_report`, `engine_version = v1_educational`, and `frozen_at` set.
   - Yet the latest `pdf_generation_log` row is `edu_908be801-...` with `Browserless HTTP 408` after ~60.6s.
   - Since the artifact exists, the timeout is not caused by live educational generation; it is caused by Browserless not seeing a readiness marker in time.

5. **Browserless hard-caps around 60s despite app timeout being 90s**
   - Recent logs fail around 60s. The app’s 90s timeout is not enough because the upstream service returns HTTP 408 first.
   - The fix must make print pages marker-ready quickly, not just increase timeouts.

6. **Logging/RLS is not the current blocker**
   - `pdf_generation_log` is receiving rows for failures, so logging is not stalling/aborting the pipeline.
   - The current code already catches log failures non-fatally; I will preserve that.

## Implementation plan

### 1. Make stock PDF generation artifact-backed

- Extend the shared stock PDF flow so it supports two safe sources:
  - **Unified report stock:** pass `queryId`; server reads `queries.ai_report` after authorizing `user_id === context.userId`.
  - **Direct `/analysis/$symbol`:** pass the already-rendered `StockAnalysisPayload` snapshot from the page; server stores it as a temporary frozen JSON artifact in the private `pdf-cache` bucket and prints from that artifact.
- Remove live Brain/orchestrator calls from the print payload path.
- Keep the normal `/analysis` page’s live viewing behavior unchanged; only PDF export becomes snapshot/frozen.

### 2. Convert print routes to SSR-ready loader rendering

- Change stock, sector, and educational print routes so data is resolved in the route loader and rendered into the initial HTML.
- Replace client-only `useQuery`/`useServerFn` readiness with loader data:
  - Success returns full payload and renders `#print-ready` immediately in SSR output.
  - Failure returns a visible error page with `#print-error` immediately in SSR output.
- Keep HMAC token validation server-side; no Browserless token or service role key goes to the client.

### 3. Preserve and refine lightweight print mode

- Keep `printMode` enabled for stock, sector, and educational bodies.
- Ensure print mode remains static:
  - `MotionConfig reducedMotion="always"`
  - no download buttons, CTAs, analyst widgets, or interactive-only controls
  - no dependency on delayed count-up/scroll animations for the printed values
- Add small print-only CSS/classes where needed to reduce heavy mesh/blur/glow effects while preserving premium card typography and spacing.

### 4. Browserless strategy update

- Centralize Browserless rendering into one helper for all report PDFs.
- Use:
  - `gotoOptions.waitUntil = "domcontentloaded"`
  - selector wait for `#print-ready, #print-error`
  - selector timeout below the observed Browserless cap, e.g. 45–50s
  - optional short post-marker delay only if needed for font/layout settling
- Add server logs around:
  - report kind
  - queryId/artifact id
  - print URL without exposing secret values
  - Browserless start/end duration
  - selector/HTTP failure reason

### 5. Cache key and filename hardening

- Stock unified cache keys: include `stk_`, queryId, symbol, horizon, template version, and artifact/frozen identity.
- Stock direct `/analysis` cache keys: include `stk_direct_`, symbol, horizon, includeNews, template version, and snapshot hash.
- Sector cache keys: include `sec_`, queryId, sector canonical/display, horizon, template version.
- Educational cache keys: include `edu_`, queryId, concept canonical, template version.
- Filenames:
  - `Stockera_Analysis_{SYMBOL}_{HORIZON}_{YYYY-MM-DD}.pdf`
  - `Stockera_Sector_{SECTOR}_{HORIZON}_{YYYY-MM-DD}.pdf`
  - `Stockera_Learn_{CONCEPT}_{YYYY-MM-DD}.pdf`

### 6. Button behavior cleanup

- Keep the shared button as a plain button; no Link/a wrapper.
- `/report/:queryId` stock reports will pass `queryId` to the shared PDF button.
- `/analysis/$symbol` will pass the loaded snapshot payload into the shared PDF button.
- Existing sector and educational buttons remain visible only when backed by supported frozen report types.
- Busy state and toast behavior remain; errors must reset busy state and never navigate away.

### 7. Logging/audit safety

- Keep `pdf_generation_log` writes best-effort and non-blocking.
- If cache lookup or log insert fails, continue PDF generation where safe.
- Do not add wallet charges or paid-path changes.

## Files expected to change

- `src/lib/pdf.functions.ts`
- `src/components/report/DownloadPdfButton.tsx`
- `src/routes/analysis.$symbol.tsx`
- `src/routes/report.$queryId.tsx`
- `src/routes/print.$symbol.tsx` or a new/renamed stock print route if cleaner
- `src/routes/print-sector.$queryId.tsx`
- `src/routes/print-educational.$queryId.tsx`
- Potentially `src/components/analysis/StockAnalysisReport.tsx`, `src/components/report/SectorViewReport.tsx`, `src/components/report/EducationalReport.tsx` only for print-mode static styling/marker refinements

No database migration is expected unless implementation uncovers a missing column/policy; current evidence shows `pdf_generation_log` is already writable.

## Verification matrix after implementation

I will run and document:

| Check | Route | Expected |
|---|---|---|
| A | `/analysis/$symbol` | PDF generates from frozen snapshot artifact, second click cache hit |
| B | `/report/:queryId` stock | PDF generates from `queries.ai_report`, not live Brain |
| C | `/report/:queryId` sector | PDF generates from `queries.ai_report`, second click cache hit |
| D | `/report/:queryId` educational | PDF generates from `queries.ai_report`, second click cache hit |

For each I will report generation time, filename, cache-hit status, and whether `pdf_generation_log` recorded the attempt.