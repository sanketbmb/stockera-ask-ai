# Wave 5g — Sub-track B Build Plan

Frontend-only. No backend / verdict / scoring changes. PROMOTION_RULES_ENABLED=false, SHOW_PLACEHOLDER_MODULES=false. Stock Picker stays deferred.

## Goal

Replace the fixed `LABEL_GAP_PCT = 13` heuristic in `PriceBand` with a real measurement pass, plus a TABLE_MODE escape hatch for ultra-dense clusters. No label overlap, no synthetic prices, monotonic dot order preserved.

## File touched (single file)

`src/components/analysis/StockAnalysisReport.tsx` — `PriceBand` only, roughly L400-L667. No type changes, no contract changes to `StockAnalysisPayload["levels"]`, no other component touched.

## Algorithm (4 passes)

```text
PASS 1 (existing) : exact-value merge (L446-459) → near-merge (L469-492)
                    produces `groups[]` with x ∈ [0..100]
PASS 2 (NEW)      : measurement
                    - one ref per group label
                    - one ref for the rail container
                    - useLayoutEffect after first paint:
                        realPct[i] = labelRect.width / railRect.width * 100
                      cache in state; ResizeObserver on rail re-runs it
PASS 3 (NEW)      : reflow
                    - re-run 4-lane assignment using realPct[i] instead of
                      constant 13. Same-lane collision when
                        |x_i - x_j| < (realPct_i + realPct_j) / 2 + PAD_PCT
                      with PAD_PCT = 1.5
PASS 4 (NEW)      : density gate
                    - if ANY group has no collision-free lane across
                      {top-0, bottom-0, top-1, bottom-1}, flip whole band to
                      TABLE_MODE
```

First paint uses the current heuristic (prevents layout shift / flash); the measured pass overrides on the next frame. SSR/print: `useLayoutEffect` falls back to `useEffect` on the server, so print path either rehydrates and measures, or accepts heuristic — both are acceptable degradations (print sheet is wider, fewer collisions).

## TABLE_MODE fallback

When density gate trips:

- Keep rail + dots (visual order indicator preserved).
- Hide all per-slot labels.
- Render compact 2-column table beneath the rail: `[Label] [Price]`, sorted left-to-right by `x` (already monotonic from PASS 1). For multi-item exact-merge groups, render one row per real label/price (no synthetic merge).
- Color tokens: S/SL → rose, Entry/LTP → primary, R/T → emerald (semantic; reuse existing Tailwind classes already in the file).
- Caption: "Levels are tightly clustered — shown in table for clarity."
- ZoneBand (preferred-entry diamond) still renders above; its label stays since it's a single anchor, not part of the slots loop.

## State / refs added

```ts
const railRef = useRef<HTMLDivElement | null>(null);
const labelRefs = useRef<Array<HTMLDivElement | null>>([]);
const [realPct, setRealPct] = useState<number[] | null>(null);
const [tableMode, setTableMode] = useState(false);
```

- `useLayoutEffect` depends on `groups.length` and `realPct === null` reset triggers.
- `ResizeObserver` on `railRef.current` re-measures on container width change.
- Cleanup observer on unmount.

## Slot assignment

Extract the 4-lane assignment into a pure helper inside `PriceBand`:

```ts
function assignLanes(groups: Group[], widthsPct: number[], padPct = 1.5) {
  // returns { slots: Slot[]; overflow: boolean }
}
```

- First call uses `widthsPct = groups.map(() => 13)` (heuristic, first paint).
- After measurement, called again with `realPct`.
- `overflow === true` flips `tableMode`.

## Guardrails honored

- Real prices preserved everywhere — TABLE_MODE renders each item's actual `v`, no `(a+b)/2` synthesis.
- Monotonic L→R dot order (groups already sorted by `v` at L459).
- Empty / partial-data early return at L461-463 unchanged.
- Zone band (`showZoneBand`) rendering at L548-559 / L574-589 unchanged.
- All color usage stays on existing semantic Tailwind tokens already in the file.
- No `useEffect + fetch`, no router changes, no new dependencies.

## Verification

Build, then visually check each in `browser--view_preview`:

1. `/analysis/ICICIBANK?horizon=medium-term` — dense cluster, expect either clean 4-lane layout or TABLE_MODE.
2. `/analysis/SBIN?horizon=medium-term` — dense cluster.
3. `/analysis/TMPV?horizon=long-term` — dense post-demerger entity, full render.
4. `/analysis/HDFCBANK?horizon=medium-term` (or INFY) — sparse case, no regression, single-tier layout retained.
5. Mobile width via `browser--set_viewport_size` 375×812 on ICICIBANK — expect TABLE_MODE to trigger more aggressively, no horizontal scroll.
6. `/print/ICICIBANK` (if route exists; it's `src/routes/print.$symbol.tsx`) — confirm print path renders without broken layout.

Report which cases triggered TABLE_MODE.

## Deploy surface

Frontend bundle only. No edge function deploy, no migration.

## Credit estimate

~10-15 credits.

STOP after Sub-track B verification. Do not start Stock Picker.  
  
Approve Sub-track B for BUILD with three mandatory technical overrides:

1) useLayoutEffect Dependency Fix:

The dependency array for the measurement pass MUST include a content hash of the groups, not just the length. Use: [groups.length, [groups.map](http://groups.map)(g => g.v.toFixed(2)).join("|")]. This ensures the UI reflows correctly when prices update (LTP polling) even if the number of markers remains the same.

2) Two-Commit Execution:

Because this is the third attempt at PriceBand, perform the build in two distinct commits for safety:

- Commit 1: Implementation of PASS 1 (Near-merge) and PASS 2 (Measurement pass + refs). Verify measurement is working in console logs.

- Commit 2: Implementation of PASS 3 (Measured reflow) and PASS 4 (Table-mode fallback).

This allows us to bisect the failure point if the reflow logic itself has issues.

3) Vertical Anchor Verification:

Explicitly ensure that the leader-line heights (8px tier-1 / 40px tier-2) are dynamically linked to the assigned lane. Confirm in the diff that top/bottom offsets are correctly applied per lane.

Verification Matrix (8 cases):

- ICICIBANK long-term (dense cluster)

- SBIN long-term (dense cluster)

- TMPV long-term (verify post-demerger render)

- HDFCBANK / INFY (sparse case - ensure single-tier layout stays clean)

- Mobile View (375px) - confirm Table Mode triggers correctly without overlap

- Print Route (/print/$symbol) - confirm layout isn't broken

- TMCV intraday (from Sub-track A) - confirm graceful no-render behavior

- Any INSUFFICIENT_DATA case - confirm early-return branch works.

STOP after Sub-track B verification and report which cases triggered TABLE_MODE.

Do not start Stock Picker.

&nbsp;