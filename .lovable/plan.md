## Plan: Fix PDF downloads for every AI analysis report type

### What is going wrong
- The failing report is an **Educational** query (`query_type=educational`, `engine_version=v1_educational`).
- The PDF server function calls Browserless and waits for `#print-ready, #print-error`, but Browserless times out before seeing either marker.
- The app currently depends on full React route rendering to place the marker at the bottom of each report body. If the print route has SSR/hydration/route-validation issues, Browserless waits forever.
- There are also older/direct stock PDF paths still present, so the fix should cover **all visible Download PDF buttons**, not only the current educational query.

### Implementation steps

1. **Centralize Browserless PDF rendering**
   - Keep one helper for all report PDF generation.
   - Add stronger diagnostics: log the sanitized print URL, report kind, elapsed time, Browserless status, and truncated response body.
   - Keep the wait target as `#print-ready, #print-error`, but ensure Browserless receives a real HTML marker quickly.

2. **Make print routes marker-first and SSR-safe**
   - Update these routes:
     - `src/routes/print-stock.$queryId.tsx`
     - `src/routes/print-sector.$queryId.tsx`
     - `src/routes/print-educational.$queryId.tsx`
     - `src/routes/print.$symbol.tsx`
   - Add route-level `errorComponent` and `notFoundComponent` so loader or route failures render `<div id="print-error">` instead of the global app error without the expected marker.
   - Add a top-level hidden/screen-safe `#print-ready` marker immediately after successful loader data is available, not only at the very bottom of the report body.
   - Preserve the bottom marker where it already exists, but ensure there is **exactly one active marker ID** per successful print page.

3. **Fix search validation edge cases**
   - Replace fragile direct Zod `validateSearch` usage with a safe parser that returns `{ token }` or a controlled invalid token value.
   - Invalid/missing tokens should render `#print-error`, not crash route matching.

4. **Harden report-type routing**
   - In `DownloadPdfButton`, ensure:
     - Stock unified reports call `generateUnifiedStockPdf`.
     - Sector reports call `generateSectorPdf`.
     - Educational reports call `generateEducationalPdf`.
     - Direct/live stock reports either use the robust direct print route or are disabled if they cannot be frozen safely.
   - Keep web UI unchanged except for preventing broken PDF actions.

5. **Use frozen artifacts for query-based reports**
   - Keep stock unified, sector, and educational PDF generation reading from `queries.ai_report` via token-gated print routes.
   - Do not rerun AI/orchestration for PDF generation.

6. **Browserless timeout strategy**
   - Keep the internal Browserless wait below the upstream 60s cap.
   - The current `55_000ms` timeout is technically correct for Browserless’s cap, but after marker-first rendering it should complete much faster.
   - If the key/plan still returns timeouts, surface a clean error that recommends rotating or upgrading the Browserless key.

7. **Verification**
   - Test the current educational query PDF flow.
   - Test direct print route marker behavior for invalid tokens, confirming `#print-error` is visible.
   - Verify stock unified, sector, and educational paths all have a valid marker strategy.
   - Check `pdf_generation_log` write path remains intact.

### Expected result
- Every visible **Download PDF** action for AI report types either:
  - generates and opens a PDF successfully, or
  - shows a fast, readable failure with logging instead of hanging.
- The current educational query should no longer fail with `Waiting for selector '#print-ready, #print-error' failed`.