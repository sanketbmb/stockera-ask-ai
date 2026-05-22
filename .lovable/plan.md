# Diagnosis: the "brain" pipeline

## How it works today (verified by reading the code)

1. User submits the form in `src/components/query/QueryForm.tsx`.
2. Frontend infers an `intent` (`buy_decision | stuck_position | should_average | educational | sector_view | other`) and inserts a row into `public.queries` with `query_type = intent`.
3. After insert, frontend calls the server function `generateAiReport` (`src/lib/report.functions.ts`) which forwards the request (with the user's bearer token) to the Supabase edge function `generate-ai-report`.
4. Edge function (`supabase/functions/generate-ai-report/index.ts`):
   - Re-classifies intent from `query_text`.
   - For buy/stuck/average intents with a stock symbol, fetches **LTP** from Twelve Data; if that fails, falls back to a Gemini price estimate; otherwise leaves LTP null.
   - Builds a context object (intent, user position, LTP, pnl_state, empty news/fundamentals stubs) and calls **`gemini-2.5-flash`** directly with the versioned compliance prompt. If `GEMINI_API_KEY` is missing/429, falls back to Lovable AI Gateway (`google/gemini-2.5-pro`).
   - Runs a guardrail check (blocks targets, stop-losses, "guaranteed", verdicts, etc.).
   - Writes `ai_reports` row, updates `queries.status = 'ai_answered'`, fires `audit_events`.
5. Client navigates to `/report/$queryId`.

So **yes, it's hitting the real Gemini 2.5 Flash API with live LTP context — not a static template**. News/fundamentals are stubbed (empty arrays), which is by design for the current MVP.

## The bug blocking everything right now

Console logs show **every** submit failing with:

```
code 23514 — new row for relation "queries" violates check constraint "queries_query_type_check"
```

Root cause — the DB CHECK constraint is out of date:

```text
queries_query_type_check allows: sell_or_hold, average_down, stop_loss,
                                  target, long_term, fresh_entry, other
Frontend inserts intents:          buy_decision, stuck_position, should_average,
                                  educational, sector_view, other
```

Only `other` overlaps — every real intent gets rejected at the DB layer, so the AI report never even starts. This is the actual reason reports aren't being generated, not the API key.

## Plan

### 1. Migration — align the CHECK constraint with the code

Drop the old constraint and replace with one covering the intents the app actually uses (keep the legacy values too, in case any old rows exist):

```sql
alter table public.queries drop constraint queries_query_type_check;
alter table public.queries add constraint queries_query_type_check
  check (query_type in (
    -- current intent codes used by the app
    'buy_decision','stuck_position','should_average',
    'educational','sector_view','other',
    -- legacy values preserved for historical rows
    'sell_or_hold','average_down','stop_loss','target','long_term','fresh_entry'
  ));
```

### 2. Verify end-to-end after the migration

- Submit a "Sell or Hold" query from `/post-query` in the preview.
- Confirm insert succeeds (no 23514) and `generate-ai-report` returns `ok: true`.
- Check `ai_reports` row gets created and `queries.status` flips to `ai_answered`.
- Spot-check edge function logs to confirm `STEP 5a: Gemini direct ok:true` (proves the new GEMINI_API_KEY + `gemini-2.5-flash` are live).

### 3. No code changes needed elsewhere

- `generate-ai-report` already uses `gemini-2.5-flash` in both `callLLM` and `fetchStockData` (the LTP fallback).
- `GEMINI_API_KEY` secret already updated in Supabase.
- Edge function already deployed.
- `report.functions.ts` and the frontend submit flow are correct.

## Out of scope (worth flagging, not fixing now)

- News/fundamentals are not yet wired — the LLM gets `recent_news: []` and `fundamentals: null`. Reports will say "limited data" until a data source is added.
- Twelve Data symbol format hard-codes `:NSE` — fine for NSE stocks, would need work for BSE-only.
