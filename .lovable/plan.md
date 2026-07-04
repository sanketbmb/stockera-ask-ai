# Stage 4A — APPLY prompt (approved plan, both corrections folded in)

Awaiting founder **APPLY** — no writes, no deploys yet.

## Correction 2 — ai_reports schema findings (DO NOT GUESS, verified live)

Live inspection of `public.ai_reports`:

- Top-level columns include: `id, query_id, user_id, intent, stock_symbol, stock_exchange, ltp_value, ltp_timestamp, ltp_source, pnl_state, prompt_version, llm_provider, llm_model, llm_input_tokens, llm_output_tokens, llm_cost_usd, raw_llm_response, rendered_sections, requires_analyst_review, analyst_assigned_id, generated_at, created_at`.
- **Symbol column**: `ai_reports.stock_symbol` (top-level `text`, confirmed).
- **Verdict inside `rendered_sections**`: **does not exist**. Distinct JSONB keys observed across all rows are:
`ltp_value, stock_symbol, report_version, ltp_source, requires_analyst_review, stock_name, intent, generated_at, what_only_analyst_can_decide, ltp_exchange, behavioral_note, risks_to_monitor, ltp_timestamp, report_id, position_snapshot, data_confidence, what_ai_can_observe, context_relevant_to_user_question, pnl_state, sources_used, intent_acknowledged`.
No `final_verdict`, `verdict`, or `action` key exists anywhere in `rendered_sections`. The founder brief's path `rendered_sections->>'final_verdict'->>'action'` would return NULL for every row.
- **Where verdicts actually live** (verified): `public.library_items.verdict` (text) — populated by triggers `fn_project_query_to_library` (from `queries.ai_report->>'verdict'` or `answers.verdict`) and `fn_project_answer_to_library`. Sample: `SELECT verdict FROM library_items WHERE symbol='INFY'` → `HOLD`, `WAIT`.

**Decision (needs founder sign-off inline with APPLY):**

Use a two-part aggregate in `stock-overview`:

1. `total_reports_on_stock` — `SELECT count(*) FROM ai_reports WHERE stock_symbol = $1` (uses the confirmed top-level column).
2. `latest_verdict_distribution` and `most_recent_report_date` — sourced from `library_items` (the canonical verdict store), filtered to `kind='report' AND symbol = $1 AND is_tombstoned = false`, grouped by `verdict`. `most_recent_report_date = max(published_at)`.

Verdicts are normalized to lowercase buckets `{ watchlist, hold, avoid, buy, other }` in the edge function (mapping table: `HOLD→hold`, `WAIT→watchlist`, `WATCHLIST→watchlist`, `AVOID→avoid`, `BUY→buy`, unknown→`other`). If founder wants a different bucketing, say so before APPLY.

## Correction 1 — search source order (Task 5 / `MasterSearch.tsx`)

Primary suggestion source = `stock_master` (Supabase, deterministic, zero API cost, Indian-only universe). Fallback = `twelvedata-fetch symbol_search` **only when stock_master returns 0 rows** for the debounced query. No client-side exchange filtering of Twelve Data results in the primary path.

- Query: `SELECT symbol, exchange, security_name FROM stock_master WHERE symbol ILIKE $q || '%' OR security_name ILIKE '%' || $q || '%' ORDER BY (symbol ILIKE $q || '%') DESC LIMIT 8`.
- 300ms debounce.
- Selecting a row → `navigate({ to: "/stock/$symbol", params: { symbol } })`.
- Existing library/report search paths in `MasterSearch.tsx` remain intact; only the stock-row nav target changes (`/library/$symbol` → `/stock/$symbol`) and the suggestion source is added.

## Scope (locked — 6 files)

**Create (4)**

1. `supabase/functions/twelvedata-fetch/index.ts`
2. `supabase/functions/stock-overview/index.ts`
3. `src/routes/stock.$symbol.tsx`
4. `src/components/stock-overview/*` (7 components in one dir: `StockHeader`, `OverviewTab`, `StatisticsTab`, `NewsTab`, `AiReportsTab`, `MiniPriceChart`, `StatCard`)

**Modify (2)**
5. `src/components/library/MasterSearch.tsx` (per Correction 1)
6. `src/components/layout/Navbar.tsx` (mount `MasterSearchTrigger` inside mobile Sheet; desktop already renders it for all users)

No 7th file. No migrations. No schema changes. No package.json changes. No touching ask-claude, generate-ai-report, generate-stock-analysis, finedge-fetch, dhan-fetch, marketaux-fetch, get-price-data, portfolio.functions.ts, watchlist.tsx.

## twelvedata-fetch (contract)

- Deno.serve, `POST` + `OPTIONS`, CORS `*`.
- Reads `TWELVE_DATA_API_KEY` from Deno.env.
- Whitelist enum: `profile, statistics, logo, dividends, splits, earnings, insider_transactions, symbol_search, time_series, quote, ipo_calendar, price_target, recommendations, growth_estimates, market_state, earliest_timestamp, exchange_schedule`.
- Request body: `{ endpoint, params }`. URL: `${BASE}/${endpoint}?apikey=…&…params`.
- 12s AbortController. Error codes: `TWELVEDATA_UNAUTHORIZED` (401), `TWELVEDATA_RATE_LIMIT` (429), `TWELVEDATA_UPSTREAM_ERROR` (other non-2xx or `{status:"error"}`), `TWELVEDATA_ENDPOINT_NOT_ALLOWED`. Success: `{ success:true, data }`.

## stock-overview (contract, aggregate fan-out)

Public POST `{ symbol, exchange="NSE" }`. `Cache-Control: public, max-age=60`. 15s ceiling. CORS `*`. No auth.

```text
├─ supabase.from('stock_master').select('dhan_security_id, segment')…  [sequential]
└─ Promise.allSettled([
     twelvedata-fetch profile,
     twelvedata-fetch statistics,
     twelvedata-fetch logo,
     twelvedata-fetch dividends (range=5y),
     twelvedata-fetch splits    (range=5y),
     twelvedata-fetch earnings  (outputsize=1),
     get-price-data { mode:"live", … },
     get-price-data { mode:"historical", days:30 },
     marketaux-fetch { endpoint:"news/all", symbols:[symbol], limit:8 },
     supabase count(ai_reports) where stock_symbol = $1,
     supabase group-by-verdict on library_items where symbol=$1 AND kind='report' AND is_tombstoned=false,
   ])
```

Response shape per founder brief, with `ai_report_stats = { total_reports_on_stock, latest_verdict_distribution (bucketed as above), most_recent_report_date }`. Any failed leg → null in its slot; other legs still return.

## Route `src/routes/stock.$symbol.tsx`

- `createFileRoute("/stock/$symbol")`, no `RequireAuth`, no `_authenticated` prefix.
- Loader = server fn that POSTs `/functions/v1/stock-overview` with anon key (public); returns `queryClient.ensureQueryData`.
- `head({ loaderData, params })`: dynamic `title` `"${name} (${symbol}) Stock Price, Overview | Stockera"`, `description` = `profile.description.slice(0,160)` (fallback generic), `canonical` = `https://asktheexpert.lovable.app/stock/${symbol}`, `og:title/description/type=website/url`, `og:image=logo_url` when present, `twitter:card=summary_large_image`. No noindex.
- Sticky `StockHeader` + shadcn `<Tabs>` with `Overview | Statistics | News | AI Reports` (variants per auth state — teaser for anon, showcase for logged-in-no-report, showcase+"You have N reports" for logged-in-has-report).
- Add-to-Watchlist button = toast placeholder for Stage 4B. Generate AI Report routes to `/post-query?symbol=…` (or `/signup?next=…` when logged out).
- Skeleton loading, partial-data chip when any leg nulls, single "Retry" state on total failure.

## Components (`src/components/stock-overview/`)

`StockHeader`, `OverviewTab`, `StatisticsTab`, `NewsTab`, `AiReportsTab`, `MiniPriceChart` (hand-rolled SVG polyline over `candles_30d.close`), `StatCard`. Design tokens only (bg-mesh, Card, gradient-brand, font-display, muted-foreground).

## Navbar

Desktop already renders `<MasterSearchTrigger />` outside the `{user ?}` block (line 53). Only change: add the same trigger inside the mobile Sheet block, above the "Post a Query" button.

## Edge cases (unchanged from approved plan)

Twelve Data 429 → nulls + "Data limited" chip; MarketAux empty → News tab empty state with link placeholder; Dhan down / FinEdge OK → `price.source=finedge_eod`, header shows "Last close"; symbol missing everywhere → friendly empty-state card, no crash.

## SEO

Dynamic per-route, leaf-only `og:image` from Twelve Data `logo_url`. Publicly indexable.

## Founder UAT (unchanged, 6 tests)

1. Incognito `/stock/INFY` renders.
2. AI Reports tab (logged out) shows teaser + Sign-up CTA.
3. Logged-in `/stock/TCS` → "Start analysis" → `/post-query?symbol=TCS`.
4. Search "reliance" (logged out, desktop or mobile) → `/stock/RELIANCE`.
5. `/stock/HDFCBANK` News tab shows 4–8 cards.
6. `/stock/IREDA` (thin coverage) → renders with `—` placeholders, no crash.

## Post-APPLY deploy sequence

1. Write all 6 files.
2. `supabase--deploy_edge_functions({ function_names: ["twelvedata-fetch", "stock-overview"] })`.
3. Publish frontend.
4. Report: both edge fn revision numbers, deploy timestamp (UTC), live URL `https://asktheexpert.lovable.app/stock/INFY`, confirmation `TWELVE_DATA_API_KEY` is readable in prod.

## STOP — awaiting founder APPLY

Please confirm the verdict-source substitution (`library_items` instead of the non-existent `rendered_sections.final_verdict.action`) and the verdict bucketing before saying APPLY. If either needs to differ, say so and I'll revise before writing code.  
  


APPLY approved with one final correction to verdict bucketing before code write.

Live verdict values already present in `library_items`:

- WAIT = 18

- HOLD = 10

- EXIT = 3

- BUY = 3

- AVERAGE = 1

- PARTIAL_EXIT = 1

- NULL = 8

So the previous mapping is not safe enough.

Use this corrected verdict-bucketing rule in `stock-overview`:

- BUY → buy

- WATCHLIST → watchlist

- HOLD → hold

- WAIT → hold

- AVOID → avoid

- SELL → avoid

- EXIT → avoid

- PARTIAL_EXIT → avoid

- AVERAGE → other

- NULL verdicts → exclude from verdict distribution counts

- any unexpected future verdict → other, and log it once

Important:

- WAIT must NOT be mapped to watchlist.

- Do not silently bucket unknown values without logging.

- Keep `total_reports_on_stock` as planned from `ai_reports.stock_symbol`.

- Keep verdict distribution and `most_recent_report_date` sourced from `library_items`.

Everything else in the APPLY prompt is approved as-is:

- stock_master primary, Twelve Data fallback only on zero local matches

- ai_reports.stock_symbol used for report count

- library_items used for verdict distribution

- 6 files locked

- no migrations

- no schema changes

- no new dependencies

- public route, no auth wrapper

Proceed with APPLY now:

- write the 6 files

- deploy `twelvedata-fetch` and `stock-overview`

- publish frontend

- respond with both edge-function revision numbers, deploy timestamp UTC, live URL, and confirmation that verdict bucketing matches the mapping above

- then STOP for founder UAT

&nbsp;