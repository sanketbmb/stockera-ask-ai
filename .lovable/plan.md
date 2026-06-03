
## What's working today

The three "general" chips already exist on Step 0 of `QueryForm.tsx`:

- 🏭 **Sector View** → freezes via `freezeOrReadSectorReport` → `SectorViewReport` (33+ sector rows present in `sector_aggregates`)
- 📚 **Educational** → freezes via `freezeOrReadEducationalReport` → `EducationalReport` (concept glossary)
- ❓ **Other** → inserts row, routes to `RoutedPendingPanel` → **no AI report is ever generated**; just a "queued to analyst" placeholder

So Sector + Educational *do* generate reports today (verified: all canonicals in `sector-infer` map to existing `sector_aggregates` rows). The two real gaps are:

1. **Discoverability.** The chips are crammed into a flat row at the bottom of Step 0. New users don't understand which chip to pick for "How will banking sector perform in next 12 months?" — they pick the wrong one, the router silently overrides, and they get an empty/wrong report.
2. **"Other" never generates a report.** A free-form question like "How is the market mood?" lands on `RoutedPendingPanel` with a static "wait for analyst" message. The user expects an AI-generated analyst-style report.

## Plan

### 1. Restructure Step 0 chips into a grouped "Question Type" picker
File: `src/components/query/QueryForm.tsx`

Replace the flat chip row with two visual groups, each with a one-line description and one example:

```
STOCK QUESTIONS                            GENERAL QUESTIONS
🆕 Fresh Entry  🤔 Sell or Hold  📉 Average  🏭 Sector View  📚 Educational  ❓ Ask Anything
```

Each chip gets a `title` tooltip + example shown beneath when selected, so the user immediately sees: "Sector View → 'How will IT sector perform in next 12 months?'"

Also add 3 more example chips at the top (one per general type) to `QUESTION_EXAMPLES`:
- "How will the banking sector perform in next 12 months?" → `sector_view`
- "What is RSI and how do I use it?" → `educational`
- "What is the overall market mood right now?" → `other`

Clicking an example pre-selects the matching chip (existing `isLiveIntent` path already does this for live chips — extend to sector/edu/other).

### 2. Make the router auto-pick Sector / Educational / Other chips
File: `src/components/query/QueryForm.tsx` → `applyRouterResult()`

Today, when the router classifies a question as `sector_view` / `educational` / `other`, the code maps it to `formIntent` via `toFormIntent()` — but only overrides the chip on `high` confidence. Lower the bar for these three intents: if the user *hasn't* manually picked, always honor the router output for sector/educational/other (they're cheap, deterministic downstream). This eliminates "user wrote a sector question but ended up on Fresh Entry" silent mismatches.

### 3. Make "Other" actually generate an AI report
This is the core of the user's complaint. New flow:

**New server fn:** `src/lib/general-report.functions.ts` → `freezeOrReadGeneralReport`
- Mirrors `freezeOrReadSectorReport` shape (idempotent freeze into `queries.ai_report`)
- Loads the row, ensures `query_type='other'` and `user_id` match
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with a strict "Indian-market research analyst" system prompt that returns a JSON object:
  ```
  { summary, key_points[3-5], risks[2-3], what_to_watch[2-3], disclaimer }
  ```
- Refuses to give buy/sell/target/stoploss (SEBI-compliant — same guardrails as the sector pipeline)
- Freezes the payload, sets `engine_version='v1_general'`, `status='ai_answered'`

**New report renderer:** `src/components/report/GeneralReport.tsx`
- Question echo (verbatim) → AI-generated `summary` → bullet sections → SEBI disclaimer → analyst CTA + download PDF
- Same visual chrome as `SectorViewReport` for consistency

**Wiring:** `src/routes/report.$queryId.tsx`
- Branch `qt === "other"` → render `<GeneralReport>` instead of `<RoutedPendingPanel>`
- `QueryForm.handleSubmit`: when `isOther`, set `status='ai_answered'` (not `pending`), `engine_version='v1_general'`. Drop the "queued to analyst" placeholder.

### 4. Verify end-to-end
After build, manually exercise each path from `/post-query`:
- "How will banking sector perform in next 12 months?" → router picks `sector_view` → submit → `/report/{id}` renders `SectorViewReport` with banks data
- "What is the Piotroski F-Score?" → router picks `educational` → submit → `EducationalReport` renders glossary brief
- "What's the overall market mood right now?" → router picks `other` → submit → `GeneralReport` renders Gemini analyst response
- "Should I buy ICICI for 6 months?" → unchanged stock-tier flow

## Technical notes

- All three new general paths skip credits + skip the v1 tier-shaped Brain pipeline (same as today for sector/educational). `meteringFor("post_query_general_view")` returns `skipped_no_charge_path`.
- `general-report.functions.ts` uses `requireSupabaseAuth` and `supabaseAdmin` (server-only), follows the same pattern documented in `tanstack-supabase-integration`.
- Gemini call has 8s timeout and a deterministic fallback payload ("We couldn't generate a structured answer — an analyst will follow up") so the report page never blanks out.
- No DB migration needed — `queries.ai_report` is already jsonb; `engine_version` is a free-form string column.
- Existing `RoutedPendingPanel.tsx` stays in the repo (used by legacy rows where `engine_version` is missing) but stops being the default for new "other" rows.

## Files touched

- edit `src/components/query/QueryForm.tsx` (grouped chip picker + examples + router auto-pick + other-status flip)
- new  `src/lib/general-report.functions.ts`
- new  `src/components/report/GeneralReport.tsx`
- edit `src/routes/report.$queryId.tsx` (dispatch `other` to `GeneralReport`)
