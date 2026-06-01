# Diagnosis — AI Report PDF (Bug 1 + Bug 2)

## Setup: there are TWO different "PDF" paths in this app

| # | Trigger | Pipeline | Component rendered |
|---|---|---|---|
| A | `/analysis/$symbol` → "Download PDF" button | `generateAnalysisPdf` (server fn) → Browserless → Supabase storage | `<StockAnalysisReport printMode />` (the **new tier-shaped** layout, including `<TierShapedGrid>`) |
| B | `/report/$queryId` → "Download PDF" button | `window.print()` (browser-native, no server) | `<AIReportCardV2>` styled via print CSS |

The user reports symptoms against **path A** (`/analysis/RELIANCE?horizon=intraday`). All findings below are scoped to path A unless noted.

---

## Bug 1 — "Unauthorized: no authorization header provided"

### Click handler chain
- `src/routes/analysis.$symbol.tsx` lines **133–155** — `DownloadPdfButton` calls `useServerFn(generateAnalysisPdf)` and invokes it with `{ data: { symbol, horizon, include_news } }`.
- `src/lib/pdf.functions.ts` lines **161–169** — `generateAnalysisPdf` has `.middleware([requireSupabaseAuth])`.
- `src/integrations/supabase/auth-middleware.ts` lines **31–37** — throws exactly `Unauthorized: No authorization header provided` when the incoming server-fn request has no `Authorization` header.
- The bearer attacher IS wired (`src/start.ts` line 24 → `functionMiddleware: [attachSupabaseAuth]`), and `src/integrations/supabase/auth-attacher.ts` reads `supabase.auth.getSession()` and attaches `Authorization: Bearer <token>` **only if a session exists**.

### Root cause
`/analysis/$symbol` is a **public route** (no `RequireAuth`, no `_authenticated` layout). The "Download PDF" button is rendered to every visitor, signed in or not. When `supabase.auth.getSession()` returns no session for that browser/tab, the attacher attaches nothing → server middleware rejects with the exact error the user sees.

Why "the user is logged in" can still hit this:
- The login event in the auth logs has `referer: http://localhost:3000`, but the preview is being served from `id-preview--…lovable.app`. Supabase auth state is stored in `localStorage` keyed to the origin — a session created on `localhost:3000` is **invisible** on `id-preview--…lovable.app`. The preview tab effectively has no session even though another tab does.
- Same effect if the access token silently expired without a refresh, or if the user opened `/analysis/RELIANCE` in an incognito/new browser session.

### Ranked fix options
1. **RECOMMENDED — Gate the Download PDF button on auth client-side.** Read `useAuth()` in `DownloadPdfButton`; if not signed in, render a "Sign in to download" button that routes to `/login?next=/analysis/...`. Still call the protected server fn for actual users. One-component change in `src/routes/analysis.$symbol.tsx`, no server changes. Surface origin-mismatch issue with a clear message ("Sign in again — your session is on another tab/origin").
2. **Also recommended (defensive)** — Before calling `generateAnalysisPdf`, do `const { data } = await supabase.auth.getSession(); if (!data.session) { toast("Please sign in to download"); return; }`. Prevents the raw "Unauthorized" string from leaking into a toast.
3. **Alternative — Move PDF behind `_authenticated` layout.** Heavier: requires extracting an authenticated variant of `/analysis/$symbol` or wrapping the whole route. Breaks SEO/share for the public view.
4. **NOT recommended — Drop `requireSupabaseAuth` from `generateAnalysisPdf`.** Loses per-user rate limiting, abuse protection, and the `user_id` audit column in `pdf_generation_log`. Browserless quota (1000/mo, warn at 800) would be exposed to anonymous traffic.

---

## Bug 2 — "PDF shows OLD 4-card legacy template, web shows new tier-shaped"

### Which component renders the PDF
- Browserless navigates to `/print/$symbol?...&token=...` — `src/routes/print.$symbol.tsx`.
- That route renders **`<StockAnalysisReport data={data} printMode />`** at line 84 — exactly the same component as the live web view.
- Inside `StockAnalysisReport` (`src/components/analysis/StockAnalysisReport.tsx`), the tier-shaped grid renders at **line 785** (`<TierShapedGrid data={data} />`) unconditionally — there is no `printMode` branch that swaps it out. The only `printMode` branches are: verdict label (line 565), the `#print-ready` marker (line 965), and a `MotionConfig reducedMotion="always"` wrapper (line 971). None of them change the layout.

### Files that import / render the AI report PDF template
- `src/routes/print.$symbol.tsx` (the only Browserless target)
- `src/components/analysis/StockAnalysisReport.tsx` (the template itself, also reused by the live page)
- `src/routes/analysis.$symbol.tsx` (live web view — same component, no `printMode`)

No other PDF template component exists. There is **no separate legacy PDF renderer** in the codebase — the "old 4-card layout" the user is seeing cannot be coming from a different React component on this build.

### Root cause (most likely → least likely)
1. **Stale cached PDF being re-served (most likely).** `src/lib/pdf.functions.ts` lines **177–207** look up `pdf_generation_log` for any row with the same `cache_key = ${symbol}_${horizon}_n${0|1}_${todayIST()}` and `success = true` from the last hour, and if found, return the previously-uploaded `${key}.pdf` from storage without ever calling Browserless. If a PDF was successfully generated **earlier today** against an older deploy (pre-B.2/B.3 tier-shaped grid), every click today for the same symbol+horizon+news combo returns that stale PDF. Cache key has no app/template version in it — only the date. This is the only mechanism in the current code that can serve an "old" layout from a build that already contains the new layout.
2. **Browserless navigated to the wrong origin (was the previous bug)** — recently fixed via `PUBLIC_PRINT_FALLBACK`. If a stale storage object was uploaded back when origin resolution was broken, see (1).
3. **User looking at a downloaded PDF file from a previous session.** Re-downloading via the cached signed URL serves the same bytes. The browser may also show a cached file from a previous click.
4. Extremely unlikely: a separate "legacy" template lurking outside `src/`. A `rg` over `src/` finds none.

### Ranked fix options
1. **RECOMMENDED — Add a template version to the cache key.** In `src/lib/pdf.functions.ts`, change `cacheKeyFor(...)` to include a constant like `ANALYSIS_PDF_TEMPLATE_VERSION = "v2"` (or import `DOC_VERSION` analog). Bumping that constant whenever the print layout changes invalidates all stale caches without manual cleanup. Two-line change. Same pattern already used by `generateArchitecturePdf` (`architecture_v${DOC_VERSION}_${today}`).
2. **One-time cleanup** — delete today's stale `*.pdf` objects from the `pdf-cache` storage bucket AND mark today's `pdf_generation_log` rows for analysis PDFs as `success=false` (or delete them) so the cache lookup misses and Browserless regenerates. Can be done from Supabase SQL editor + storage UI. Pair with fix 1 going forward.
3. **Shrink `CACHE_TTL_SEC`** from 1h to e.g. 5 min during the active release window. Doesn't fix the root issue (stale rendering of any cached PDF), just shortens the blast radius.
4. **NOT recommended** — disabling caching entirely. Browserless costs ~real money (1000/mo ceiling, warn at 800 already wired in `maybeWarnQuota`). Cache is correct, the **key** is the bug.

### Verification plan once fixes ship
- After fix 1+2: click Download on `/analysis/RELIANCE?horizon=intraday` while signed in → check `pdf_generation_log` for a new `cache_hit=false, success=true` row → open the signed URL → confirm the tier-shaped sections (Intraday Microstructure, Today's Catalysts, etc.) are present.
- Add a quick `?refresh=1` query param (optional) to bypass cache during the next release smoke test.

---

## Out of scope (explicitly NOT touched in this plan)
- The `/report/$queryId` `window.print()` flow (path B). Different mechanism, not what the user reported.
- The print page chrome (header, footer, SEBI disclosure).
- `StockAnalysisReport` itself — already on tier-shaped, no migration needed.
- Edge function `generate-stock-analysis` — orchestrator is fine, it's what feeds both web and print.
- Browserless timeouts / `waitUntil` strategy — already tuned in the previous fix.

Awaiting approval before switching to build mode.
