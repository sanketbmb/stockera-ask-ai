## A. Root-cause summary

`src/routes/library.index.tsx` Reports tab reads `library_items` filtered by `is_public=true` — that is the correct **logged-out** surface (see G5 below: the underlying RLS on `library_items` already restricts query-sourced public rows to `queries.is_public_library=true AND public_consent_anonymized=true`, i.e. the founder-seeded / opted-in corpus). What's missing is the **logged-in** sitewide "All AI Reports" feed. The browser client cannot power it because `ai_reports` RLS is owner-only (`auth.uid()=user_id`). It needs a new authenticated server function that bypasses RLS with a narrow safe projection.

## B. Grep findings

**G1 — `src/routes/library.index.tsx`**
- `PAGE_SIZE = 24` (line 5).
- `fetchLibraryGrid` (67–79): `library_items` where `is_public=true, is_tombstoned=false`, ordered by `published_at desc`, `.limit(200)`.
- Reports tab (206–297): renders `<MyAiReportsSection />` then toolbar + `pagedRows` grid from `filteredRows`, paginated client-side via `MasterLibraryPagination`.

**G2 — `src/components/library/MasterLibraryGrid.tsx`**
- Duplicate `fetchLibraryGrid` (public-only). Not used by the Reports tab in `library.index.tsx`. Left untouched.

**G3 — `ai_reports` / `library_items` / `getPublicReportRow` / `fetchLibraryGrid` references**
- `ai_reports`: read only in `MyAiReportsSection.tsx` (owner-scoped, RLS) and admin utilities (`admin.functions.ts`).
- `library_items`: public grids, search projections (`library-search`, `library-symbol`), and video composer publishing.
- `getPublicReportRow` in `src/lib/public-report-row.functions.ts`: admin-client, but only returns rows where `is_public_library=true AND library_tombstoned_at IS NULL AND ai_report IS NOT NULL`. Consumed by `report.$queryId.tsx`.

**G4 — Existing sitewide `ai_reports` reader?**
- None. `admin.functions.ts` only does `count(*)` (line 76). No user-callable sitewide fetcher exists.

**G5 — "Seeded" marker evidence**
- `public.queries.is_public_library` (BOOLEAN) + `public_consent_anonymized` + `library_tombstoned_at` are the founder-seeded/opted-in markers.
- Migration `20260704093957_…sql` policy `library_items_select_public_or_owner` enforces: for `source_table='queries'`, the row is only visible publicly when the source query has `is_public_library=true AND public_consent_anonymized=true AND library_tombstoned_at IS NULL`.
- ⇒ The **current logged-out** `library_items` grid is already the seeded/consented public-report corpus. No new flag or allowlist is needed.

## C. Implementation decision

- **Logged-out Reports tab** = keep current `library_items` public grid unchanged. It already ≡ seeded/consented AI reports (per G5).
- **Logged-in Reports tab** = existing `MyAiReportsSection` (owner) + new `AllAiReportsSection` (sitewide) driven by a new authenticated server function.
- **Data source (logged-in sitewide)**: new server fn `listAllAiReports` in `src/lib/library-all-ai-reports.functions.ts` using `.middleware([requireSupabaseAuth])` + `supabaseAdmin` (loaded inside handler via `await import`). Safe projection only: `ai_reports.{id, query_id, stock_symbol, stock_exchange, intent, generated_at, created_at}` + join `queries.{stock_name, query_text}`. Server-side pagination with `{ count: "exact", head: true }`, page size 24, dedupe latest-per-`query_id` at DB level via `DISTINCT ON` (implemented in TS by grouping the fetched slice; see technical note).
- **Card open path**: because `queries` RLS is owner-only, clicking a non-owned card would 404. Add a second auth-only reader `getReportRowForAuthedUser` in `src/lib/public-report-row.functions.ts` (same file, new export) using `requireSupabaseAuth` + `supabaseAdmin`. Wire it as the last fallback inside the existing `queryFn` in `report.$queryId.tsx` when the RLS `queries` fetch returns PGRST116 for a signed-in user. This is the smallest change to satisfy UAT #4.

No schema changes. No RLS changes. No new npm dependencies.

## D. Files changed

1. `src/lib/library-all-ai-reports.functions.ts` — **new file**.
2. `src/lib/public-report-row.functions.ts` — add second export `getReportRowForAuthedUser`.
3. `src/components/library/AllAiReportsSection.tsx` — **new file** (sitewide grid + pagination).
4. `src/routes/library.index.tsx` — mount `<AllAiReportsSection />` under `<MyAiReportsSection />` when authed; wire its own page search param separately (see line ranges).
5. `src/routes/report.$queryId.tsx` — inside existing `queryFn`, add authed-any-user fallback after the RLS `queries` PGRST116 branch.

## E. Line ranges (target)

- `src/lib/library-all-ai-reports.functions.ts` — new (~60 lines).
- `src/lib/public-report-row.functions.ts` — append lines 39–75 (new export, ~35 lines).
- `src/components/library/AllAiReportsSection.tsx` — new (~140 lines).
- `src/routes/library.index.tsx`
  - `validateSearch` (41–46): add optional `allPage` param.
  - Import (22): add `AllAiReportsSection`.
  - Reports tab body (206–207): render `<AllAiReportsSection />` beneath `<MyAiReportsSection />`.
- `src/routes/report.$queryId.tsx`
  - Import (43): add `getReportRowForAuthedUser`.
  - `useServerFn` (664): add second binding.
  - `queryFn` catch block (716–724): add authed-any-user fallback on PGRST116 for signed-in users.

## F. Full unified diff

Deferred — will be produced verbatim in the FULL DIFF response after this plan is approved (per STRICT PLAN → FULL DIFF → APPROVAL → DEPLOY protocol). The plan freezes scope, files, and behavior; the diff will match this contract exactly.

## G. Non-changes

No edits to: wallet, unlock, entitlements, pricing, analytics, StepStory, stock-logo, sector-filter, videos-blogs tab, `MasterLibraryGrid.tsx`, `MyAiReportsSection.tsx`, migrations, RLS, edge functions, `package.json`, `bun.lock`.

## H. Expected behavior

| Surface | Logged-out | Logged-in (new account, 0 reports) | Logged-in (owner with reports) |
|---|---|---|---|
| Reports tab top | (hidden) | My AI Reports: empty state | My AI Reports: owner rows |
| Reports tab middle | — | **All AI Reports**: full sitewide, paginated | **All AI Reports**: full sitewide, paginated |
| Reports tab bottom | Seeded/consented public grid (`library_items` public) | Same seeded grid (unchanged) | Same seeded grid (unchanged) |
| Card click → `/report/:id` | Only opens if public-library row | Opens any AI report (new authed fallback) | Opens any AI report |

## I. UAT checklist

- [ ] U1 — Incognito `/library?page=1` shows only seeded/consented public reports; no "All AI Reports" heading present.
- [ ] U2 — Logged in as `cb8c4e61-facd-4a7f-a94e-e4864b3aaa5b`: `/library?page=1` shows My AI Reports empty state AND "All AI Reports" section with row count materially exceeding old public grid.
- [ ] U3 — "All AI Reports" pagination renders and `?allPage=2` navigates correctly.
- [ ] U4 — Logged in as an older account with own reports: My AI Reports shows owner rows; All AI Reports shows sitewide feed; both coexist.
- [ ] U5 — Clicking any card in All AI Reports opens `/report/$queryId` and renders the report for the signed-in user.
- [ ] U6 — Anon user cannot reach the `listAllAiReports` server fn (requireSupabaseAuth 401).
- [ ] U7 — `bunx tsgo --noEmit` exits 0.
- [ ] U8 — `git diff package.json bun.lock` empty.

## J. STOP

Awaiting `APPROVED — DIFF` to produce the full unified diff, or `APPROVED — DEPLOY` to ship. No files modified in plan mode.
