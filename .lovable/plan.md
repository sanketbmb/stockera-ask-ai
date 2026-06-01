
# Mission 1.5 Phase 1 — Wire Fresh Entry to Tier-Shaped Report

## Critical clarifications before I build (please confirm)

These are blocking. Spec assumes things that aren't true in the current code; I need a decision before touching the wallet path.

1. **Wallet/credit deduction does not exist in /post-query today.** `QueryForm.handleSubmit` only inserts a row into `queries` and calls `generateAiReport`. Neither the form, the server fn, nor `generate-ai-report` edge function calls `deduct_wallet_balance`. The "preserve wallet accounting exactly as today" rule therefore means *no deduction at all* — including for Fresh Entry submissions on the new path. Confirm this is what you want, OR tell me which constant (₹X) and which RPC to call. I will not invent a deduction step.
2. **Scope of "Fresh Entry"** = only `intent === "buy_decision"` from `QueryForm`. All other intents (`stuck_position`, `should_average`, `educational`, `sector_view`, `other`) keep the existing legacy `generateAiReport` path untouched. Confirm.
3. **Horizon mapping** from the form's free-text dropdown:
   - "Intraday" → `intraday`
   - "Short-term (<3mo)" → `medium-term` (no `short-term` tier exists in the orchestrator)
   - "Medium-term (3-12mo)" → `medium-term`
   - "Long-term (1+ year)" → `long-term`
   - missing → `medium-term`
   Confirm the Short-term collapse to medium-term is acceptable.
4. **PDF regression for /report/&lt;uuid&gt;**: I will reuse the existing `generateAnalysisPdf` server fn (keyed by symbol+horizon+date+template_version). The /report/$queryId page will mount the same `DownloadPdfButton` and produce a byte-identical filename. Confirm OK.

## Scope

Touching only the surfaces in the allow-list. No Brain, orchestrator, weighting, confidence math, trade-plan, or Puppeteer changes.

## Files to create

```
src/lib/query-intake-parser.ts         # horizon/symbol/type normalizer + interpretation line
src/components/report/ReflectiveBanner.tsx
src/components/report/FreshEntryAddendum.tsx
src/components/report/HybridRegenerateBanner.tsx
src/lib/regenerate-from-legacy.functions.ts  # server fn: clones legacy row → new v1 row, no deduction
```

## Files to modify

```
supabase/migrations/<ts>_extend_queries_v1.sql   # additive columns on public.queries (see below)
src/integrations/supabase/types.ts               # auto-regenerated after migration
src/components/query/QueryForm.tsx               # Fresh Entry branch → new path
src/routes/report.$queryId.tsx                   # renderer switch by engine_version
src/components/analysis/StockAnalysisReport.tsx  # add 3 optional slot props (topBanner, addendum, analystCTAPlacement)
```

Nothing else.

## Data model (additive only)

Migration adds these nullable columns to `public.queries`; existing rows untouched, implicitly `engine_version = 'v0_legacy'`:

| column | type | default |
|---|---|---|
| engine_version | text | null |
| engine_source | text | null |
| horizon | text | null |
| custom_question | text | null |
| orchestrator_response_id | text | null |
| regenerated_from_uuid | uuid | null |

The other spec fields (`query_type`, `stock_symbol`, `buy_price` as qty/entry_price proxy, `query_text` as raw_text) already exist on `queries`. I won't duplicate them. RLS unchanged (existing `queries_own*` policies already cover new columns). GRANTs unchanged.

## Routing behavior

### /post-query (Fresh Entry branch only)
- On submit when `intent === "buy_decision"`:
  - Normalize horizon via `query-intake-parser`.
  - Insert `queries` row with `engine_version='v1_tier_shaped'`, `engine_source='post_query'`, `horizon`, `custom_question=queryText`, `query_type='fresh_entry'`.
  - Skip `generateAiReport`. Instead call `supabase.functions.invoke('generate-stock-analysis', { symbol, query_type: horizon, include_news: true })` (same call shape as /analysis/$symbol) and store `audit_meta.tier_applied` (or response id surrogate) back into `queries.orchestrator_response_id`.
  - Navigate to `/report/<uuid>`.
- All other intents: unchanged.

### /report/$queryId
- Fetch the row (existing query). Branch:
  - **v1_tier_shaped**: invoke `generate-stock-analysis` with stored `stock_symbol`+`horizon` via TanStack Query (same pattern as /analysis page, 30s staleTime), render `<StockAnalysisReport data={…} topBanner={<ReflectiveBanner …/>} addendum={<FreshEntryAddendum …/>} />`. Mount existing `DownloadPdfButton`.
  - **legacy** (no v1 marker): render existing `AIReportCardV2`/legacy renderer untouched, mount `<HybridRegenerateBanner queryId=… symbol=… horizon=…/>` above it.
  - **Missing record**: 404 (existing notFoundComponent / fallthrough — do not auto-create).

### /analysis/$symbol — untouched. No `queries` row written. No wallet effect.

## Slot-extension contract for `StockAnalysisReport`

Add **three** optional props; do not add the rest from the spec (not used in Phase 1, YAGNI per "Touch only what is explicitly authorized"):
```ts
topBanner?: ReactNode;       // rendered above HEADER STRIP
addendum?: ReactNode;        // rendered between Action Zone block and Behavioral Nudge block
analystCTAPlacement?: "default" | "elevated" | "hidden"; // default keeps existing render
```
If/when Phase 2 needs `actionZoneOverrides` / `behavioralNudgeOverride` / `queryContext`, add then.

## Components

### `ReflectiveBanner`
Deterministic, no LLM. Reads `{ rawQuestion, interpretedType, interpretedSymbol, interpretedHorizon }`. Renders:
- Line 1: `"<rawQuestion>"` in serif italic.
- Line 2: `Interpreted as: Fresh Entry · {SYMBOL} · {horizon-label}` muted.
Premium card, navy/ivory tokens, no emoji.

### `FreshEntryAddendum`
Receives `levels` + `tier` + `targets_meta`. Renders entry/SL/T1/T2/RR, with the existing `omissionCopy()` tooltip on nulls. Invalidation line:
- Intraday: "View invalidates if a 15-min close prints below {SL}."
- Medium/Long: "View invalidates if a daily close prints below {SL}."
Behavioral guard line as specified. Static, PDF-safe (no motion).

### `HybridRegenerateBanner`
Calm copy + "Regenerate Free" button. Calls `regenerateFromLegacy({ legacyQueryId })` server fn which:
- Reads legacy row (RLS scoped to user).
- Inserts new `queries` row with `engine_version='v1_tier_shaped'`, `engine_source='regenerated_from_legacy'`, `regenerated_from_uuid=<legacy id>`, copied `stock_symbol`/`stock_name`/`query_text`, `horizon = legacy.horizon ?? 'medium-term'`, `query_type='fresh_entry'`.
- Returns new id. Client navigates to `/report/<new id>`.
- **No wallet deduction** (consistent with current zero-deduction reality; see clarification #1).

## Audit meta extensions

`audit_meta` lives on the orchestrator response, which we don't modify. Instead, I will persist the Phase-1 audit fields **in the `queries` row** (the columns added above are the source of truth) and additionally on the **client-side render** of the audit footer pass `reflective_banner_used` / `addendum_used` flags into a small `<PhaseOneAuditChip />` that mounts inside the existing audit footer. The orchestrator's `audit_meta.formula_version` etc. remain unchanged. `credit_action` is logged into `audit_events` table (existing) as `credit_action: deducted | skipped_free_regeneration | skipped_no_charge_path` per submission — I'll write that row alongside the `query_submitted` event already present in `QueryForm`.

## Forbidden vocabulary lint

I'll add a Vitest unit test `src/__tests__/forbidden-vocab.test.ts` that greps the new components + addendum + banner for `/guaranteed|sure shot|100%|prediction|forecast|promise|definitely/i` and fails on hit. Run with existing test command.

## Verification I will run before declaring done

| # | Scenario | Pass criterion |
|---|---|---|
| A | Submit Fresh Entry RELIANCE medium-term via /post-query | row has v1_tier_shaped; /report/&lt;uuid&gt; renders tier-shaped + banner + addendum + SEBI + analyst CTA |
| B | Direct /analysis/RELIANCE?horizon=medium-term | zero queries row, zero deduction, same report |
| C | Open existing legacy /report/&lt;uuid&gt; | original legacy template untouched + HybridRegenerateBanner on top; Regenerate Free creates new v1 row |
| D | PDF for RELIANCE, ICICIBANK, TCS from both /report/&lt;new uuid&gt; and /analysis/&lt;sym&gt; | byte-identical cache key (`{symbol}_{horizon}_n1_v2_{date}`) → same signed URL; filename `Stockera_Analysis_{SYM}_{HORIZON}_{YYYY-MM-DD}.pdf` |
| E | Wallet | balance unchanged on all three paths (matches reality today) |
| F | Vocab lint | passes |

D-pass is automatic because the PDF cache key is derived from `(symbol, horizon, includeNews, template_version, IST date)` — the route that triggers it doesn't affect the key.

## Out of scope (will not touch)

Brain modules, orchestrator, weighting profiles, action buckets, confidence engine math, compute-trade-plan, Puppeteer/Browserless pipeline, tier-shaped grid internals, LLM calls, analyst booking handler, SEBI disclaimer text, all non-Fresh-Entry intents.

## Risks / blockers I want acknowledged before build

1. Clarification #1 — wallet deduction does not exist; spec is misaligned with current code.
2. The /report renderer for v1 invokes the orchestrator on every visit (same as /analysis page). That's a paid API call. If you'd rather we cache the orchestrator payload in `queries.ai_report` JSONB on first generation and re-read it on revisit, say so — that's a 10-line change but it's a behavior decision.
3. Existing `ai_report` JSONB column on `queries` will be `null` for v1 rows (we don't cache there unless you ask). That's fine for the renderer branch but worth flagging for analytics.

Awaiting approval, then I implement in this order: migration → parser → components → QueryForm branch → report route switch → slot props on StockAnalysisReport → regenerate fn → vocab test → PDF verification.
