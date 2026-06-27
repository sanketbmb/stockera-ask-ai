# Master Library Spec — Stockera

> Governance doc. Every L4C build prompt starts with:

> "Read `docs/master-library-spec.md` and treat as immutable governance."

## Status

- DOCS-1 — created.

- FIX-3 (verdict tones + MasterSearch tabs) — live.

- L4C-1 through L4C-5 — pending.

## Bindings (FIX-3 deliverables)

- `src/lib/verdictTone.ts` — canonical export module. Named exports: `VERDICT_TONE_FILLED`, `VERDICT_TONE_OUTLINE`.

- `src/components/library/MasterSearchRecentTab.tsx` — Latest-answered tab.

- `src/components/library/MasterSearch.tsx` — tabs wrapper.

- `src/components/library/MasterSearchHero.tsx` — homepage hero (READ-ONLY).

- `src/components/library/MasterSearchTrigger.tsx` — Ctrl+K surface (READ-ONLY).

- `src/components/landing/PublicAnswersMarquee.tsx` — fills with `VERDICT_TONE_FILLED`.

- `src/components/landing/ProblemsWeSolve.tsx` — outlines with `VERDICT_TONE_OUTLINE`.

## Verdict tones (two exports — do not collapse)

| Surface | Export |

|---|---|

| PublicAnswersMarquee rows | `VERDICT_TONE_FILLED` |

| ProblemsWeSolve items | `VERDICT_TONE_OUTLINE` |

| MasterSearchRecentTab rows | `VERDICT_TONE_FILLED` |

| MasterLibraryCard | `VERDICT_TONE_FILLED` |

**Rule:** marquee-style filled chip surfaces use `VERDICT_TONE_FILLED`. Outline-pill lists (bordered) use `VERDICT_TONE_OUTLINE`. When in doubt, ask before importing.

## Verdict literal mapping

DB whitelist (CHECK constraint): `BUY, HOLD, AVERAGE, EXIT, PARTIAL_EXIT, WAIT`. `verdict` is nullable.

Render labels:

| DB literal | Render label |

|---|---|

| `BUY` | `BUY` |

| `HOLD` | `HOLD` |

| `AVERAGE` | `AVERAGE` |

| `EXIT` | `EXIT` |

| `PARTIAL_EXIT` | `PARTIAL EXIT` |

| `WAIT` | `WAIT` |

| `NULL` | hide pill OR render neutral fallback (component choice) |

`VERDICT_TONE_FILLED` and `VERDICT_TONE_OUTLINE` MUST contain BOTH `"PARTIAL EXIT"` and `PARTIAL_EXIT` as alias keys with identical values, to absorb either form at lookup time.

Verdicts NOT in the DB whitelist but still present in tone maps for legacy reasons: `WATCHLIST`, `REDUCE`, `AVOID`. These will never appear from live DB rows but must not be removed from the tone maps without an explicit cleanup task.

## MasterSearch popup (FIX-3, live)

### Tabs

- **Latest answered** (default)

  - Visibility: pre-3-char query, or when user selects the tab.

  - Data source: direct `library_items` query (NOT `fn_library_search`).

  - Page size: 12.

  - Empty-state copy: `No answered reports yet — be the first to ask.` with `/post-query` inline link.

- **Search**

  - Visibility: when `debouncedQ.length >= 3`.

  - Data source: existing `library-search` edge function.

  - Sections: 📊 STOCKS, 📝 AI REPORTS, 🎥 VIDEOS, 💬 COMMUNITY, 👤 ANALYSTS.

### Query contract — Latest answered

    queryKey  : ['master-search-recent']

    staleTime : 5 * 60 * 1000

    selector  : public.library_items

                  .select('id, kind, source_table, source_id,

                           symbol, symbol_exchange, title, verdict,

                           sector, analyst_id, body_excerpt,

                           published_at, is_public, is_tombstoned')

                  .eq('is_public', true)

                  .eq('is_tombstoned', false)

                  .eq('source_table', 'queries')

                  .not('symbol', 'is', null)

                  .not('verdict', 'is', null)

                  .order('published_at', { ascending: false, nullsLast: true })

                  .limit(12)

    RLS       : library_items_select_public_or_owner

                  (anon-readable when is_public = true)

## /library page (L4C-1 through L4C-5)

### Route

- Path: `/library`

- File: `src/routes/library.index.tsx` (unless route grep reveals a stronger existing convention).

- Sibling route `/library/$symbol` (or equivalent symbol route) must remain untouched in all L4C builds except where L4C explicitly says otherwise.

- Hero copy:

  - Eyebrow: `PUBLIC LIBRARY`

  - H1: `Browse analyst-answered stock questions`

  - Subtext: `Public market questions, verdicts, and report summaries from SEBI-registered experts.`

### Grid

- Responsive columns: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`.

- Gap and rhythm: match existing public-page card grids.

- Loading state: 12 skeleton cards (same height as final cards, no CLS).

### Query contract — Library grid (L4C-1)

    queryKey  : ['library','grid']

    staleTime : 5 * 60 * 1000

    selector  : public.library_items

                  .select('id, kind, source_table, source_id,

                           symbol, symbol_exchange, title, verdict,

                           sector, analyst_id, body_excerpt,

                           published_at, is_public, is_tombstoned')

                  .eq('is_public', true)

                  .eq('is_tombstoned', false)

                  .order('published_at', { ascending: false, nullsLast: true })

                  .limit(60)

    RLS       : library_items_select_public_or_owner

L4C-1 deliberately does NOT filter on `source_table='queries'`. Non-`queries` rows render but their CTAs are disabled (deferred to L4C-3).

### Card component

- Symbol chip (top-left).

- Verdict pill via `VERDICT_TONE_FILLED`.

- Title (line-clamp-2).

- body_excerpt (line-clamp-3).

- Relative date.

- One CTA: `View full answer →`.

Card navigation rules:

- If `source_table === 'queries'`: card and CTA navigate to `/report/${source_id}`.

- If `source_table !== 'queries'`: CTA is disabled with tooltip `Library detail view coming soon`. Card remains visible. Deferred to L4C-3.

- Cards must be keyboard-accessible (Tab, Enter).

### Hover / mobile interaction (L4C-3)

- Desktop hover: bottom slide-up reveal showing extended body_excerpt and sector chip.

- Mobile: single tap navigates directly (no two-tap reveal).

- L4C-1 ships with NO hover-preview. Plain static card only.

### Search and filters (L4C-2)

- Sticky search bar at top of `/library` (mirrors MasterSearchHero pattern, NOT a copy of MasterSearchHero component).

- Verdict filter chips: BUY, HOLD, AVERAGE, EXIT, PARTIAL EXIT, WAIT.

- Sector filter dropdown.

- Sort: latest (default), most-viewed (deferred if `view_count` not surfaced).

- L4C-1 ships with NO search and NO filters.

### Empty state

- Title: `No public reports yet`

- Subcopy: `Be the first to ask a question and build the library.`

- CTA: `Post a new query` → `/post-query`.

- Do NOT reuse the marquee fallback (`SAMPLE LTD`) on this page under any condition.

### Skeleton state

- 12 cards, height-matched to real cards, Tailwind pulse utility.

### Homepage entry points (L4C-4)

Three entry points wire into `/library`:

1. MasterSearchHero — `Browse the full library →` link below the search input.

2. PublicAnswersMarquee — `View all answered questions →` link below the marquee.

3. SiteFooter — Platform column `Library` link.

L4C-1 ships with NONE of these. Homepage stays untouched in L4C-1.

### Backfill (L4C-5)

- Automation: when a query reaches `status='ai_answered'` AND `is_public_library=true`, a `library_items` row of `kind='report'` is upserted via the existing `fn_project_query_to_library` trigger (or a sibling trigger that does not require a published video answer — to be designed in L4C-5).

- Current state: 8 manual seed rows from `BACKFILL-1-REAL` are the only public rows. L4C-5 will backfill historical answered queries.

## Hard stops (apply to every L4C build)

- No edit to `src/components/library/MasterSearchHero.tsx`.

- No edit to `src/components/library/MasterSearchTrigger.tsx`.

- No edit to `src/lib/verdictTone.ts` literal values (alias keys only, by explicit decision).

- No edit to `/report/$queryId` route or its FIX-REPORT-404 wiring.

- No edit to existing homepage sections beyond the three L4C-4 entry points.

- No Helix / Gemini / GradientText rename.

- No new package.

- No global CSS edit.

- No new docs file other than this one.

- No publish from inside an L4C build chat. Publish is a separate explicit owner step.

## Open questions (locked answers)

- Q1 Card aspect ratio: free-flow (no fixed ratio); line-clamps drive height. Locked.

- Q2 Desktop hover reveal: bottom slide-up. Locked, L4C-3.

- Q3 Mobile tap: single tap navigates directly. Locked.

- Q4 Empty/loading state: skeleton cards. Locked.

- Q5 Recently Viewed row: deferred. Revisit after L4C-3.

- Q6 `answers`-kind rows in grid: rendered but CTA disabled. Routing wired in L4C-3.

## Change log

- 2026-06-26 DOCS-1 created.

- 2026-06-26 DOCS-1-AMEND complete spec written.

## L4C-5 Bulk Backfill — 2026-06-27

### Outcome

- 29 query rows promoted from private to public library.

- Total public library cards: 8 (original seed) + 29 (L4C-5) = 37.

- 1 candidate row excluded for PII hint and remains private.

### Excluded Row (PII)

- query_id: `3ca1571b-0255-48f2-9639-3f1ca02f4c47`

- symbol: RVNL

- reason: Raw question contained "my profit" phrasing matching the PII regex.

- status: Remains `is_public_library = false`. Do not re-promote without manual 

  re-review.

### Selection Policy (locked, applied)

- Source: `public.queries` where `status = 'ai_answered'`, `ai_report IS NOT NULL`, 

  `is_public_library = false`.

- Order: `created_at DESC`.

- Cap: up to 30 rows per backfill batch ("up to 30" — 29 acceptable, do not 

  backfill to reach 30).

- PII gate: HALT and request human approval if any candidate matches the locked 

  regex (`my profit`, `my loss`, `my capital`, account/phone/email patterns, etc.).

### Canonical Verdict Normalization (new — locked from L4C-5)

The `ai_report->'final_verdict'->>'action'` field returns raw AI actions which 

must be normalized to satisfy the `library_items.verdict` CHECK constraint:

| Raw AI action | Stored verdict |

|---------------|----------------|

| BUY           | BUY            |

| HOLD          | HOLD           |

| AVERAGE       | AVERAGE        |

| EXIT          | EXIT           |

| PARTIAL_EXIT  | PARTIAL_EXIT   |

| WAIT          | WAIT           |

| WATCHLIST     | WAIT           |

| SELL          | EXIT           |

| AVOID         | EXIT           |

| anything else | NULL           |

This mapping is canonical and must be reused by any future projection trigger 

or backfill that touches `library_items.verdict`.

### Locked JSONB Paths (discovered in L4C-5 pre-flight)

- Verdict: `ai_report->'final_verdict'->>'action'`

- Summary/excerpt: `COALESCE(ai_report->'final_verdict'->>'summary_reason', 

  ai_report->>'summary')`

- Sector: `NULLIF(q.sector_canonical, '')`

### body_excerpt Formatting (locked)

- Source: summary path above.

- Strip markdown characters: `# * _ \` >`

- Truncate to ≤ 280 characters.

### Files Produced by L4C-5

- Forward migration: `supabase/migrations/20260627063841_b38c9c26-739f-4c18-938a-8ea5d82ca8a9.sql`

- Rollback (manual, review-only): `review_sql/20260627070000_l4c5_bulk_backfill_30_rollback.sql`

### Open Items After L4C-5

- `PII-REGEX-2`: tighten the PII regex to also flag past-purchase-price phrasing 

  (`bought at`, `purchased at`, `holding from`, `entered at`, `avg price`) before 

  the next backfill batch.

- `LIBRARY-VIEW-COUNTER-1`: wire up `view_count` so the "Most viewed" toolbar 

  sort becomes functional.

- `L4C-PAGINATION-1`: numbered pagination (1 2 3 … N) at 24 cards/page once 

  library size grows past ~80 rows.


---

## Deliberate Deviations from Spec (running log)

This section records intentional deviations from the original locked spec that were accepted with audit-trail approval. Every deviation here has a known author, date, and risk assessment. Future audits (e.g. QA-1) walk this log to verify nothing was changed silently.

### DEV-001 — `/library` fetch limit raised from 60 to 200

- **Location:** `src/routes/library.index.tsx`, function `fetchLibraryGrid`, `.limit(200)` (was `.limit(60)`).
- **Change:** Increased Supabase query limit on `library_items` fetch.
- **Authority:** Bundled into L4C-PAGINATION-1 (2026-06-27) for future-batch headroom.
- **Risk:** MEDIUM — payload ~3.3× larger when library exceeds 60 rows. Acceptable on broadband, measurable on slow 3G. No server-side pagination yet (deferred to future `L4C-PAGINATION-2` when library exceeds ~500 rows).
- **Locked by:** Human approval after super-agent flagged scope creep.
- **Date:** 2026-06-27.

---

### DEV-002 — PII-REGEX-2A — Lock-set correction (2026-06-27)

Status:    ACCEPTED

Context:   Prior PII-REGEX-2A draft summary misstated the lock-set 
           as 10 tokens (4 structured + 6 phrase), omitting 3 phrase 
           tokens from the canonical Locked Hazard Patterns 
           (specifically: my profit, my loss, my capital). The 
           positive-fixture self-test anchors on "my profit" (RVNL 
           buy-price question, query id 
           3ca1571b-0255-48f2-9639-3f1ca02f4c47), so a 10-token 
           codification silently fails the self-test on the 
           positive fixture.

Decision:  Restore to the spec-exact 13-token set (4 structured + 
           9 phrase). Codifying, NOT widening — the 3 missing 
           phrases were always part of the spec intent per DOCS-1c 
           line 337.

Risk:      LOW — interior-codification correction, no data mutation, 
           no new hazard surfaces, no callers yet, function inert 
           until referenced.

Authority: Human override (Option A); DOCS-1c line 337 is the 
           canonical source.

Locked-by: PII-REGEX-2A migration applied successfully with all 5 
           verification gates GREEN (positive fixture TRUE, all 29 
           L4C-5 negatives FALSE, exactly 2 files touched, function 
           exists in DB, no scope deviations declared).

### Canonical PII lock-set (post-DEV-002, immutable through 
PII-REGEX-2B and L4C-5-BATCH-2)

The authoritative lock-set for `public.fn_has_pii_hint(text)` is 
**13 tokens** (4 structured + 9 phrase):

**Structured (4):**

1. Email addresses (RFC-light)

2. Phone numbers (10-13 digits, optional `+`, spaces, dashes)

3. Aadhaar-style 12-digit groups (optional spaces)

4. PAN cards (`[A-Z]{5}[0-9]{4}[A-Z]`)

**Phrase patterns (9):**

5. `my profit`

6. `my loss`

7. `my capital`

8. `purchased at`

9. `holding from`

10. `entered at`

11. `bought at`

12. `average price`

13. `avg price`

Any future reference to "the PII lock-set" or "the 2A lock-set" 
means these 13 tokens, anchored with `~*` case-insensitive matching 
and `\y` word boundaries on the phrase group.

### DEV-NNN — PII-REGEX-2B — Lock-set widening pattern (placeholder)

Status:    PENDING (to be filled when 2B ships)

Context:   2A codifies the spec lock-set exactly. 2B will widen 
           with bounded patterns (e.g. `bought.{1,40}at\s+\d+`) to 
           catch real-world purchase-price phrasing that the 2A 
           `\ybought at\y` adjacency boundary cannot detect. 2B 
           must also grandfather the 6 already-live library_items 
           rows containing purchase-price phrasing (per Option 1 
           decision on 2026-06-27).

Decision:  TBD when 2B is drafted.

Risk:      MEDIUM (widening, retroactive scan, grandfather allowlist).

Authority: Human override Option 1 (grandfather + widen forward) 
           locked 2026-06-27.

Locked-by: PII-REGEX-2B migration apply (pending).

---
