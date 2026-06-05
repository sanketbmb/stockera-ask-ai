# Wave 5d — V1 Freeze QA + Move 4b (PLAN ONLY)

Stock Picker stays deferred. `PROMOTION_RULES_ENABLED=false`. No scoring/weight/RLS changes proposed in this plan.

---

## Pre-plan flag — QA execution scope (needs founder decision)

The QA matrix as specified is **8 stocks × 4 horizons = 32 fresh regenerations**. Each regeneration fans out to compute-technicals, compute-fundamentals, compute-risk, compute-momentum, compute-sentiment, compute-trade-plan, plus per-tier helpers (compute-long-term-quality on long-term, compute-intraday-microstructure on intraday) and a Marketaux+Dhan upstream call. That is a meaningful credit + provider-quota burn.

Pick one before Build:

- **(A) Full 32-cell matrix** — definitive freeze evidence. Highest cost.
- **(B) Targeted 12-cell sample** *(recommended)*: HDFCBANK × 4 horizons (covers banking carveout + Step 2/3 carry-over), NSDL × intraday + long-term (no-coverage path), INFY × medium-term, TCS × short-term, BPCL × long-term (alias path), ICICIBANK × long-term. Catches every visual-QA invariant in the brief without paying 32×.
- **(C) Code-only audit (0 credits)** — verify invariants by reading the rendered component tree against the schema; only re-generate a stock if a specific invariant is unprovable from code. Lowest cost; weakest evidence.

The matrix below is the deliverable structure regardless of choice; only the populated row count changes.

---

## Item 1 — QA matrix (template — execute on Build)

Columns per cell: **eyebrow**, **verdict prose unique**, **gray-state when no data**, **price-zone rail visible**, **returns strip consistent**, **placeholders hidden**, **notes**.


| Stock      | Intraday               | Short-term             | Medium-term            | Long-term                             |
| ---------- | ---------------------- | ---------------------- | ---------------------- | ------------------------------------- |
| HDFCBANK   | *pending*              | *pending*              | *pending*              | *pending* (Move 4b regression target) |
| ICICIBANK  | *pending*              | *pending*              | *pending*              | *pending*                             |
| INFY       | *pending*              | *pending*              | *pending*              | *pending*                             |
| TCS        | *pending*              | *pending*              | *pending*              | *pending*                             |
| BPCL       | *pending*              | *pending*              | *pending*              | *pending* (alias path)                |
| IDFCFIRSTB | *pending*              | *pending*              | *pending*              | *pending* (1-article alias path)      |
| NESTLEIND  | *pending*              | *pending*              | *pending*              | *pending* (genuine zero-news)         |
| NSDL       | *pending* (gray state) | *pending* (gray state) | *pending* (gray state) | *pending* (gray state)                |


Each cell will record: `PASS / FAIL / N/A — note`. Failures get classified at the bottom as **blocks V1 freeze** vs **defer to Wave 5e**.

Note: short-term + medium-term routing both render `MediumTermGrid` (Step 3 eyebrow fix); verifying both confirms the `tierLabel` prop is wired correctly per query_type.

---

## Item 2 — Regression / duplication finding (concrete, citation-locked)

**Confirmed duplication.** The new `ReturnsStrip` (added in Wave 5c at `src/components/analysis/StockAnalysisReport.tsx` L1720–1768) overlaps with per-card return metrics inside MediumTermGrid and LongTermGrid:

- **MediumTermGrid** (also used by short-term via `tierLabel`):
  - L1915 — `<Metric label="3M return" …>` *(duplicate of strip cell "3M")*
  - L1916 — `<Metric label="1M vs Nifty" …>` *(duplicate of "1M vs NIFTY")*
  - L1931 — `<Metric label="1M return" …>` *(duplicate of "1M")*
  - L1932 — `<Metric label="3M vs Nifty" …>` *(duplicate of "3M vs NIFTY")*
- **LongTermGrid**:
  - L2097 — `<Metric label="1Y return" …>` *(duplicate of "1Y")*
  - L2098 — `<Metric label="3M return" …>` *(duplicate of "3M")*
  - L2099 — `<Metric label="1M return" …>` *(duplicate of "1M")*
  - L2100 — `<Metric label="1M vs Nifty" …>` *(duplicate of "1M vs NIFTY")*
  - L2101 — `<Metric label="3M vs Nifty" …>` *(duplicate of "3M vs NIFTY")*

Not duplicated (leave intact):

- L1927, L2102 — `<Metric label="RS vs Nifty" …>` (different metric: `momentum.relative_strength_vs_nifty`, not in strip).
- L2095 — `summary` prose inside the LongTermGrid card uses 1Y/3M values — keep as prose, not a Metric cell.

### Smallest dedup proposal (separable build)

- Delete the 4 lines in MediumTermGrid (L1915, L1916, L1931, L1932) and the 5 lines in LongTermGrid (L2097, L2098, L2099, L2100, L2101). No layout container changes; the surviving `Metric` cells reflow within their existing `grid` parents.
- Frontend-only. No type/contract changes.
- Estimate: ~2 credits.
- Deploy surface: frontend Publish.
- Verification: same QA matrix above (every cell that previously listed a return value should now show it only inside the top strip).

Keep this as a **separate build** from Move 4b per founder guardrail.

---

## Item 3 — Move 4b: banking carveout sign inversion

### Spec re-confirmed (from chat #667)

> IF `long_quality_composite_banking < fundamental_score` → skip blend, use `fundamental_score` directly, set `banking_carveout_applied = false`, set `banking_carveout_skipped_reason = "composite_would_drag"`.
> ELSE → existing 0.5/0.5 blend.

### Locations

Primary edit:

- `supabase/functions/_shared/horizon-shaping.ts`
  - L128–134 — `CarveoutResult` type. Add optional `skippedReason?: string | null` field (or repurpose `reason` with a new sentinel string — see "Detail" below).
  - L136–162 — `applyBankingCarveout(...)`. Insert the asymmetric guard between the existing "missing_input" branch (L151–153) and the blend at L154. Specifically:
    ```ts
    if (longQualityCompositeBanking < fundamentalScore) {
      return {
        applied: false,
        fundamentalBlended: fundamentalScore,
        fundamentalOriginal: fundamentalScore,
        longQualityCompositeBanking,
        reason: "composite_would_drag",
      };
    }
    ```

Consumer that records the audit field:

- `supabase/functions/generate-stock-analysis/index.ts`
  - L980 — `applyBankingCarveout(...)` call. No signature change required.
  - L1198–1201 — `banking_carveout_applied: carveout.applied`, `banking_carveout_reason: carveout.reason`. Add one line: `banking_carveout_skipped_reason: carveout.applied ? null : (carveout.reason === "composite_would_drag" ? "composite_would_drag" : null)` so the founder-spec field name appears in `horizon_shaping`.

### Detail — `reason` vs `skippedReason`

Simpler: reuse the existing `reason` channel and add `"composite_would_drag"` to the set of non-applied reasons already returned ("shaping_inactive", "non_long_tier", "non_banking", "missing_input"). Then expose it under the spec-named key `banking_carveout_skipped_reason` only when `applied=false AND reason==="composite_would_drag"` (so the existing failure modes don't pollute that field). Smallest diff, no new type member.

### Gate

The function is already gated by `SHAPING_ACTIVE` (L142) which reads `HORIZON_SHAPING_VERSION` env. The new branch sits inside that gate — no new flag needed. Rollback = revert one helper plus one orchestrator line.

### Falsification

- **HDFCBANK long-term** (composite 42 < F 48): expect `banking_carveout_applied=false`, `banking_carveout_skipped_reason="composite_would_drag"`, `fundamental_blended === fundamental_original === 48`, overall score +~1 pt vs current 43.
- **KOTAKBANK long-term** (composite > F per Wave 3 math): expect `banking_carveout_applied=true`, blend fires as today. No behavior change.
- **HDFCBANK intraday / short-term / medium-term**: `applied=false`, `reason="non_long_tier"` — unchanged.
- **INFY long-term** (non-banking): `applied=false`, `reason="non_banking"` — unchanged.

### Credits + deploy surface

- ~5–8 credits (one shared helper + one orchestrator edit + one HDFCBANK regen + one KOTAKBANK regen for falsification).
- Deploy surface: **backend** — `supabase deploy generate-stock-analysis` (it bundles the shared `_shared/horizon-shaping.ts`). Auto-live after deploy, no frontend Publish required.

---

## Items separability

Per founder guardrail, three separable builds in this order:

1. **Move 4b** (backend, ~5–8 cr) — falsified against HDFCBANK + KOTAKBANK.
2. **Dedup pass** (frontend, ~2 cr) — only if QA in Item 1 confirms visual duplication on populated horizons.
3. **Any QA failures** classified below as "blocks V1 freeze" — patched one at a time.

Do not bundle. Do not pull Stock Picker forward.

---

## Bugs surfaced from pre-QA code reading

Classified preliminarily; promotes/demotes once the QA matrix runs.

### Blocks V1 freeze

- *(none from code reading alone — pending QA matrix)*

### Defer to Wave 5e

- **Returns duplication** (Item 2 above) — visual noise, not incorrect; ship dedup right after Move 4b.
- `**fundamental_blended` rounding asymmetry** — `Math.round` at L154 introduces ±0.5pt drift per pillar; documented limitation, not a bug.
- `**bankingLongQualityComposite` dampening centered on 50** (L295) — strong banks lose intensity even when correctly composite-high; founder-flagged previously; sits behind a "Move 4c" calibration review that is explicitly deferred until post-stress-test.

---

## Guardrails reaffirmed

- No scoring weight changes.
- No new pillars.
- No RLS changes.
- No stock-picker work.
- `PROMOTION_RULES_ENABLED=false` unchanged.
- No bundling: QA findings, dedup, and Move 4b ship separately.

## STOP

Awaiting founder decision on:

1. QA scope (A / B / C above).
2. Approval to start Move 4b backend build (independent of QA outcome).
3. Whether to pre-approve the dedup build conditional on QA confirming visual duplication, or require a separate approval round. 

Approve Wave 5d with the following founder decisions:

1) QA scope

- Choose Option B: targeted 12-cell sample.

- Do not run the full 32-cell matrix at this stage.

- Do not use code-only audit as the final freeze evidence.

2) Move 4b

- Approve Move 4b backend build now, independent of QA outcome.

- Keep it fully isolated:

  - no scoring weight changes

  - no new pillars

  - no RLS changes

  - no stock-picker work

- After build, falsify exactly against:

  - HDFCBANK long-term

  - KOTAKBANK long-term

  - HDFCBANK short / medium / intraday

  - INFY long-term

- Return the before/after audit fields for those cases.

3) Dedup pass

- Do NOT auto-build immediately.

- Conditional pre-approval is granted only if the targeted QA clearly confirms that the new ReturnsStrip is visually duplicating return metrics in populated medium-term / long-term reports.

- If confirmed, then proceed with the small frontend-only dedup build as a separate step after Move 4b.

- If not clearly visible in QA, stop and return findings before building dedup.

4) Freeze guardrails

- PROMOTION_RULES_ENABLED remains false.

- No stock-picker work in this wave.

- No bundling: targeted QA, Move 4b, and dedup stay separable.

Required order:

- First: targeted QA matrix (Option B)

- Second: Move 4b build + falsification

- Third: dedup only if QA confirms it is visibly duplicative

- Then STOP for founder review

Do not start Stock Picker.

Do not start any Wave 5e work.

&nbsp;