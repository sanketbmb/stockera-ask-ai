# Phase 2.1 — Post-Query Cleanup Verification

Flag of record: `ENABLE_PHASE3_QUERY_TYPES = false`
(see `src/lib/feature-flags.ts`)

## A. Chip visibility check
Visible chips on `/post-query` Step 1:
- 🤔 Sell or Hold (`stuck_position`)
- 📉 Should I Average (`should_average`)
- 🆕 Fresh Entry (`buy_decision`)

Implementation: `QUERY_TYPES = ALL_QUERY_TYPES.filter(t => ENABLE_PHASE3_QUERY_TYPES || !t.phase3)`
in `src/components/query/QueryForm.tsx`.

## B. DOM confirmation — hidden chips absent
With the flag off, the filter strips Phase 3 entries from the array before
`.map(...)`, so the chips are never rendered. There is no `hidden`/`display:none`
fallback — the buttons do not exist in the DOM.

Hidden intents: `educational`, `sector_view`, `other`.

## C. Quick example behavior
2 examples per live chip, each with a bound `intent`:

| Example | Auto-selected chip |
|---|---|
| Should I buy ICICIBANK for the next 6 months? | Fresh Entry |
| Fresh entry in Reliance for long term — good levels? | Fresh Entry |
| I bought HDFC Bank at 1850 last year, should I sell now? | Sell or Hold |
| Currently holding Reliance, should I exit at current levels? | Sell or Hold |
| I'm at a loss in Suzlon, should I average down? | Should I Average |
| My position in Dixon is down — is averaging justified here? | Should I Average |

Clicking sets `queryText` and, via `isLiveIntent`, calls `setIntent`. Hidden
intents are never bound to an example, so the guard is structural rather than
runtime.

## D. Hero copy
`src/components/landing/HeroSection.tsx` reads `"Private & Secure"`
(badge index 1 of `badges`). `rg "100% Confidential|Confidential" src/` returns
no matches — no legacy demo artifact remains.

## E. Recent / anonymized query badge mapping
`src/components/query/QueryContextPanel.tsx`:
- Reads `ai_report.final_verdict.action` (falls back to legacy `ai_report.verdict`).
- Validates against `["BUY","HOLD","SELL","WATCHLIST","AVOID"]`.
- Renders via `verdictUILabel(action)` from `src/lib/verdict-labels.ts`:
  - BUY → BUY, HOLD → HOLD, **SELL → REDUCE**, WATCHLIST → WATCHLIST, AVOID → AVOID
- No badge is rendered when:
  - `ai_report` is null/missing, or
  - `final_verdict.action` is missing / not one of the five canonical actions.

There is no `?? "HOLD"` default anywhere in the panel.

## F. Hidden query type rejection
Two layers of defence:
1. Client (`QueryForm.handleSubmit`): early-return with
   `toast.error("Unsupported query type")` if `!isLiveIntent(intent)`. Insert
   is never attempted, no audit event fires, no credit moves.
2. Server (`generateAiReport` in `src/lib/report.functions.ts`): re-reads
   `queries.query_type` and throws `"Unsupported query type"` if the persisted
   value is not in the allowlist
   (`fresh_entry`, `existing_position`, `averaging`,
   `buy_decision`, `stuck_position`, `should_average`).

A manual POST that bypasses the form (e.g. direct Supabase insert + serverFn
call) is therefore rejected before the edge function is invoked.

## G. Build / lint summary
- `node scripts/check-forbidden-vocab.mjs` → **clean** (no overclaim words).
- TypeScript: prior `TS2367` resolved by removing the unreachable
  `intent === "educational"` branch in `handleSubmit` (intent is narrowed to
  `LiveIntent` by the early guard).

## H. Blockers before Phase 3
None. The flag flip (`ENABLE_PHASE3_QUERY_TYPES = true`) is the single switch
that re-exposes the chips; both the client and server allowlists will need
the new query types added when their Brain flows ship.
