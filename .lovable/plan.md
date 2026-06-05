## Wave 5e — Pre-Stock-Picker Cleanup (PLAN ONLY)

Four scoped fixes. Each ships independently with founder approval. No bundling. PROMOTION_RULES_ENABLED and SHOW_PLACEHOLDER_MODULES stay false.

---

### Fix 1 — PriceBand adjacent-marker collision

**Evidence:** ICICIBANK long-term ENTRY ₹966.28 vs LTP ₹977.75; SBIN long-term LTP ₹747.35 vs ENTRY ₹761.74 → labels overlap into unreadable blob. Wave 5c thickened the rail but the collision walker only triggers when `cur.side === prev.side` (line 483), so the alternating top/bottom pattern leaves *adjacent* labels both rendered at the same vertical position with the labels themselves still horizontally overlapping (a 9% MIN_GAP_PCT is enforced for re-flipping but not for actual label width on the alternating side).

**File:** `src/components/analysis/StockAnalysisReport.tsx` — `PriceBand` function L399–597.

- Slot positioning + collision walk: L466–492.
- Label render with `topPx` math: L548–594.

**Proposed change (frontend only, no data contract change):**

1. **Near-value merge (extend existing exact-merge at L443–456):** if two adjacent slot x-percentages are within 1.5% of rail width, merge into one dot with combined label `"ENTRY / LTP ₹972.02"` using the midpoint price — apply only when the price gap is ≤0.5% (cosmetic merge, not semantic). For ICICIBANK and SBIN cases above (≈1.2% price gap), this is the primary fix.
2. **Stagger fallback (rewrite L480–492 walker):** when within MIN_GAP_PCT, push to opposite side AND bump to `tier: 1` if the opposite side already has a tier-0 neighbour within MIN_GAP_PCT. Today only same-side collisions escalate to tier 1.
3. **3+ cluster guard:** if ≥3 consecutive slots fall within MIN_GAP_PCT, assign them rotating sides (top-tier0, bottom-tier0, top-tier1, bottom-tier1) deterministically.
4. Keep monotonic left-to-right order intact (already enforced by L456 sort).

**Credit estimate:** ~6 credits (single function, ~40 lines changed, no new components).
**Deploy surface:** Frontend Publish.
**Falsification:** Regenerate ICICIBANK long-term and SBIN long-term. ENTRY+LTP must render either as one merged dot with combined label, or as two non-overlapping labels on opposite sides.

---

### Fix 2 — Sparse PriceBand + empty Fresh Entry Plan partial-data state

**Evidence:** HDFCBANK long-term renders only S2 + LTP on the rail (every other slot dash); Fresh Entry Plan below is 4× dash with the generic "Invalidation level not derivable…" line. Visually broken.

**Files:**

- `src/components/analysis/StockAnalysisReport.tsx` — `PriceBand` L399–597 (rawPoints filter L430–440 already drops nulls; the "<2 points" early return at L458 is the only existing partial-data branch).
- `src/components/analysis/StockAnalysisReport.tsx` — `LongTermGrid` PriceBand call site L987 (and equivalent in MediumTermGrid/IntradayGrid — to confirm by grep before build).
- `src/components/report/FreshEntryAddendum.tsx` L49–82 — Fresh Entry Plan card; renders all four `LevelCell`s unconditionally (L72–75).

**Proposed change (frontend only):**

1. **PriceBand sparse state:** count populated slots from the 9 candidate fields (entry_zone, stop_loss, target_1, target_2, support_1, support_2, resistance_1, resistance_2, current). If ≥5 of 9 are null AND verdict ≠ INSUFFICIENT_DATA, still render populated dots but append a single muted line under the rail: *"Only support/current level available — full level set unavailable for this horizon."* Pass `verdict` flag in (PriceBand currently receives only `levels` + `current`, so add an optional `partialNote?: string` prop computed by the caller — keeps PriceBand presentation-only).
2. **FreshEntryAddendum collapse:** in `FreshEntryAddendum` (L49), count nulls across `entry_zone`, `stop_loss`, `target_1`, `target_2`. If ≥3 are null, return a compact muted single-line card: *"Fresh entry plan unavailable — wait for fuller level coverage."* instead of the 4-cell grid + invalidation prose. Keep the section heading and "Stockera Engine" eyebrow for layout consistency.

**Credit estimate:** ~5 credits.
**Deploy surface:** Frontend Publish.
**Falsification:** HDFCBANK long-term shows the explanatory line under the rail; Fresh Entry Plan collapses to the single muted line. Stocks with full level coverage (e.g. INFY long-term) render unchanged.

---

### Fix 3 — Banking long-term verdict prose templating leak

**Evidence:** HDFCBANK and SBIN long-term both open with *"Long-horizon view prioritizing business quality, valuation support and risk profile. weak fundamentals (X), …"* — identical prose, only numbers swapped. ICICIBANK long-term shows different/better prose because its verdict is suppressed via `applyVerdictSuppression`.

**Root cause located:**

- `supabase/functions/generate-stock-analysis/index.ts` L800–805: `TIER_REASON_PREFIX` hard-codes the long-term opening.
- `supabase/functions/generate-stock-analysis/index.ts` L807–826: `summaryReason()` is a pure score-dump — concatenates `${tag} ${pillar} (${score})` per pillar in tier-specific order. No driver narrative, no banking branch.
- L1088: `summary_reason: summaryReason(scores, queryType)` — written into final_verdict before `applyVerdictSuppression` has any chance to rewrite long-term banking prose (suppression is INSUFFICIENT_DATA-shaped, not banking-shaped).

**Proposed change (backend, text-only, no scoring/weight change):**

1. **Replace `TIER_REASON_PREFIX["long-term"]**` with a driver-aware composer for long-term. Add a small helper `longTermNarrative(scores, isBanking)` that picks the dominant driver:
  - If `fundamental < 40` → *"Long-term thesis weakened by deteriorating fundamentals"*
  - Else if `risk < 40` → *"Long-term risk profile is elevated"*
  - Else if `momentum < 35 && technical < 45` → *"Long-term trend is rolling over — defer fresh accumulation until a durable base forms"*
  - Else if `fundamental >= 60 && risk >= 50` → *"Valuation and balance-sheet quality support a long-horizon stance"*
  - Else → keep today's neutral prefix.
2. **Banking-specific overlay:** when `isBanking && queryType === "long-term"`, override with NIM/asset-quality-flavoured driver prose (e.g. *"Banking long-term view governed by ROE durability and balance-sheet leverage"*) — text-only, sourced from pillar scores already in `scores`.
3. Keep the score-dump tail (L817–822 `labels`) but limit to top 2 pillar drivers (not all five), so the sentence reads as analysis, not a dump.
4. `isBanking` is already known at this call site (banking carveout audit, L980 area per Wave 5d) — thread it into `summaryReason`.

**Credit estimate:** ~7 credits (one function rewrite, one call-site change, banking flag plumbing already in scope).
**Deploy surface:** Backend (`generate-stock-analysis`) auto-live.
**Falsification:** Regenerate HDFCBANK long-term and SBIN long-term. Opening sentences must differ in *prose*, not just numbers, and neither should reuse *"Long-horizon view prioritizing…"*. ICICIBANK long-term unchanged (already suppressed elsewhere). INFY long-term (non-banking) prose still composed from driver logic.

---

### Fix 4 — Business Quality card honest empty-state for banking

**Investigation findings:**

- `supabase/functions/compute-long-term-quality/index.ts` is the producer for `long_term_quality_snapshot`:
  - **fcf_yield is hard-coded null** at L120–121 with reason `fcf_yield_requires_capex_history_not_exposed_by_fundamentals` — **genuine upstream gap, not a silent drop.**
  - **eps_cagr_5y is intentionally suppressed under banking override** at L183–190 (`suppressed_under_banking_override`) — **by design.**
  - **promoter_holding_pct** L149–163: fetched from a shareholdings source; null reason `shareholdings_unavailable` when missing — **upstream gap.**
  - **roce_5y_avg** L91, with fallback at L106 — populated when available; banks often have it null because FinEdge does not expose `returnOnCapital` consistently for banks.
- `compute-fundamentals/index.ts` L394 populates `roce` from `returnOnCapital` ratio — also a real upstream gap for banks.

**Conclusion:** All four fields are genuinely unavailable for banks (provider gap + intentional banking suppression). Not a silent drop.

**Proposed change (frontend only):**

1. **Hide upstream-null rows for banking stocks.** In `LongTermGrid` Business Quality card (`src/components/analysis/StockAnalysisReport.tsx` L2033–2044), when `q?.quality_label === "BANKING_ADJUSTED"`, suppress the rows that are structurally null for banks: FCF yield (L2037), EPS CAGR (L2038), and ROCE (L2035) only if null. Keep Promoter % visible — render with explicit dash + "Shareholdings unavailable" tooltip if null (it's not banking-specific, just data gap).
2. **Replace with banking-relevant metrics ONLY if already computed.** Per guardrail (no new pillars): grep confirms NIM/GNPA/CASA/CAR are NOT computed today. So this fix is **suppress-only**, no substitution. Add a single muted line at the bottom of the card: *"Banking-adjusted: capex-based and EPS-growth metrics omitted by design. Quality governed by ROE, leverage, F-Score and earnings consistency."*
3. **Banking-adjusted label consistency.** Footnote at L2028–2032 gates on `q?.quality_label === "BANKING_ADJUSTED"`. Verify in `compute-long-term-quality` why HDFCBANK and ICICIBANK don't get this label while SBIN does — likely a gating threshold in the banking detector. **Investigation-only in this plan** — if it's a sector-detection miss (e.g. HDFCBANK's sector string mismatches the banking trigger list), the fix is one-line in the sector-match set; if it's a data-completeness threshold (e.g. needs Piotroski ≥ N), document and propose threshold relaxation in the build phase. Cite `supabase/functions/compute-long-term-quality/index.ts` banking detection block (to pinpoint exact lines during build).

**Credit estimate:** ~6 credits frontend + ~3 credits backend (banking-label gating fix), split-deployable.
**Deploy surface:** 

- Frontend Publish for row suppression + footnote text.
- Backend auto-live for banking-label gating fix (if needed).

**Falsification:** All three banks (HDFCBANK, ICICIBANK, SBIN) long-term Business Quality cards either show populated rows or honestly hide unavailable rows with the single explanatory line. "Banking-adjusted" footnote renders on all three.

---

### Summary table


| Fix                         | Surface            | Credits | Falsification stocks                  |
| --------------------------- | ------------------ | ------- | ------------------------------------- |
| 1 — Marker collision        | Frontend           | ~6      | ICICIBANK LT, SBIN LT                 |
| 2 — Sparse rail + empty FEP | Frontend           | ~5      | HDFCBANK LT                           |
| 3 — Banking verdict prose   | Backend            | ~7      | HDFCBANK LT, SBIN LT, INFY LT control |
| 4 — Banking Quality card    | Frontend + Backend | ~9      | HDFCBANK LT, ICICIBANK LT, SBIN LT    |


**STOP after plan. Founder approves each fix separately before any build. Stock Picker remains deferred until Wave 5e closes.**  
  
Approve Wave 5e PLAN with 3 mandatory amendments and split approval for Fix 4.

1) Fix 1 amendment

- Do NOT use a synthetic midpoint merged price label like "ENTRY / LTP ₹972.02".

- If two markers are merged, preserve both actual values in the label, e.g.:

  "ENTRY ₹966.28 / LTP ₹977.75"

  or a stacked two-line label.

- No invented midpoint value.

2) Fix 3 amendment

- Banking long-term prose must remain grounded only in already-computed signals.

- Do NOT introduce wording that implies unavailable banking metrics (NIM, GNPA, CASA, CAR, asset-quality specifics, etc.) unless those fields are already present in the payload.

- Narrative should be driven from existing pillar scores / long-term-quality fields only.

3) Fix 4 split

- Approve Fix 4a now: frontend-only honest empty-state cleanup for banking Business Quality card.

- Do NOT auto-approve Fix 4b backend banking-label consistency fix yet.

- First return the exact root cause and file/line citation for why HDFCBANK and ICICIBANK are missing the Banking-adjusted label while SBIN shows it.

- Then founder will approve Fix 4b separately if needed.

Build sequencing requested:

- Fix 3 first

- then Fix 1

- then Fix 2

- then Fix 4a

- then STOP and return root-cause note for possible Fix 4b approval

Guardrails unchanged:

- no new pillars

- no scoring weight changes

- no RLS changes

- no stock-picker work

- no bundling

STOP after revised plan / build sequencing confirmation.

&nbsp;