# Wave 5g — Combined Plan (2 independent sub-tracks)

PROMOTION_RULES_ENABLED = false. SHOW_PLACEHOLDER_MODULES = false. Stock Picker stays deferred. Sub-tracks A and B are independent: each can be approved together but **must ship in separate builds** with their own visual verification.

---

## SUB-TRACK A — TMCV long-term INSUFFICIENT_DATA diagnosis

### A.1 Investigation summary

TMCV ("Tata Motors Commercial Vehicles") is the post-Oct-2024 demerger entity. Its NSE listing history is < 1 trading year. Pipeline trace for `/analysis/TMCV?horizon=long-term&news=true`:

- `supabase/functions/generate-stock-analysis/index.ts` L985-1015 — fans out to 8 module calls. For long-term: `compute-technicals`, `compute-fundamentals`, `compute-risk`, `compute-momentum`, `compute-sentiment`, `compute-trade-plan`, `compute-long-term-quality` (`compute-intraday-microstructure` skipped by tier).
- L1018-1022 — normalizers convert raw module output to `{ score, snapshot }`. A module returns `null` when its inputs are missing.
- L1031-1065 — sector-fallback patches `fundamental` ONLY (sector aggregates). It does NOT rescue `technical`, `risk`, `momentum`, or `long-term-quality` — those need per-symbol candle history.
- L664-672 — `missingCount` counts any pillar where `score == null` AND `weight > 0`.
- L728-743 — verdict gate:
  ```
  missingCount >= 3
    || missingCount >= ceil(totalModulesConsidered * 0.6)
    || (overall === 0 && allPillarsNull)
  ⇒ action = AVOID, verdict_reason = "INSUFFICIENT_DATA"
  ```

### A.2 Root cause (most likely)

TMCV has **insufficient candle history for long-term horizon**. Long-term weighting profile leans on `technical (200-DMA, 52w high/low)`, `risk (1y vol, max drawdown, beta vs benchmark)`, `momentum (12m/6m/3m returns)`, and `long-term-quality` — all of which need ≥ 250 trading days. Post-demerger TMCV (~Oct 2024 listing) does not yet have that window, so 3+ pillars return null and the universal `missingCount >= 3` gate at L735-742 fires `INSUFFICIENT_DATA`.

This is **expected, honest behavior — not a backend bug**. TMPV (same demerger sibling) renders because Tata Motors Passenger Vehicles inherited the legacy listing/history of the pre-demerger parent ticker; TMCV is the freshly-issued counterpart with a short series.

### A.3 What to confirm before building

A 10-minute confirmation pass (read-only) before any code change. Inspect the trace block returned in the live TMCV payload (it already contains per-module `ok` / `code` / `error`). Expected pattern:


| module                    | expected for TMCV long-term          | confirms cause |
| ------------------------- | ------------------------------------ | -------------- |
| compute-technicals        | `INSUFFICIENT_HISTORY` or score null | yes            |
| compute-fundamentals      | likely OK or sector_fallback         | rules out      |
| compute-risk              | `INSUFFICIENT_HISTORY`               | yes            |
| compute-momentum          | `INSUFFICIENT_HISTORY`               | yes            |
| compute-long-term-quality | null / `INSUFFICIENT_HISTORY`        | yes            |
| compute-trade-plan        | likely null                          | secondary      |


Falsification controls (all read-only, no code):

1. **TMCV long-term** — expect ≥3 pillars null, trace codes show `INSUFFICIENT_HISTORY`. Confirms diagnosis.
2. **TMPV long-term** — expect full report (already verified). Confirms it's TMCV-specific, not orchestrator-wide.
3. **INFY long-term** — expect full report with all pillars populated. Confirms long-term pipeline is healthy.

If trace shows `FETCH_FAILED` or `HTTP_500` instead of `INSUFFICIENT_HISTORY`, the diagnosis flips from "honest" to "fetch/provider bug" — see A.5 contingency.

### A.4 Recommended fix — honest UX copy only

If A.3 confirms expected-behavior, the smallest safe change is **frontend copy**, not backend logic:

**File:** `src/components/analysis/StockAnalysisReport.tsx` — the existing `INSUFFICIENT_DATA` banner.
**File:** `src/components/report/UnsupportedSymbolPanel.tsx` — NOT touched; separate state.

Change: when `verdict_reason === "INSUFFICIENT_DATA"` AND the symbol's listing age is short (heuristic: any pillar trace returns `INSUFFICIENT_HISTORY`), surface a one-liner:

> "TMCV was created from a recent corporate action and does not yet have enough trading history for a long-term verdict. Try the medium-term or intraday horizon, or analyse TMPV."

Two horizon-switch CTAs (`medium-term`, `intraday`) + one cross-symbol CTA (`TMPV`) — frontend-only, reuses existing Link helpers, no scoring change.

### A.5 Contingency — if traces show provider failures instead

If `compute-technicals` / `compute-risk` show `HTTP_500` or `FETCH_FAILED` instead of `INSUFFICIENT_HISTORY`, the issue is the data provider not yet ingesting TMCV's series. That is a **backend ingestion fix** (`supabase/functions/dhan-fetch` or `finedge-fetch`) — out of scope for Wave 5g. Document as a separate ticket; ship the honest copy in A.4 anyway.

### A.6 Deploy surface

- Frontend bundle only (assuming A.4 path).
- No edge function deploys.
- No DB migrations.

### A.7 Credit estimate

~3-5 credits (read trace, update one component, regression-check 3 symbols).

---

## SUB-TRACK B — PriceBand / Key Price Zones cluster readability

### B.1 Current state (file + line citations)

`src/components/analysis/StockAnalysisReport.tsx`:

- L399-462: `PriceBand({ levels, current, partialNote })` — entry point.
- L445-458: exact-value merge (paise-level dedup).
- L468-491: near-x + near-price cosmetic merge (NEAR_X_PCT=0.8, NEAR_PRICE_PCT=0.15%).
- **L493-535**: 4-lane stagger (`top-0`, `top-1`, `bottom-0`, `bottom-1`) using **character-count heuristic** `LABEL_GAP_PCT = 13`.
- L544-572: rail + tick rendering.
- L589-686 (continues): per-slot label rendering with leader lines.

Root weakness: collision detection uses a fixed `13%` width estimate. Real label widths vary with font metrics, currency width, and rail container width — so dense clusters (ICICIBANK, SBI when S1/SL/Entry/LTP fall within 1%) still overlap visually even though the lane assignment "passes".

### B.2 Algorithm — measurement-based, four-pass

```text
PASS 1 (current)  : exact merge → near-merge → produce N groups with x∈[0..100]
PASS 2 (NEW)      : measure — useLayoutEffect after first paint
                    refs[i].getBoundingClientRect().width / railWidth → realPct[i]
                    cache in state, re-run on resize via ResizeObserver
PASS 3 (NEW)      : reflow — re-run the 4-lane assignment using realPct[i]
                    instead of constant 13% gap; lane i collides with lane j
                    when same-lane AND |x_i - x_j| < (realPct_i + realPct_j)/2 + PAD_PCT
                    PAD_PCT = 1.5
PASS 4 (NEW)      : density gate — if after reflow ANY group still has no
                    collision-free lane in {top-0, bottom-0, top-1, bottom-1},
                    flip the whole band into TABLE_MODE (see B.3)
```

State: `const [measured, setMeasured] = useState<number[] | null>(null)` — first paint uses heuristic (current behavior, prevents layout shift), then measured pass overrides. PDF capture: `useLayoutEffect` runs before paint, so server-rendered / `print.$symbol` route already sees measured widths if rendered with hydration, OR we keep heuristic in print path (acceptable degradation; print sheet is wider so collisions are rarer).

### B.3 Table-mode fallback

When density gate trips:

- Keep the rail + dots (still useful visual order indicator).
- Hide all labels.
- Render a compact 2-column table directly below the rail: `[Label] [Price]` rows, sorted left-to-right by `x`, S/SL in rose, Entry/LTP in primary, R/T in emerald.
- Caption: "Levels are tightly clustered — shown in table for clarity."

This honors "preserve real prices, no synthetic midpoint" guardrail.

### B.4 Files touched

- `src/components/analysis/StockAnalysisReport.tsx` — `PriceBand` only (L399-686 ish). One new sub-component `PriceLevelsTable` co-located, or extracted to `src/components/analysis/PriceLevelsTable.tsx` if the file grows too large.
- No type changes, no contract changes to `StockAnalysisPayload["levels"]`.

### B.5 Verification targets

1. **ICICIBANK** (close-cluster) — labels must not overlap; if forced into table mode, table renders all 6-8 prices.
2. **SBIN** (close-cluster) — same.
3. **TMPV long-term** (dense post-demerger entity that DOES render) — labels readable.
4. **HDFCBANK** or **INFY long-term** (sparse) — labels stay in current single-tier layout, no regression.
5. **PDF capture** for at least one of the above — confirm print output matches on-screen (measurement happens pre-paint, so should be identical; if not, accept heuristic fallback in print path).
6. **Mobile width** (320px container) — table mode should trigger more aggressively; verify no horizontal scroll.

### B.6 Guardrails honored

- Frontend only — no backend, no scoring, no verdict-logic changes.
- Real prices preserved everywhere (no midpoint synthesis).
- Monotonic left-to-right dot order preserved (groups already sorted by `v` at L458).
- Empty / partial-data path unchanged (L460-462 early return).

### B.7 Deploy surface

- Frontend bundle only.

### B.8 Credit estimate

~10-15 credits (measurement pass + reflow + table fallback + 5 regression checks across 2 horizons).

---

## Execution order recommendation

**Build A first, then B.** Two reasons:

1. A is ~5 credits and frontend-copy only — ships in one short loop, unblocks honest UX for the TMCV demerger case immediately.
2. B is a larger refactor of `PriceBand` with measurement + state — wants its own focused loop with regression screenshots across 5 symbols.

Both can be **approved in the same founder response** but **must build and verify separately** (no bundling — explicit Wave 5f-style guardrail). After A ships and TMCV honest-copy is visually verified, queue B.

---

## Pulled-forward deferred work

**None.** Sub-track A's contingency (provider ingestion fix for TMCV in `dhan-fetch` / `finedge-fetch`) is explicitly left deferred and out of Wave 5g scope.

STOP after plan. No build until founder approval per sub-track.  
  
Approve Wave 5g combined PLAN for BUILD. 

Execution order:

1) Build Sub-track A first:

- Implement the 'honest copy' UX for INSUFFICIENT_DATA on short-history stocks like TMCV.

- Surface the one-liner explanatory message and horizon-switch / TMPV-link CTAs.

- Verify on /analysis/TMCV?horizon=long-term.

- STOP and report verification.

2) Then build Sub-track B:

- Implement the 4-pass measurement-based PriceBand reflow.

- Use vertical tiers + leader lines to avoid overlaps.

- Include the 'table-mode' escape hatch for ultra-dense clusters.

- Falsify against: ICICIBANK (dense), SBIN (dense), INFY (sparse).

- Verify monotonic order and mobile responsiveness.

Guardrails:

- No bundling: ship A and B in separate build loops.

- Frontend only: no backend scoring or weight changes.

- No Stock Picker work yet.

- PROMOTION_RULES_ENABLED = false.

- SHOW_PLACEHOLDER_MODULES = false.

Return the exact files changed and visual verification screenshots after each sub-track.

&nbsp;