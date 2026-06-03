
# Sector Detection — Full Fix (Option C)

## Goal
A user pastes any free-text query on `/post-query` (single word, sentence, or paragraph) and the system reliably (a) detects the right sector, (b) maps it to a canonical that exists in `sector_aggregates`, and (c) generates the AI report. No more "Couldn't recognize that sector" dead-ends.

## Three-tier detection pipeline

```text
User question
    │
    ▼
[Tier 1] Regex keyword scan  ─── hit ──▶ canonical (instant, free)
    │ miss
    ▼
[Tier 2] LLM fallback (Gemini, only if text > 8 words)
    │ hit ──▶ canonical (~300ms, ~$0.0001)
    │ miss
    ▼
[Tier 3] Show top-3 LLM guesses as chips + full 36-sector grouped picker
```

User override is **sticky**: once a chip is clicked, `userOverride=true`, auto-detection stops for the session until "Clear" is hit.

## Phase 1 — Smarter regex (file: `src/lib/sector-keyword-detector.ts`)

Merge the super-agent prompt's ~200-entry keyword list (it's solid) with two guards:

1. **Forbidden bare keywords** — only match inside multi-word phrases, never alone:
   `tech`, `technology`, `financial`, `energy`, `consumer`, `industrial`, `health`, `service`, `power`, `metal`, `media`
   (so "tech sector" matches, but "fintech" does not pull "tech")

2. **Length-DESC sort + word-boundary regex** — already in place, confirm.

3. **Add the failing case**: `information technology` → canonical `it_services` (NOT `information_technology` — see Phase 3 reconciliation).

## Phase 2 — LLM fallback (new file: `src/lib/sector-infer.functions.ts`)

TanStack server function using Lovable AI Gateway (`LOVABLE_API_KEY` already configured):

- Model: `google/gemini-3-flash-preview` (fast, cheap)
- System prompt: *"You classify Indian stock-market questions into one sector from this exact list of 36 canonicals: [...]. Return JSON `{canonical, confidence, alternates}`. Use null if no sector intent."*
- The 36 canonicals are passed as plain text in the prompt (NOT as enum in tool schema — Gemini state-limit gotcha).
- `JSON.parse` the response (skip tool calling to avoid schema-state limit).
- In-memory LRU cache (200 entries) keyed by `sha256(question)` so the same paragraph doesn't re-call.
- Only fires when: Tier 1 returned null AND text length > 8 words AND not already cached.

Wire into `QueryForm.tsx`:
- Calls `useServerFn(inferSectorFromText)` debounced 600ms on textarea blur.
- Shows "Inferring sector…" spinner; non-blocking (user can still pick manually).

## Phase 3 — Canonical reconciliation (the report-generation blocker)

Today there are 3 overlapping IT canonicals (`it_services`, `it_software`, `information_technology`) and similar overlaps elsewhere. The report fails when detection picks one but `sector_aggregates` only has the other.

**Action:**
1. SQL audit: `SELECT sector_canonical FROM public.sector_aggregates ORDER BY 1;` — get the authoritative 36 list.
2. Pick one winner per concept (e.g. IT → `it_services`).
3. Update `src/lib/sector-alias-map.ts` with a **nearest-neighbor map** for collapses:
   ```
   information_technology → it_services
   it_software           → it_services
   software_services     → it_services
   renewable_energy      → power
   oil_marketing         → petroleum_products
   ```
4. Apply the same map in `supabase/functions/_shared/sector-aliases.ts` (keep client + edge in sync).
5. Add a final fallback in `generate-stock-analysis`: if `sector_aggregates` row missing for detected canonical, run it through nearest-neighbor map ONE more time, then default to `__default__` with `audit_meta.sector_aggregate_source = "nearest_neighbor_fallback"`. Never crash.

**Do NOT** alter the rows in `sector_aggregates`. Do NOT touch report engine math.

## Phase 4 — UI changes (`src/components/query/QueryForm.tsx`)

- **Delete** the red toast "Couldn't recognize that sector. Try Private Banks, IT, Energy, Pharma, FMCG" — gone forever.
- On detection success: green inline badge "Sector detected: **Information Technology** (matched 'information technology')" with a small "Clear" button.
- On Tier 3 (LLM also failed): neutral helper "Pick a sector below" + grouped chip picker for all 36 sectors, organized as: Banking & Finance · Tech · Consumer · Energy & Power · Industrial · Healthcare · Materials · Auto · Real Estate & Infra · Other.
- Sticky override: clicked chip sets `userOverride=true`, disables auto-detect until Clear.

## Phase 5 — End-to-end audit

Trace one query (*"What is your view on information technology sector of india for next 12 months"*) through all 5 hops and confirm the canonical survives:

1. QueryForm detects → `it_services`
2. Inserted into `queries.sector_canonical` → `it_services`
3. `generate-stock-analysis` reads → `it_services`
4. `sector-report.functions.ts` looks up `sector_aggregates` → row exists
5. Report renders with IT sector metrics (PE, returns, breadth)

Document any hop where the canonical is lost, transformed unexpectedly, or not found, and patch that hop only.

## Test matrix (must all pass)

| # | Input | Tier | Expected canonical |
|---|---|---|---|
| 1 | "information technology sector of india for next 12 months" | 1 | it_services |
| 2 | "How is the IT sector doing?" | 1 | it_services |
| 3 | "Pharma sector outlook" | 1 | pharmaceuticals |
| 4 | "PSU banks should I buy?" | 1 | public_sector_bank |
| 5 | "Oil and gas sector" | 1 | oil_gas |
| 6 | "I'm worried about rising fuel costs hurting logistics" | 2 (LLM) | oil_gas |
| 7 | "Future of clean mobility in Bharat" | 2 (LLM) | automobile |
| 8 | "What happens to lenders when RBI cuts rates?" | 2 (LLM) | private_sector_bank or financial_services |
| 9 | "Renewable energy plays for next decade" | 2 (LLM) → nearest-neighbor | power |
| 10 | "Energy drinks market" | none | null → Tier 3 picker (bare "energy" blocked) |
| 11 | "hjkhjk random gibberish" | none | null → Tier 3 picker |
| 12 | Manual chip click then new query | sticky | userOverride respected |

## Files touched

```text
NEW   src/lib/sector-infer.functions.ts          (Gemini fallback server fn)
EDIT  src/lib/sector-keyword-detector.ts         (super-agent keyword list + forbidden bare words)
EDIT  src/lib/sector-alias-map.ts                (nearest-neighbor map)
EDIT  src/lib/sector-aliases.ts                  (sync with edge copy)
EDIT  supabase/functions/_shared/sector-aliases.ts  (sync)
EDIT  supabase/functions/generate-stock-analysis/index.ts  (nearest-neighbor fallback when sector_aggregates row missing — audit first, edit only if confirmed losing the canonical)
EDIT  src/components/query/QueryForm.tsx         (3-tier resolution, sticky override, grouped 36-sector picker, kill the red toast)
```

## What I will NOT touch

- backtest engine, `run-backtest`, `compute-trade-plan`, `_shared/trade-plan-core`, `backtest_results`
- RLS policies, admin gating, `/admin/backtest`
- engine math, weights, regime detection, scoring formulas
- `sector_aggregates` table data
- the running backtest job

## Report-back format

1. Diff of all 7 files (with line counts)
2. New `sector-infer.functions.ts` full content
3. SQL audit output: `SELECT sector_canonical FROM public.sector_aggregates ORDER BY 1;`
4. Nearest-neighbor collapse map applied
5. End-to-end trace for query #1 showing canonical at each of 5 hops
6. Pass/fail table for all 12 test cases (with screenshots for the visible ones)
7. Confirmation that the red toast is GONE
8. Confirmation that all 36 sectors are visible in Tier 3 grouped picker
9. Any blockers

Approve and I'll switch to build.
