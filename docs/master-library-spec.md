# Master Library Spec — Stockera

> Governance doc. Every L4C build prompt starts with:

> "Read `docs/master-library-spec.md` and treat as immutable governance."

## Status

- DOCS-1 (this file) — created.

- FIX-3 (verdict tones + MasterSearch tabs) — live.

- L4C-1 through L4C-5 — pending.

## Bindings (FIX-3 deliverables)

- `src/lib/verdictTone.ts` — canonical export module.

  - Named exports: `VERDICT_TONE_FILLED`, `VERDICT_TONE_OUTLINE`.

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

| MasterSearch.tsx internal | `VERDICT_TONE_FILLED` |

**Rule:** marquee-style rows (filled chip) use `VERDICT_TONE_FILLED`. Outline-pill lists (bordered) use `VERDICT_TONE_OUTLINE`. When in doubt, ask before importing.

## MasterSearch popup

### Tabs

- **Latest answered** (default)

  - Visibility: pre-3-char query, or when user selects the tab.

  - Data source: direct `library_items` query (NOT `fn_library_search`).

  - Page size: 12.

  - Empty-state copy: "No answered reports yet — be the first to ask." with `/post-query` inline link.

- **Search**

  - Visibility: when `debouncedQ.length >= 3`.

  - Data source: existing `library-search` edge function.

  - Sections: 📊 STOCKS, 📝 AI REPORTS, 🎥 VIDEOS, 💬 COMMUNITY, 👤 ANALYSTS.

### Query contract — Latest answered

```text

queryKey  : ['master-search-recent']

staleTime : 5 * 60 * 1000

selector  : public.library_items

              .select('id, kind, source_table, source_id,

                       symbol, symbol_exchange, title, verdict,

                       sector, analyst_id, body_excerpt,

                       published_at, is_public, is_tombstoned')

              .eq('is_public', true)

              .eq('is_tombstoned', false)

              .not('symbol', 'is', null)

              .not('verdict', 'is', null)

              .order('published_at', { ascending: false, nullsLast: true })

              .limit(12)

RLS       : library_items_select_public_or_owner

              (anon-readable when is_public = true)
