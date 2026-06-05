# Pre-Stock-Picker Readiness Audit (read-only, 0 credits)

All findings cite file + line. No code, no deploys. Founder reviews before any build.

---

## FIX 1 — Symbol resolver + data-availability gate

### 1a. NSE-over-BSE selection (resolver)

**File:** `supabase/functions/generate-stock-analysis/index.ts`

- L141: `else if (cur.exchange !== "NSE" && r.exchange === "NSE") bySym.set(r.symbol, r);` — dedupe correctly prefers NSE.
- L152: First lookup hard-filters `exchange=eq.NSE` (good).
- L156: **BUG SURFACE.** Fallback query `stock_master?symbol=eq.${sym}&limit=1` has NO `order by` — Postgres returns whichever row the planner picks first. For NSDL listed on both BSE and NSE, if the BSE row inserted first it wins this fallback.
- L170, L173: similar fallback `&limit=2` then `rows.find((r) => r.exchange === "NSE") ?? rows[0]` — this one IS correct because limit=2 lets it inspect both. The L156 path is the leak.
- L1068: `exchange: stock.exchange` is then stamped into the report header → "BSE: NSDL".

**Likely root cause for "BSE: NSDL":** L152 NSE-preferred query missed (NSDL row not present in stock_master under `exchange='NSE'` yet, since it's a recent listing), fall-through hit L156 with `limit=1` and picked BSE. **Two-part fix needed:** (i) add `&exchange=eq.NSE` re-attempt with broader symbol normalization, OR change L156 to `limit=2` + same `find(NSE)` reducer as L173; (ii) backfill/refresh `stock_master` for NSDL so the NSE row exists.

### 1b. RECENTLY_LISTED flag

**Files:** `supabase/functions/seed-stock-master/index.ts`, `supabase/functions/generate-stock-analysis/index.ts`

- Searched `RECENTLY_LISTED|listing_date|listed_at` across orchestrator → **0 hits**. No listing-age awareness anywhere.
- `stock_master` schema (per supabase-tables: 11 columns) does not surface a listing_date in code paths. Backfill behavior is implicit: compute-* modules each fail with their own null-reason (e.g., `INSUFFICIENT_HISTORY` at L937 of orchestrator) but no unified flag.
- **Gap:** no `audit_meta.listing_status="RECENTLY_LISTED"` is ever emitted. Needs a new field + threshold (listing < 6 months).

### 1c. INSUFFICIENT_DATA verdict

**File:** `supabase/functions/generate-stock-analysis/index.ts`

- L680–684: when ≥3 of 5 modules missing → `action = "AVOID"`, guardrail note `"≥3 modules missing → AVOID"`. **This is the bug.** Spec wants `verdict_reason="INSUFFICIENT_DATA"` and UI to render gray, not red AVOID.
- L624: `overall = weightUsed > 0 ? round(...) : 0` — when all pillars null, overall=0 → `actionFromScore(0)` returns AVOID and then the L683 guardrail re-stamps AVOID.
- L813 `summaryReason`: already emits `"Insufficient data to generate a verdict."` when no labels, but only as prose — never propagated as a structured `verdict_reason`.
- **UI side:** `src/components/analysis/StockAnalysisReport.tsx` L88 (AVOID styling red) and L156 (`if (action === "AVOID" || action === "SELL")` behavioral nudge) — both gated on action only. No "INSUFFICIENT_DATA" branch exists.
- **Required:** new `verdict_reason` field on FinalVerdict; orchestrator sets it when missingCount ≥3 OR (overall=0 AND every pillar null); UI checks it before painting AVOID red.

**Deploy surface:** backend (orchestrator) auto-live; frontend (StockAnalysisReport.tsx, verdict-labels.ts) requires Publish click.

---

## FIX 2 — Marketaux symbol alias map

**File:** `supabase/functions/compute-sentiment/index.ts`

- L416–429: format attempts are hard-coded — tries `${symbol}.NS` first, then bare `symbol`. No company-name fallback.
- L209–214: candidate filtering inside Marketaux response prefers `.NS` then bare then `startsWith`. Cannot rescue if Marketaux indexes the company under a different ticker (e.g., `IDFCFB.NS` vs `IDFCFIRSTB.NS`) or only by name.
- L99/L111 `sentiment_cache` keys on symbol — no alias dimension. `symbol_format_used` records what worked but is never reused as a learning signal.
- **No `marketaux_query_aliases` table exists** (not in supabase-tables list).
- **Audit query for top zeros (must run in BUILD, not here):** `select symbol, count(*) from sentiment_cache where (data->>'article_count')::int = 0 and updated_at > now() - interval '7 days' group by symbol order by 2 desc;` — separates genuinely-no-news from mapping failures by cross-referencing with Google News / company name searches.

**Deploy surface:** backend auto-live; new `marketaux_query_aliases` table = migration.

---

## FIX 3 — Returns strip on every horizon

**File:** `src/components/analysis/StockAnalysisReport.tsx`

- L1683–1687: `TierShapedGrid` routes intraday → `IntradayGrid`, long-term → `LongTermGrid`, **everything else (short-term AND medium-term) → `MediumTermGrid**`.
- `IntradayGrid` (L1690–1791): no `returns_snapshot` references at all → returns dropped.
- `MediumTermGrid` (L1801–): L1822–1839 fold 1M/3M/3M-vs-Nifty into Card 2 (Momentum & Returns), partial only.
- `LongTermGrid` (L1995–2008): dedicated Card 4 "Long-Term Returns" with full 1M/3M/1M-vs-Nifty/3M-vs-Nifty grid.
- **Source already available:** `returns_snapshot` is on every payload (`src/types/stock-analysis.ts` L62–69), populated by compute-momentum. No new pillar needed — just a presentational strip rendered above verdict block in `StockAnalysisReport` near the price header (anchor: L739 region where `summary_reason` renders).

**Deploy surface:** frontend only — requires Publish click.

---

## FIX 4 — Horizon-aware narrative templates

**File:** `supabase/functions/generate-stock-analysis/index.ts` L796–815 `summaryReason()`

- Signature: `summaryReason(scores, queryType)`. Keyed on `(scores, queryType)` only — already horizon-aware in pillar ordering and prefix.
- BUT: the template body just concatenates `${tag} ${pillar} (${score})` per pillar. Adjectives (`strong/moderate/weak/very weak`) come purely from numeric thresholds (L809). Two horizons with similar pillar values produce **near-identical strings** even though prefix differs.
- **The "fresh_entry on a bearish/down-trending tape — suppress until structure clears" text is NOT in summaryReason.** Searched `rg "suppress until|structure clears|bearish.*tape"` across orchestrator + UI + lib — **0 hits**. Source candidates:
  - `supabase/functions/generate-ai-report/index.ts` (mentions `fresh_entry` at L151, system prompt L90)
  - `supabase/functions/generate-ai-report/system-prompt.md` L25, L52, L91 — the LLM is instructed to produce `behavioral_note` keyed on `pnl_state` only, NOT on `query_type`. **This is the horizon-blindness root cause.** The model gets `pnl_state` + tape regime but no explicit horizon directive in the prompt for the action-text section.
- **Verification needed (BUILD step):** dump the `behavioral_note` field from `ai_reports` table for HDFCBANK short vs medium, same date — confirm identical strings. If identical, fix is in the system prompt: extend with explicit horizon-conditional phrasing block.
- "What to do now" action block: rendered in `StockAnalysisReport.tsx` L1422 (intraday-specific) — already partially horizon-aware for triggers, but the prose body inherits from `summary_reason` (L739) and `behavioral_note`. Same root cause.

**Deploy surface:** backend (system-prompt.md, summaryReason) auto-live; frontend touch only if action-block layout changes.

---

## INVESTIGATIONS (no fix, diagnose only)

### A. "MEDIUM · CARD 1" on short-term HDFCBANK

**File:** `src/components/analysis/StockAnalysisReport.tsx`

- L1683–1687: `TierShapedGrid` only branches on `intraday` and `long-term`. `**short-term` falls through to `MediumTermGrid**` (L1687 `return <MediumTermGrid …>`).
- `MediumTermGrid` hard-codes eyebrows: L1811 `eyebrow="Medium · Card 1"`, L1827 `"Medium · Card 2"`, L1843 `"Medium · Card 3"`, L1880 `"Medium · Card 4"`.
- **Root cause:** short-term has no dedicated grid; reuses Medium with literal label leak. Either add a `ShortTermGrid` branch or compute eyebrow from `data.query_context.query_type`.

### B. Short-term degrades more modules than medium (lightning bolts)

**File:** `supabase/functions/generate-stock-analysis/index.ts`

- L1169: `modules_invoked: settled.filter((s) => s.trace.ok)` — module-OK status comes from each compute-* call's success.
- L877: short-term DOES call `compute-trade-plan` (Phase 4B note).
- **Likely cause: tier-conditional fetch windows.** Short-term momentum/risk/sentiment may use shorter lookback windows that fail when data is thin (e.g., compute-risk needs N daily bars; medium uses longer history that's more likely to fill).
- Need to inspect each compute-* module's `query_type` branch (e.g., `compute-risk/index.ts`, `compute-momentum/index.ts`) to identify the threshold. Not in current view — must read in build phase.
- **No `tier_guardrails` block degrades modules** — only demotes verdict. Module degradation is upstream (compute-* internal).

### C. Empty trade plan on short-term HDFCBANK

**File:** `supabase/functions/compute-trade-plan/index.ts`

- L881: only fires when `qtRaw in (intraday, short-term, long-term)` — short-term IS included.
- L585–693: short-term branch present, includes corrective-regime fallback (L680) and weak-setup fallback (L693).
- L913–915: DMA20/50/200 anchoring skipped if `closes.length < N` — for HDFCBANK closes should be plentiful, so unlikely the gating.
- **Suspect:** `tpRes.data.levels` returning all-null due to upstream technical/risk failure (cascade from B). Orchestrator L1151–1158 then stamps `trade_plan_source="legacy"` and `entry_strategy: null`. Report UI then renders empty.
- Need: run trade-plan in isolation against HDFCBANK short-term to capture `validation` array (L1155).

**Deploy surface for A/B/C:** A = frontend (Publish). B/C = backend (auto-live) once cause identified.

---

## Cross-cutting verification needed before any build

1. SQL dump: `audit_meta` for HDFCBANK short-term + medium-term + long-term rows from the past 24h — compare `modules_invoked`, `tier_guardrails`, `trade_plan_source`, `trade_plan_validation`.
2. SQL dump: `behavioral_note` and `summary_reason` from same three rows — confirm identical or distinct strings.
3. SQL dump: zero-article symbols in `sentiment_cache` past 7d.
4. SQL dump: NSDL row(s) in `stock_master` — confirm whether NSE row exists.

These four reads cost 0 credits (read-only psql). They unlock the priority order for the actual builds.

---

## Build sequencing recommendation (for founder approval)

1. **A** (frontend label leak) — smallest blast radius, isolates the short-term grid path before deeper fixes.
2. **C → B** (trade-plan + module degradation) — likely share a root cause in compute-* lookback windows.
3. **Fix 1c** (INSUFFICIENT_DATA verdict) — schema-level, must precede Fix 1a/1b which depend on the new field.
4. **Fix 1a** (resolver NSE fallback), **Fix 1b** (RECENTLY_LISTED flag).
5. **Fix 2** (marketaux aliases) — needs migration + audit query first.
6. **Fix 3** (returns strip).
7. **Fix 4** (horizon-aware narrative).

Move 4b (banking carveout sign) and Stock Picker remain deferred. Promotion rule stays disabled.

**STOP — awaiting founder review.**  
  
Audit accepted as evidence base, but NOT approved as a build sequence yet.

Three changes before any build approval:

1) Run the 4 read-only SQL checks listed under “Cross-cutting verification needed before any build” and return the results first:

- audit_meta for HDFCBANK short / medium / long in last 24h

- behavioral_note + summary_reason for the same 3 rows

- zero-article symbols in sentiment_cache over 7d

- NSDL row(s) in stock_master confirming NSE/BSE presence

2) Revise sequencing:

- Move Fix 1c (INSUFFICIENT_DATA verdict) ahead of A

- Move Fix 4 (horizon-aware narrative) ahead of Fix 3

- Keep B/C dependent on the SQL verification, not pre-approved

3) Return a revised build order with affected files and estimated credits per step.

No code. No deploys. Stop after the SQL reads + revised order.

&nbsp;