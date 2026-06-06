# Wave 5f Problem 1 Hotfix — SYMBOL_AMBIGUOUS Selection Panel

Frontend-only. No backend / scoring changes. Problem 2 (PriceBand) stays deferred.

## Root cause

The orchestrator already returns a structured `SYMBOL_AMBIGUOUS` payload when `resolveStock()` finds multiple matches:

```jsonc
// supabase/functions/generate-stock-analysis/index.ts L937–945
{ success: false, error: "SYMBOL_AMBIGUOUS", symbol, candidates: [...], hint }
```

But `src/routes/analysis.$symbol.tsx` (L42–54) only branches on `isUnsupportedSymbolPayload(data)`; anything else with `success: false` is thrown — so the user sees the red "Could not load analysis" block instead of a picker. `UnsupportedSymbolPanel` is otherwise already capable of rendering ticker buttons; it just isn't being reached.

## Changes

### 1. `src/types/stock-analysis.ts`
- Widen the discriminator: `verdict_reason: "UNSUPPORTED_SYMBOL" | "SYMBOL_AMBIGUOUS"`.
- Rename helper to keep one entry point: `isUnsupportedSymbolPayload` returns true for both verdict reasons (it already gates "do not render the report"; both cases want the same panel). No new exports required.
- No shape change to `successor_candidates` / `fuzzy_candidates` — ambiguous candidates flow in via `fuzzy_candidates`.

### 2. `src/routes/analysis.$symbol.tsx` (queryFn, L44–53)
Before throwing on `!data?.success`, detect `data.error === "SYMBOL_AMBIGUOUS"` and synthesize an `UnsupportedSymbolPayload`:

```ts
if (data?.error === "SYMBOL_AMBIGUOUS") {
  return {
    success: true,
    verdict_reason: "SYMBOL_AMBIGUOUS",
    symbol: data.symbol ?? symbol,
    successor_candidates: [],
    fuzzy_candidates: (data.candidates ?? []).map((c) => ({
      symbol: c.symbol, company_name: c.company_name, exchange: c.exchange,
    })),
    hint: data.hint ?? "Multiple matches — pick a specific ticker.",
  } satisfies UnsupportedSymbolPayload;
}
```

The existing `isUnsupportedSymbolPayload(data)` branch (L100–102) then renders `<UnsupportedSymbolPanel />` with no further changes. PDF button stays disabled via the same `isUnsupported` flag.

### 3. `src/components/report/UnsupportedSymbolPanel.tsx`
- Branch copy on `payload.verdict_reason`:
  - `SYMBOL_AMBIGUOUS` → header "Multiple matches for …", subhead "Pick the ticker you meant".
  - `UNSUPPORTED_SYMBOL` → keep existing copy.
- Change suggestion list to render full-width buttons labeled exactly **"Analyze {COMPANY_NAME} ({SYMBOL})"** (falling back to symbol when company_name is null), per spec. Same `<Link to="/analysis/$symbol" params={{ symbol }} search={{ horizon, news: true }}>` target.
- Remove the 5-item slice on `fuzzy_candidates` cap → cap at 8 (ambiguous lists are short; safe).
- Keep "successor_candidates" section unchanged for the UNSUPPORTED_SYMBOL flow.

### 4. (No edit) `src/routes/report.$queryId.tsx`
Out of scope — `/report/$queryId` is the frozen-report path that runs through `freezeOrReadReport`, which doesn't surface `SYMBOL_AMBIGUOUS` to the client today (symbol is already pre-resolved at intake time). Leaving untouched per "frontend only / no backend changes" guardrail.

## Verification

1. `/analysis/tata%20motors?horizon=long-term`
   - Expect panel headed "Multiple matches for tata motors".
   - Buttons: **Analyze TATA MOTORS PASSENGER VEH (TMPV)**, **Analyze TATA MOTORS LIMITED (TMCV)**.
   - No "Could not load analysis" red screen, no Retry button, PDF button disabled.
2. Click **TMCV** → navigates to `/analysis/TMCV?horizon=long-term&news=true`, full report renders.
3. Regression: `/analysis/TATAMOTORS` (uppercase, in `SUCCESSOR_MAP`) still shows the UNSUPPORTED_SYMBOL panel with successor cards (Wave 5f Problem 1 behavior preserved).
4. Regression: `/analysis/RANDOMXYZ` still shows the UNSUPPORTED_SYMBOL panel with the generic hint.

## Files touched (3)
- `src/types/stock-analysis.ts`
- `src/routes/analysis.$symbol.tsx`
- `src/components/report/UnsupportedSymbolPanel.tsx`

STOP after verification. Do not start Problem 2 (PriceBand) until founder signs off on this panel.
