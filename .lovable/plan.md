# Stage 4A.3 — PLAN ONLY (UI polish + UX hardening)

## HARD GATE — 4A.2c blocker

Stage 4A.2c authenticated verification remains **OPEN** per founder notice. 4A.3 is approved **as a plan only**. 4A.3 may **NOT** move to APPLY, and no code writes, deploys, or file edits may be performed for 4A.3 until:

1. Founder closes Stage 4A.2c live authenticated verification for `/stock/INFY` → Analytics tab → signed-in `Refresh Analytics` request.
2. The response shape is confirmed: exactly the 12 top-level analytics keys, `final_verdict` with 3 keys, `audit_meta` with 8 keys, and all forbidden fields absent.

Any UI regression discovered during 4A.2c verification will reopen as a blocker before 4A.3 APPLY can begin.

---

## Summary

Presentation-only polish across the public `/stock/$symbol` surface. Zero backend, contract, RLS, schema, migration, dependency, cron, or provider changes. Analytics payload shape remains frozen at the Stage 4A.2c 12-key contract. No action-pill reintroduction. No premium/advisory fields leaked publicly.

---

## A. Exact file list proposed for edit (7 files, all presentation)

1. `src/routes/stock.$symbol.tsx` — page shell, tab wiring, skeleton
2. `src/components/stock-overview/StockHeader.tsx` — header rhythm + CTA placement
3. `src/components/stock-overview/AnalyticsTab.tsx` — tab wrapper spacing, CTA row, empty state
4. `src/components/stock-overview/analytics-cards/ScoreRingBlock.tsx` — ring + pillar readability
5. `src/components/stock-overview/StatCard.tsx` — chip/badge alignment, fallback marker
6. `src/components/stock-overview/AnalyticsProvenanceFooter.tsx` — footnote clarity
7. `src/components/stock-overview/OverviewTab.tsx` — card rhythm, mobile density

No other files touched. No `analytics-cards/*` payload-mapping card is edited except `ScoreRingBlock.tsx` (visual only).

---

## B. What each file solves

1. **stock.$symbol.tsx** — Skeleton doesn't match final layout (header 32/64 mismatch + 8-cell grid vs actual stat count). Tabs lack sticky offset on mobile; scroll jumps on tab change. Fix: skeleton matches real header + stat rhythm; `TabsList` gets `sticky top-0 z-10 bg-background/80 backdrop-blur` on mobile; on tab change, scroll container to top of tab panel (CSS `scroll-margin-top` on panel).
2. **StockHeader.tsx** — Header row uses `flex flex-wrap` which collapses on narrow widths (per responsive-layout-patterns rule). Personalized-AI CTA + secondary actions can wrap awkwardly. Fix: `grid grid-cols-[minmax(0,1fr)_auto] sm:flex`, `min-w-0` on text column, `shrink-0` on logo/avatar, `truncate` on company name, CTA promoted to right column on desktop and full-width below on mobile.
3. **AnalyticsTab.tsx** — Refresh CTA row + provenance footer both compete for the same vertical band. Empty state paragraph runs edge-to-edge on mobile. Fix: single meta bar (provenance-left, refresh-right) using the responsive grid pattern; empty state gets max-width, icon, and clearer signed-in vs signed-out copy hierarchy.
4. **ScoreRingBlock.tsx** — Ring diameter fixed → cropped on <360px; pillar labels wrap to two lines on mobile; tier-weight chips can float. Fix: `clamp()`-based ring sizing, pillar rows switch to 2-col grid on <sm, chips get `whitespace-nowrap shrink-0` and a subtle divider between raw / weight columns.
5. **StatCard.tsx** — Fallback/sector-fallback values look identical to real values; badge floats over long labels. Fix: consistent 3-row anchor (label → value → footnote/badge), sector-fallback badge with `title` tooltip using existing `Tooltip` primitive, `truncate` + `tabular-nums` on value.
6. **AnalyticsProvenanceFooter.tsx** — Timestamp + formula version render as raw strings; unclear what "on_demand_authenticated" means to a founder-facing viewer. Fix: humanized labels ("Refreshed just now · daily pre-warm"), muted-foreground tokens, keyboard-focusable info popover explaining public analytics vs personalized AI report distinction.
7. **OverviewTab.tsx** — Card rhythm inconsistent (`gap-4`/`gap-6` mixed); mini price chart competes with stat grid on mobile. Fix: unify to `gap-4 md:gap-6`, promote MiniPriceChart above stat grid on mobile, stat grid to `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`.

---

## C. Design-system primitives reused (no new components)

- `Card`, `CardContent`, `CardHeader` (shadcn)
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Button` (existing variants only: `default`, `outline`, `ghost`, `sm`)
- `Badge`, `Skeleton`, `Separator`, `Tooltip`, `Popover`
- Icons from `lucide-react` (already imported): `RefreshCw`, `Loader2`, `Info`, `TrendingUp/Down`
- Semantic tokens only: `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`, `bg-mesh` (existing utility)
- Existing animation utilities: `animate-fade-in`, `animate-scale-in`, `hover-scale`, `story-link`, `transition-colors`, `transition-transform`

No new tokens. No new CSS variables. No new component files.

---

## D. framer-motion status

**Present:** `framer-motion@^12.38.0` (already installed).

**Where used in this stage:** Only through **existing wrappers** already imported elsewhere in the codebase:
- `Reveal` (`src/lib/motion/Reveal.tsx`) — wrap each analytics card row in Overview and Analytics tabs for a subtle fade-in on mount, honoring `useReducedMotion`.
- `HoverLift` (`src/lib/motion/HoverLift.tsx`) — apply to `StatCard` for existing hover treatment consistent with rest of app.
- `useReducedMotion` — respected everywhere; users with reduced-motion preference get instant render.

**Not used:** No new `motion.*` primitives, no `AnimatePresence`, no `layoutId`, no gesture props authored in this stage. No new keyframes. No `MotionConfig` overrides. Tab transitions rely on shadcn's built-in `data-state` CSS only.

---

## E. 12-test UAT plan

| # | Scenario | Device | Auth | Symbol | Pass criteria |
|---|---|---|---|---|---|
| 1 | Header renders, CTA visible, name truncates | Desktop 1440 | signed-out | INFY | Personalized AI CTA visible right-aligned; name single line |
| 2 | Header responsive collapse | Mobile 375 | signed-out | HDFCBANK | Grid falls to 2-row layout; no overlap; CTA full-width below |
| 3 | Analytics tab — cached full-data | Desktop | signed-out | INFY | Score ring + 4 cards render; provenance footer shows "pre-warmed"; NO Refresh CTA |
| 4 | Analytics tab — cached, signed-in refresh | Desktop | signed-in | INFY | Refresh CTA visible right; click triggers request; toast on success; no layout shift |
| 5 | Analytics tab — fallback symbol | Mobile | signed-out | IREDA | Sector-fallback cards render intentionally; fallback chip visible; sector-based valuation wording visible; NO DATA chips visible where expected; no broken or partial layout; no console errors |
| 6 | Score ring pillar labels | Mobile 375 | any | INFY | Pillar rows 2-col grid; no label wrap to 3 lines; chips do not overflow |
| 7 | Sector-fallback marker | Desktop | signed-out | any fallback stock | `StatCard` shows sector-fallback badge with tooltip on hover/focus |
| 8 | Tab switch scroll behavior | Mobile | any | INFY | Switching Overview→Analytics scrolls panel top into view; sticky tabs remain visible |
| 9 | AI Reports teaser (signed-out) vs full (signed-in) | Desktop | both | INFY | Signed-out sees paywall teaser; signed-in sees full list; no leaked premium fields either way |
| 10 | Search → stock flow | Desktop | signed-out | search "infosys" → INFY | Autocomplete navigates; skeleton matches final layout; no CLS jump |
| 11 | Payload contract regression check | — | signed-in | INFY | Network tab: `public-analysis-fetch` response still has exactly the 12 top-level keys, `final_verdict` has 3 keys, `audit_meta` has 8 keys, no `action`, no `summary_reason`, no `trade_plan_*`, no `source_trace` |
| 12 | Dependency/package check | — | — | — | `git diff package.json bun.lockb` empty; no new imports from packages not already in dependency tree; edge functions unchanged |

Regression bar: tests 11 + 12 are hard gates — failure blocks stage completion.

---

## Hard constraints reaffirmed

- No migrations. No schema. No RLS. No `package.json` edits. No new dependencies.
- No changes to `generate-stock-analysis`, `public-analysis-fetch`, `stock-overview`, or any provider function.
- No changes to `types.ts` analytics fields. No action-pill. No `final_verdict.action`. No public premium leakage.
- File scope hard-locked to the 7 files in section A.
- Stop after PLAN. Do not APPLY.
