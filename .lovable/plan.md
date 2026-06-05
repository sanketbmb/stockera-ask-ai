# Wave 5c — Visual Polish (PLAN ONLY)

Frontend-only. No backend, no scoring, no weights, no RLS, no sentiment pipeline, no stock-picker. `PROMOTION_RULES_ENABLED` stays `false`. Landing page untouched.

---

## Pre-plan flag — needs founder decision

**Returns-strip schema gap.** `returns_snapshot` (src/types/stock-analysis.ts L70-77) exposes `one_week`, `one_month`, `three_month`, `one_year`, `vs_nifty_one_month`, `vs_nifty_three_month`. **There is no `six_month` field** in the orchestrator payload or in compute-momentum. The brief asks for "1M / 3M / 6M / 1Y / vs Nifty".

Two options — pick one before Build:

- **(A) Drop 6M** and render `1M / 3M / 1Y / 1M vs Nifty / 3M vs Nifty`. Stays frontend-only. **Recommended.**
- **(B) Keep 6M** which requires adding a field in compute-momentum + orchestrator + types. That violates the "no backend" guardrail of Wave 5c and should be its own wave.

Plan below assumes (A).

---

## Item 1 — Restore horizontal price-zone axis

### Current code

File: `src/components/analysis/StockAnalysisReport.tsx`

- `PriceBand` component: L398–595 (declared L398, returns at L502)
- Horizontal axis line: **already present** at L516–521 (`motion.div` with `bg-gradient-to-r from-rose-300 via-border to-emerald-300`, `h-px`).
- Empty/insufficient short-circuit: L457–459 returns the italic paragraph and renders no axis.
- Dots: L538–595.

### Diagnosis

The axis element exists but is a single `h-px` (1-CSS-pixel) gradient between three muted stops on `bg-card`. Against the surrounding 24px zone band (L504–515) and the dot ring shadows, it visually disappears on the populated state — which matches the user-reported regression even though no line was deleted. There is no git evidence of a removal; this is a perceived disappearance from contrast loss.

### Change (purely presentational)

L516–521 only. Replace the single hairline with a clearly visible rail:

- Bump from `h-px` to `h-0.5` (2px) and switch to a solid `bg-border` mid-section with rose→emerald end-cap gradients (or keep gradient but raise alpha — `from-rose-400/70 via-border to-emerald-400/70`).
- Add tick-marks at each `slots[i].x` percentage (2px-wide × 6px-tall divs absolutely positioned, color `bg-border`) so the rail reads as a true axis even when dots collide.
- Keep the empty-state branch (L457–459) untouched.
- No prop changes, no data contract change, no animation timing change beyond reusing `priceBandLine` variant already in motion-variants.

### Citations

- src/components/analysis/StockAnalysisReport.tsx L398, L457–459, L502–521, L538–595.

### Credit estimate

~3–5 credits (single component, ~15 LOC changed, visual-only).

### Deploy surface

Frontend Publish only. No edge function redeploy.

---

## Item 2 — Returns-at-a-glance strip on every horizon

### Current state in TierShapedGrid

File: `src/components/analysis/StockAnalysisReport.tsx`

- `TierShapedGrid` router: L1708–1714.
- `IntradayGrid` L1716–1817 — **no returns metrics surfaced anywhere**.
- `MediumTermGrid` L1827–1941 — exposes `3M return` (L1848), `1M vs Nifty` (L1849), `1M return` (L1864), `3M vs Nifty` (L1865) scattered across cards. No unified strip.
- `LongTermGrid` L1943– end — returns scattered across L2028–2035.
- Short-term reuses `MediumTermGrid` via L1712–1713 with `tierLabel="Short-term"`.

### Change

Introduce a single presentational `ReturnsStrip` component in the **same file** (keep diff scoped), placed in the report flow at the existing slot **immediately below the verdict block, above the metric grid**, i.e. just before `<TierShapedGrid data={data} />` at L888. This way it renders for every horizon without touching the per-grid card layouts.

Strip layout (assumes Option A above): five tabular cells — `1M`, `3M`, `1Y`, `1M vs NIFTY`, `3M vs NIFTY` — each pulling from `data.returns_snapshot`.

Behaviour:

- If `returns_snapshot` has at least one non-null populated field → render the strip with `DASH` for any individual null cell.
- If **all five** fields are null → render a single muted placeholder row: "Return history not available for this horizon." Same wrapper, same height, so the layout does not jump.

Do **not** remove the existing per-grid `Metric` cells inside MediumTermGrid/LongTermGrid in this wave — that is a separate dedup pass. Wave 5c is additive.

### Citations to touch

- src/components/analysis/StockAnalysisReport.tsx L617 (destructure already includes `returns_snapshot`), L887–888 (insert point), new `ReturnsStrip` declared near the other small presentational helpers (e.g. just above `TierShapedGrid` at L1707).
- src/types/stock-analysis.ts L70–77 (read-only reference for available fields).

### Credit estimate

~6–8 credits (one new in-file component ~40 LOC, one insertion point, light styling).

### Deploy surface

Frontend Publish only.

---

## Item 3 — Hide or honestly label placeholder modules

### Flag

File: `src/lib/feature-flags.ts` — add a single new export at the bottom of the existing flag block:

```ts
export const SHOW_PLACEHOLDER_MODULES = false; // Wave 5c: default OFF for V1
```

No other flag semantics change.

### Block A — "Peers in the same sector"

File: `src/components/analysis/StockAnalysisReport.tsx`

- Section block: L1025–1033 (the whole `<motion.section>` wrapping `SectionTitle eyebrow="Also consider"`).
- Change: wrap the entire section in `{SHOW_PLACEHOLDER_MODULES && (…)}`. When ON, current copy at L1031 stays verbatim. When OFF, nothing renders (no empty card, no spacing artifact — the surrounding sections already carry their own `space-y` from the parent at higher level).

### Block B — "Expert analysis in progress"

File: `src/components/report/ExpertAnswerSection.tsx`

- Placeholder/in-progress state: L72–98 (the `<section id="expert-analysis">` returned when no answer exists yet).
- Change: at the top of that branch, early-return `null` when `SHOW_PLACEHOLDER_MODULES` is false. The "answered" branch starting at L101 is unaffected — real analyst answers always render.
- Import `SHOW_PLACEHOLDER_MODULES` from `@/lib/feature-flags`.

Both blocks must be guarded by the **same** flag so a single toggle controls V1 behaviour.

### Citations

- src/lib/feature-flags.ts (new export, ~1 LOC).
- src/components/analysis/StockAnalysisReport.tsx L1025–1033.
- src/components/report/ExpertAnswerSection.tsx L72–98 (early return) + new import at file head.

### Credit estimate

~3–4 credits (one flag, two wraps).

### Deploy surface

Frontend Publish only.

---

## Combined verification checklist (post-Publish)

Regenerate and visually inspect:

1. **HDFCBANK short-term** — eyebrows still read `SHORT-TERM · CARD n` (Step 3 carry-over check), price-zone rail visibly horizontal, returns strip renders with 1M/3M/1Y + vs-NIFTY values, no "Peers" section, no "Expert analysis in progress" card.
2. **HDFCBANK medium-term** — same checks; verdict prose differs from short-term (Wave 5a Step 2 carry-over).
3. **HDFCBANK long-term** — rail visible, returns strip populated, placeholders hidden.
4. **HDFCBANK intraday (data present)** — rail visible on populated levels, returns strip populated, placeholders hidden, intraday microstructure cards unchanged.
5. **NSDL intraday (no data)** — verdict still renders `NO_COVERAGE_NEW_LISTING` cleanly, price-zone falls into existing insufficient-data branch (L457–459) unchanged, returns strip shows the muted placeholder row (not the populated grid), no "Peers" / "Expert" placeholders.
6. Toggle `SHOW_PLACEHOLDER_MODULES = true` locally on one horizon and confirm both blocks reappear with original copy intact (regression escape hatch).

## Out of scope (do not touch in 5c)

- Verdict logic, suppression, INSUFFICIENT_DATA gray state.
- MediumTermGrid eyebrow routing (already shipped Step 3).
- supabase/functions/**.
- Landing page.
- Stock picker, Move 4b, Marketaux alias map.
- Dedup of per-card return metrics inside MediumTermGrid / LongTermGrid (additive only this wave).

## STOP

Plan only. Awaiting approval + decision on the 6M question (Option A vs B) before Build.  
  
Approve Wave 5c for BUILD with Option A.

Founder decision on returns strip:

- Choose Option A.

- Do NOT add 6M in this wave.

- Use only existing frontend-available fields:

  1M / 3M / 1Y / 1M vs NIFTY / 3M vs NIFTY

Approved scope:

1) Restore the visible horizontal price-zone axis in populated states only.

2) Add the unified ReturnsStrip below the verdict block and above TierShapedGrid using existing returns_snapshot fields only.

3) Hide placeholder modules by default using SHOW_PLACEHOLDER_MODULES = false.

Guardrails remain:

- frontend only

- no supabase/functions changes

- no scoring / weights / buckets / RLS changes

- no sentiment pipeline changes

- no stock-picker work

- no landing page work

- no dedup pass on existing per-card returns in this wave

Build and then return:

- exact files changed

- publish confirmation

- visual verification against:

  HDFCBANK short-term, medium-term, long-term, one populated intraday, and NSDL intraday

STOP after Wave 5c build report and verification.

Do not start stock-picker or any next wave automatically.