## Wave 5f — Pre-Stock-Picker Hardening (PLAN ONLY)

Two independent problems. No bundling. PROMOTION_RULES_ENABLED stays false. SHOW_PLACEHOLDER_MODULES stays false. Stock Picker remains deferred until both ship and visually verify.

---

### Problem 1 — Symbol resolution is brittle for corporate-action / renamed / delisted tickers

#### A) Audit findings (live `stock_master` query)


| User-typed symbol | NSE row               | BSE row          | Notes                                                                    |
| ----------------- | --------------------- | ---------------- | ------------------------------------------------------------------------ |
| TATAMOTORS        | **MISSING**           | **MISSING**      | Removed post-demerger (1 Oct 2025). Legacy ticker is gone.               |
| TMPV              | present (sec_id 3456) | present (500570) | Tata Motors Passenger Vehicles successor.                                |
| TMCV              | present (759782)      | present (544569) | Tata Motors Commercial Vehicles successor.                               |
| TMLCV             | **MISSING**           | **MISSING**      | Founder note used `TMLCV`; live Dhan master uses `TMCV`. Update aliases. |
| TATAMTRDVR        | MISSING               | MISSING          | DVR shares ceased 2023; expected.                                        |
| RELIANCEJF        | MISSING               | MISSING          | Never a live ticker (demerged to JIOFIN).                                |
| JIOFIN            | present               | present          | OK.                                                                      |
| ITC               | present               | present          | OK.                                                                      |
| ITCHOTELS         | present (29251)       | present (544325) | OK.                                                                      |
| VEDL              | present               | present          | OK.                                                                      |
| RAYMOND           | present               | present          | OK.                                                                      |
| RAYMONDLSL        | present (25073)       | present (544240) | OK.                                                                      |
| PIRAMALENT        | MISSING               | MISSING          | Likely renamed; needs follow-up.                                         |
| GODREJIND         | present               | present          | OK.                                                                      |


**Root cause of the user's "SYMBOL_NOT_FOUND" on TATAMOTORS**: `resolveStock()` in `supabase/functions/generate-stock-analysis/index.ts` L146-211 runs exact → reverse-prefix → prefix → contains-symbol → contains-name. For input `TATAMOTORS`, the contains-name probe at L201 uses `ilike '%TATAMOTORS%'` against `company_name` — but live rows store `"TATA MOTORS LIMITED"` (with space), so no match. Falls through to L210 → orchestrator L898 returns `SYMBOL_NOT_FOUND`.

`**seed-stock-master` filter** at `supabase/functions/seed-stock-master/index.ts` L122-149: keeps rows where `SEM_INSTRUMENT_NAME === "EQUITY"` AND `SEM_SEGMENT === "E"` AND exchange ∈ {NSE, BSE}. TATAMOTORS is absent from Dhan's current master — not a filter bug, an upstream delisting/replacement.

#### B) Symbol resolver hardening (orchestrator)

File: `supabase/functions/generate-stock-analysis/index.ts`

1. **Normalize whitespace before fuzzy probes** (L201): strip non-alphanumerics from the user-typed symbol AND from `company_name` in a new normalized fuzzy probe so `"TATAMOTORS"` matches `"TATA MOTORS LIMITED"`. Implementation: compute `symCompact = sym.replace(/[^A-Z0-9]/g, "")`, add a `company_name=ilike.%T%A%T%A...%` style probe OR (cheaper) keep an in-memory normalize on a `company_name` shortlist already returned by a wider `ilike '%<first 4 chars>%'` probe. Keep cost ≤1 extra query.
2. **Replace `SYMBOL_NOT_FOUND` hard error with structured `UNSUPPORTED_SYMBOL` verdict** (L898). New payload shape:
  ```
   { success: true, verdict_reason: "UNSUPPORTED_SYMBOL",
     symbol: rawSymbol,
     successor_candidates: [{symbol,company_name,reason}],
     fuzzy_candidates: [...], hint: "..." }
  ```
   `success: true` so the frontend renders the friendly state instead of the red error page. Mirrors how `INSUFFICIENT_DATA` / `NO_COVERAGE_NEW_LISTING` are handled.
3. **Consult successor map before declaring miss** (new step between L210 and L898): if `SUCCESSOR_MAP[sym]` exists, return `UNSUPPORTED_SYMBOL` with those successor symbols pre-attached. If exactly one successor exists and policy allows, optionally hint a single-click re-query (do not auto-redirect).

#### C) Successor / alias map (data-only)

New file: `supabase/functions/_shared/symbol-successors.ts` — typed `Record<string, { successors: string[]; reason: string; effective_date: string }>`. Seed:

```
TATAMOTORS  → [TMPV, TMCV]       reason: "Demerger 2025-10-01"
TATAMTRDVR  → [TMPV, TMCV]       reason: "DVR collapsed + parent demerger"
RELIANCEJF  → [JIOFIN]           reason: "Spinoff 2023"
PIRAMALENT  → []                 reason: "Renamed/merged — verify"
```

Also surface in frontend so the `UNSUPPORTED_SYMBOL` panel can render names alongside tickers. No new DB table for v1 — pure code constant; promote to a `symbol_successors` table only if the list grows past ~30 entries.

#### D) Frontend friendly empty-state

File: `src/routes/report.$queryId.tsx` L90-100 and L330-340 currently render `"Couldn't load this report"` for any thrown error. Branch:

- If payload comes back `success: true, verdict_reason: "UNSUPPORTED_SYMBOL"` → render new `<UnsupportedSymbolPanel />` (new component under `src/components/report/`) explaining:
  - what we searched
  - likely reasons (delisted / renamed / post-corporate-action / very new listing)
  - successor candidates rendered as one-click `Link`s to `/post-query?symbol=<successor>` (or the existing re-query route)
  - "Post a new query" CTA
- If error is genuinely network/timeout → keep current `Couldn't load this report` block.

Also update `src/lib/pdf.functions.ts` L164 and `src/lib/freeze-report.functions.ts` L48 to treat `UNSUPPORTED_SYMBOL` as a clean payload, not a throw.

#### E) Stock Picker hard exclusion gate (reaffirmation, no build)

Documented constraint for the future Stock Picker work: it MUST filter out any symbol whose orchestrator response returns `verdict_reason ∈ {UNSUPPORTED_SYMBOL, INSUFFICIENT_DATA, NO_COVERAGE_NEW_LISTING}`. This check happens BEFORE the picker scores a candidate; it is not a scoring penalty.

#### Credit / surface / sequencing

- **Credits**: ~10 (backend resolver + successor map + frontend panel + 2 thin error-path edits)
- **Deploy surface**: Backend (`generate-stock-analysis`) auto-live + Frontend Publish
- **Falsification**:
  - Type `TATAMOTORS` → friendly `UNSUPPORTED_SYMBOL` panel with TMPV + TMCV as one-click successors
  - Type `tata motors` (typed company name) → resolver finds TMPV/TMCV via normalized fuzzy or returns same panel
  - Type `INFY` → unchanged successful report
  - Type `RANDOMXYZ123` → friendly panel, no successors, fuzzy=[]

---

### Problem 2 — PriceBand still cramped in dense clusters

#### Current state

File: `src/components/analysis/StockAnalysisReport.tsx`

- `PriceBand` component: L399-700 (header L390-398)
- `rawPoints` build + filter: L433-443
- Exact-value merge: L445-458
- Near-identical merge (Wave 5e): L468-491 with `NEAR_X_PCT=0.8`, `NEAR_PRICE_PCT=0.0015`
- 4-lane stagger walker (Wave 5e): L493-535 with `LABEL_GAP_PCT=13` (single hard-coded value)
- Render block (rail, ticks, dots, labels): L544-700
- `topPx` math + leader lines: L600-633

**Why the current 4-lane fix still fails on TMPV-style clusters**:

1. `LABEL_GAP_PCT = 13` is a fixed constant assuming `"ENTRY ₹1,234.56"`-sized labels. Multi-line stacked labels (after near-merge) are taller but no wider, but adjacent distinct labels with longer prices (`₹3,894.99`) still exceed 13% on a 100% rail when 5 markers crowd one half.
2. The walker only checks `placed[]` — it never re-balances. Once top-0 + bottom-0 are taken by markers 1-2, marker 3 hops to top-1 even if there is room for it at top-0 further right; this works left-to-right but leaves later markers (T1, LTP) with nowhere to go and they end up overlapping at bottom-1.
3. Leader lines render only for `tier === 1` (L603). Tier-0 markers crammed shoulder-to-shoulder have no visual separator.
4. Multi-item near-merged groups push `topPx` further with `extra` (L599-602) but the **horizontal** label width still occupies the same slot — collision math doesn't widen the exclusion zone for stacked groups.

#### Required redesign

Rewrite the stagger block (L493-535) and the label render block (L600-637) so:

1. **Width-aware collision** — compute per-slot label width using a character-count heuristic on the rendered label string (length × ~0.95% per char of rail width, clamped 6%-22%). Store as `slot.widthPct`. Two slots collide on the same lane iff `|x_a − x_b| < (widthPct_a + widthPct_b) / 2 + 1` (1% margin).
2. **4 lanes** — `top-1` (close, 14px above rail), `top-2` (46px above), `bottom-1` (14px below), `bottom-2` (46px below). Drop the leader line on tier 1; keep it on tier 2 (longer reach). Existing tier-0/tier-1 naming is renamed to tier-1/tier-2 for clarity.
3. **Deterministic position-based tier assignment** — replace the greedy "first lane that fits" walker with: (a) compute desired lane order per slot from x-position parity (`i % 4` → top1, bot1, top2, bot2); (b) for each slot, fall back to next lane in the rotation if width-aware collision detected against any previously placed slot in the same lane; (c) guarantee placement by allowing tier-2 lanes as last-resort.
4. **Vertical leader line on every marker** — short stub (8px) for tier-1, longer (40px) for tier-2. Removes the visual ambiguity of "which label belongs to which dot".
5. **Near-identical x merge (≤0.5% price gap)** keeps the existing behavior of stacking distinct prices vertically on one label, sharing a single dot + leader stub (unchanged from Wave 5e, retighten threshold to 0.5% to match the spec).
6. **No synthetic midpoints** — keep `last.v = (last.v + ep.v) / 2` for **dot position only** (already commented L486); label preserves real prices via the `distinctPrices` branch L639.
7. **Monotonic left-to-right order** preserved by `exactPoints` sort L458 and the walker iterating in `groups[]` order.
8. **Empty / sparse rail branch unchanged** (L460-462 early return, L1070 `partialNote` prop).

Container height bumped from `mt-14 mb-12 … h-24` (L545-546) to `mt-20 mb-16 … h-32` to absorb tier-2 vertical reach without truncating labels under the next card.

#### Credit / surface / sequencing

- **Credits**: ~9 (single function, ~80 lines rewritten, no new components)
- **Deploy surface**: Frontend Publish only
- **Falsification**:
  - ICICIBANK long-term → ENTRY ₹966.28 and LTP ₹977.75 placed on different tiers with both prices clearly visible
  - SBIN long-term → 4-marker center cluster spread across 4 lanes, no overlap
  - TMPV (once Problem 1 ships) or saved TMPV-style payload → SL / S2 / ENTRY / T1 / LTP cluster all readable, T2 unchanged on right
  - INFY long-term → sparse rail unchanged
  - HDFCBANK long-term → partial-data rail with `partialNote` unchanged

---

### Build sequencing

**Problem 1 first, then Problem 2.** Reasons:

1. Problem 1 unblocks the TMPV/TMCV test case Problem 2 needs for its hardest cluster falsification.
2. Problem 1 fixes a hard user-visible crash; Problem 2 is a polish issue on an already-working page.
3. The two surfaces are independent (no shared files, no shared deploy bundle), so split deployment is safe.

### Deferred work pulled forward into this wave

- None pulled forward. Wave 5e deferrals (banking quality band canonicalization Fix 4b, 6M returns field, RECENTLY_LISTED flag, L156 resolver hardening, Move 4c dampening calibration) remain deferred. Note: the L156 hardening was originally listed as the simple "NSE preferred" branch; that block is now superseded by Problem 1's resolver work — close that deferral as part of Problem 1 build.

### Guardrails

- No scoring weight changes
- No new pillars
- No RLS changes
- No stock-picker work
- No bundling between Problem 1 and Problem 2

STOP. Founder approves each problem separately before any build.  
  
Approve Wave 5f PLAN with three mandatory amendments and confirm sequencing.

Amendment 1 — UNSUPPORTED_SYMBOL downstream consumers must be enumerated in the same build, not discovered later.

The plan proposes orchestrator returns success: true with verdict_reason: "UNSUPPORTED_SYMBOL". Before approving the build, list every downstream consumer that must skip or specially handle this payload. At minimum:

- ai_report DB insert path: must NOT insert a row for UNSUPPORTED_SYMBOL responses (or must insert with explicit verdict_reason so future reads can filter)

- PDF export (src/lib/pdf.functions.ts L164): must short-circuit gracefully

- freeze-report (src/lib/freeze-report.functions.ts L48): must short-circuit gracefully

- sentiment_cache writes: must not be triggered

- Future Stock Picker reads: must exclude rows where verdict_reason = UNSUPPORTED_SYMBOL

- Any caching or memoization layer that keys off symbol: must NOT poison-cache the unsupported response under the original ticker

- Any analytics / observability / Marketaux quota counters: must NOT consume quota when the resolver returns UNSUPPORTED_SYMBOL

Return the full list with file + line citations before any build.

Amendment 2 — PriceBand width calculation must not rely solely on a character-count heuristic.

The plan's "length × ~0.95% per char of rail width, clamped 6-22%" is fragile across fonts, DPIs, and label content variations. Preferred implementation: measure actual rendered label width with refs + getBoundingClientRect() in a useEffect after first render, then reassign tiers in a second pass using measured widths.

If that is rejected as too costly, then the character-count heuristic is acceptable ONLY if a fallback "table mode" is added: when 5+ markers cluster within 30% of rail width AND total estimated widthPct exceeds 100%, render a compact horizontal table below the rail listing those clustered levels as labeled rows, with the rail showing only their dots. This is the escape hatch — without it, the worst case still breaks.

Pick one approach in the revised plan and commit to it.

Amendment 3 — Successor map cleanup before seeding.

The plan currently seeds PIRAMALENT → [] with reason "Renamed/merged — verify". Production data should not contain TODOs. Either:

- find the actual successor and ship it

- drop PIRAMALENT from the seed map entirely and add it to a separate "to-verify" comment block in the file

Either is fine, but don't ship an empty-successors entry to users.

Additional guardrails to confirm:

- Do NOT widen the seed-stock-master EQUITY filter as a side effect of Problem 1. ETF / REIT / InvIT inclusion is a separate wave.

- Do NOT auto-redirect on single-successor cases. The plan correctly says "do not auto-redirect" — confirm this stays in the build.

Sequencing confirmed:

- Problem 1 first

- Problem 2 second

- No bundling

- Each problem ships and verifies independently

After amendments are incorporated, return revised plan with file + line citations for the additional downstream-consumer touches.

STOP. Founder will approve the revised plan before any BUILD.

Do not start any build on the unrevised plan.

Do not start Stock Picker.

&nbsp;