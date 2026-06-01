## Mission 1.5 — Phase 2.1b Plan

### Root cause (Task 1)

`src/components/analysis/StockAnalysisReport.tsx` line 572:

```ts
const initialTab = defaultActionTab ?? (suppressFreshTab ? "holding" : TIER_DEFAULT_TAB[tier]);
```

with

```ts
const TIER_DEFAULT_TAB: Record<QueryType, ...> = {
  "intraday": "fresh",
  "medium-term": "holding",   // ← bug: Fresh Entry medium-term lands on "I'm holding"
  "long-term": "exploring",
};
```

Default tab is derived from `query_context.query_type` (horizon tier), not from the actual user intent. For a Fresh Entry · ICICIBANK · medium-term report, tier is `medium-term` → tab defaults to `holding`. The route `src/routes/report.$queryId.tsx` only passes `defaultActionTab="holding"` when `isPhase2` (existing_position / averaging) — Fresh Entry falls through to `undefined`, hits the tier map, and lands on the wrong tab.

### Task 1 — Action Zone default sync

Change the contract so the default tab is driven by **intent**, not tier.

1. `src/routes/report.$queryId.tsx` — compute `defaultActionTab` from `queryType` for every report (not just Phase 2):
   - `fresh_entry` / `buy_decision` → `"fresh"`
   - `existing_position` / `stuck_position` / `averaging` / `should_average` → `"holding"`
   - anything else (legacy / unknown) → `undefined` (fall through)

   Always pass `defaultActionTab={resolved}`. Keep `suppressFreshTab={isPhase2}` unchanged.

2. `src/components/analysis/StockAnalysisReport.tsx`:
   - Keep the `defaultActionTab` prop as the primary source of truth.
   - Delete the `TIER_DEFAULT_TAB` map. New fallback when `defaultActionTab` is undefined: `suppressFreshTab ? "holding" : "fresh"` (Fresh Entry is the safe default for any non-Phase2 report — it matches the active query types we ship).
   - `useState` initializer already runs once → no hydration flicker, manual switching is preserved.
   - Print mode renders the same component, so the PDF inherits the corrected default automatically.

### Task 2 — Fresh Entry consistency sweep

Verify (no code change expected, just confirm) that for `queryType === "fresh_entry"`:
- `ReflectiveBanner` interpretation line reads "Fresh Entry · {SYMBOL} · {horizon}" (already via `buildInterpretation`).
- `phase2Addendum` falls through to `<FreshEntryAddendum />` (already gated by `isPhase2`).
- Action Zone now defaults to `fresh` (fixed in Task 1).
- No copy in `StockAnalysisReport` hard-codes "holding" language for the holding tab content when the active tab is `fresh`.

If any surface still says "holding" for a Fresh Entry report, fix in place; otherwise no change.

### Task 3 — Footer module hygiene

`StockAnalysisReport.tsx` line 974 iterates `audit_meta.source_trace` unfiltered. Add a tier-relevance filter that hides modules not applicable to the current tier, while keeping `source_trace` itself (canonical audit data) untouched.

Add a small map next to `TIER_LABEL`:

```ts
const TIER_IRRELEVANT_MODULES: Record<QueryType, string[]> = {
  "intraday":    ["compute-long-term-quality"],
  "medium-term": ["compute-intraday-microstructure"],
  "long-term":   ["compute-intraday-microstructure"],
};
```

Filter the render:

```tsx
{audit_meta.source_trace
  .filter(t => !TIER_IRRELEVANT_MODULES[tier].includes(t.module))
  .map((t, i) => ...)}
```

Rationale: a medium-term report shouldn't surface intraday-microstructure as an "active module"; the audit trail (DB / PDF JSON / source_trace consumer) still contains every probe. Purely a presentation filter.

### Task 4 — Regression safety

No changes to: orchestrator/Brain, scores, verdict thresholds, confidence math, trade-plan math, PDF pipeline wiring, Phase 3 intents, or schema.

### Files modified

1. `src/routes/report.$queryId.tsx` — derive `defaultActionTab` from `queryType` for all reports.
2. `src/components/analysis/StockAnalysisReport.tsx` — remove `TIER_DEFAULT_TAB`, new fallback rule, add `TIER_IRRELEVANT_MODULES` filter on footer modules.

### Verification

1. Open Fresh Entry · ICICIBANK · medium-term → tab defaults to **Fresh entry**.
2. Open Sell or Hold report → tab defaults to **I'm holding** (Fresh entry tab hidden).
3. Open Should I Average report → tab defaults to **I'm holding** (Fresh entry tab hidden).
4. Generate PDF for Fresh Entry → static print shows Fresh entry tab content as active.
5. Footer on medium-term report → no `intraday-microstructure` chip; intraday report → no `long-term-quality` chip.
6. Manually click another tab after load → state updates and persists (no snap-back).

### Blockers before Phase 3A

None expected. Phase 3 intents (`educational`, `sector_view`, `other`) remain flag-gated and continue to fall through to the safe Fresh entry default.
