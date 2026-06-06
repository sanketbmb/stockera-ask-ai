## Wave 5h — Master Hardening Plan

Frontend + one resolver hop. No scoring changes. No Stock Picker. Three independent sub-tracks, sequenced to land in one wave but verifiable in isolation.

---

### Sub-track A — PriceBand overlap on `/report/$queryId`

**Current state.** `src/routes/report.$queryId.tsx` already mounts the live `<StockAnalysisReport>` (not a static snapshot) and the PriceBand component uses `useIsoLayoutEffect` + `ResizeObserver`. So the 4-pass reflow IS running on frozen reports. Overlap therefore points at the measurement pass itself, not the route.

**Likely causes to investigate (in order):**

1. **Zero-width first-paint trap.** On /report the rail is inside a `Tabs` panel; hidden panels can yield `railW <= 0`. We `return` without scheduling a remeasure on the next show.
2. **Heuristic-only first paint persists.** If `setRealPct(widths)` runs but the `groupsKey` invalidator re-fires (LTP poll, frozen-stale opacity flip) immediately after, we keep oscillating between null and measured.
3. `**labelRefs` orphaning in `tableMode`.** When TABLE_MODE flips on, label DOM is removed, refs go null, next measure falls back to heuristic → overflow gate flips back → infinite "non-overlap" claim while CSS still overlaps the prior frame.
4. **Wide-viewport edge.** Current viewport in repro is 4525 CSS px; constant `LANE_OFFSETS` (px) + `PAD_PCT = 1.5` (%) can still allow visual overlap at very narrow rails when label content is long ("ENTRY / LTP ₹1,321.90" multi-line).

**Build steps (only in `src/components/analysis/StockAnalysisReport.tsx`, PriceBand region L495-L605):**

1. **Tab-aware remeasure.** Wrap the measure block so that when `railW <= 0` we install a one-shot `IntersectionObserver(rail, { threshold: 0.01 })` that re-invokes `measure()` on first visibility, then disconnects. Also keep the existing ResizeObserver.
2. **Stable measured state.** Gate the `setRealPct(null)` invalidator on a real change of `groupsKey` (compare against a `useRef<string>` of the last seen key). Polled LTP-only re-renders that don't change `groupsKey` must not reset measurement.
3. **Always-measured collision check.** Move the "tableMode = overflow && realPct !== null" gate to `tableMode = overflow && (realPct !== null || stableHeuristicConfirmed)` where `stableHeuristicConfirmed = groups.length >= 5` (heuristic overflow at high density is enough signal — avoids the orphaning oscillation).
4. **Cluster padding bump.** Raise `PAD_PCT` from `1.5` to `2.0` and add a per-group min-side spacing pass: after lane assignment, if two same-lane neighbours have center gap < their summed half-widths + `PAD_PCT`, push the later one down a tier even if that means tier-1 (we already model tier-1).
5. **TABLE_MODE styling parity.** Verify TABLE_MODE renders inside the `printMode` print route (`/print-stock/$queryId`) — currently the rail keeps dots, but the table appears below; confirm the page break doesn't split rail from table.

**No backend changes. No type changes. No scoring touched.**

---

### Sub-track B — Ambiguity picker for Post-a-Query (ICICI / Reliance / Adani / Tata Motors)

**Root cause.** `src/lib/intent-router.functions.ts` calls Gemini with a system prompt that resolves "ICICI" → `ICICIBANK` on its own. By the time the freeze fn runs, the symbol is already disambiguated, so the orchestrator never emits `SYMBOL_AMBIGUOUS`. The /analysis route works because the URL path passes the raw string straight to the orchestrator's resolver.

**Strategy.** Insert a deterministic, server-side **ambiguity gate** between the router and the freeze write — never trust Gemini's `symbol` blindly when the user's raw text contains an ambiguous stem.

**Build steps:**

1. **New file: `src/lib/symbol-ambiguity-gate.ts**` (server-safe; pure).
  - Export `detectAmbiguousStem(rawText: string): { stem: string; candidates: { symbol: string; company_name: string|null; exchange: "NSE" }[] } | null`.
  - Hard-coded stem map (single source of truth, mirrors `supabase/functions/_shared/symbol-successors.ts` family groups):
    - `ICICI` → ICICIBANK, ICICIPRULI, ICICIGI
    - `TATA MOTORS` / `TATAMOTORS` → TMCV, TMPV
    - `RELIANCE` (when no qualifier like "industries"/"jio"/"power") → RELIANCE, JIOFIN, RPOWER
    - `ADANI` (when no qualifier) → ADANIENT, ADANIPORTS, ADANIPOWER, ADANIGREEN, ADANIENSOL, ATGL
  - Stem detection: case-insensitive word-boundary regex on `query_text + custom_question`, gated so that exact unambiguous tickers ("ICICIBANK", "ADANIPORTS") never trip the gate.
2. **Wire into `QueryForm.handleSubmit**` (`src/components/query/QueryForm.tsx`):
  - After router prefill but BEFORE persisting `stockSymbol` for `usesV1Engine` intents, call `detectAmbiguousStem(queryText + " " + (anythingElse ?? ""))`.
  - If a stem matches AND the user has not manually picked a ticker via `StockAutocomplete` (track via existing `autoDetected.stock` vs current `stockSymbol`), **set `stock_symbol` to the raw stem string** (e.g. `"ICICI"`) when inserting the `queries` row, and set a new boolean column `pending_ambiguity` (additive) OR — simpler, no migration — stash `{ kind: "SYMBOL_AMBIGUOUS", candidates }` into a new field on `audit_meta` at freeze time.
3. **Wire into `freezeOrReadReport**` (`src/lib/freeze-report.functions.ts`):
  - At the top of the handler, after loading the row, call `detectAmbiguousStem` on `row.query_text + row.custom_question`.
  - If it matches AND `stock_symbol` equals the raw stem (or matches one of the candidate family members but the raw text was the bare stem), short-circuit: return `synthesizeAmbiguousPayload({ candidates }, stem)` — same path already used for orchestrator-side ambiguity. **Do not persist into `ai_report**` (mirrors existing `UNSUPPORTED_SYMBOL` non-cache behavior at L338-L354).
  - Emit a single `audit_events` row `event_type: "symbol_ambiguous_short_circuit"`.
4. `**/report/$queryId` rendering** — already handled. `TierShapedReportContent` calls `isUnsupportedSymbolPayload(data)` and renders `<UnsupportedSymbolPanel>`. No change needed once freeze fn returns the synthesized payload.
5. **Candidate click → `/analysis/$symbol**` — already works via existing `CandidateButton` in `UnsupportedSymbolPanel.tsx`.

**No new DB columns. No orchestrator change. No router prompt change** (we treat router output as a hint, not truth, for ambiguous stems).

---

### Sub-track C — Global parity verification

No code changes beyond A + B. Just a checklist exercised against both routes:


| Input                                         | Route    | Expected                                                               |
| --------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `/analysis/tata%20motors`                     | analysis | picker (TMCV, TMPV)                                                    |
| Post-query "Should I buy Tata Motors?"        | report   | picker (TMCV, TMPV)                                                    |
| `/analysis/ICICI`                             | analysis | picker (ICICIBANK, ICICIPRULI, ICICIGI)                                |
| Post-query "Buy ICICI stock"                  | report   | picker                                                                 |
| Post-query "Analyze Reliance"                 | report   | picker (RELIANCE, JIOFIN, RPOWER)                                      |
| Post-query "Adani long-term view"             | report   | picker (Adani family)                                                  |
| Post-query "Analyze ICICIBANK" (exact ticker) | report   | normal report — gate skipped                                           |
| Click any candidate from a /report picker     | navigate | lands on `/analysis/{symbol}?horizon=…&news=true` and renders normally |


PriceBand spot-checks (Sub-track A):

- `/analysis/ICICIBANK` (cluster)
- `/analysis/SBIN` (cluster)
- `/analysis/HDFCBANK` (sparse) — no TABLE_MODE
- `/analysis/SUZLON` long-term — frozen report, verify reflow
- `/report/{queryId}` for a Suzlon post-query — verify same reflow now triggers
- Mobile 375×812 — TABLE_MODE triggers on dense names

---

### Recommended execution order

**A → B → C verification**. PriceBand fix (A) is local to one component and risk-free; ship first to clear the visible bug. Ambiguity gate (B) touches the intake + freeze paths and benefits from being verified against a clean PriceBand. C is verification only.

Both A and B can be approved in the same founder response but should be built and committed in two distinct passes so visual regressions and ambiguity logic can be bisected independently.

---

### Files touched (preview)

- **A:** `src/components/analysis/StockAnalysisReport.tsx` (PriceBand region only, ~L495-L605)
- **B:**
  - new `src/lib/symbol-ambiguity-gate.ts`
  - `src/components/query/QueryForm.tsx` (submit path — symbol override)
  - `src/lib/freeze-report.functions.ts` (top-of-handler short-circuit)
- **C:** no code; verification only

### Guardrails reaffirmed

- No scoring / verdict logic changes
- No orchestrator changes
- No DB migrations
- No PDF backend changes (TABLE_MODE already reaches print route via shared component)
- Stock Picker remains deferred

STOP — awaiting approval.  
  
Approve Wave 5h Master Hardening Plan for BUILD. 

Execution Sequence:

1) Build Sub-track A first (PriceBand / Report Route fix):

- Implement Tab-aware remeasurement with IntersectionObserver.

- Ensure the 'groupsKey' content hash is used for stable measurements.

- Apply the PAD_PCT bump to 2.0.

- Verify on /report/{suzlon_id} and /analysis/ICICIBANK.

- STOP and report verification.

2) Then build Sub-track B (Ambiguity Gate for Post-a-Query):

- Create the src/lib/symbol-ambiguity-gate.ts with the stem map (ICICI, TATA, RELIANCE, ADANI).

- Wire it into QueryForm.handleSubmit and freezeOrReadReport.

- Ensure 'Post a Query' for 'ICICI' now shows the selection picker instead of auto-routing.

- Verify that clicking a candidate button routes correctly to /analysis/{symbol}.

Guardrails:

- Build and commit A and B separately.

- No backend scoring changes.

- No DB migrations.

- STOP after Sub-track B and perform the Global Parity Verification (Track C).

Once all 8 verification cases (ICICI, TATA, Reliance, Adani, etc.) pass on both routes, we will finalize V1 and open the Stock Picker thread.

&nbsp;