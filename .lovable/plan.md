## Mission 1.5 — Phase 3A Plan

Free-text intent router + safe re-enable of "Other" chip. No Brain math / orchestrator / PDF / wallet changes. Sector View and Educational still gated.

### 1. Feature flags (`src/lib/feature-flags.ts`)

Add a second flag so the router and "Other" can ship without unlocking the unfinished Sector View / Educational chips:

```ts
export const ENABLE_FREE_TEXT_ROUTER = true;
export const ENABLE_PHASE3_QUERY_TYPES = false; // unchanged
```

- `LIVE_INTENTS` stays `["buy_decision","stuck_position","should_average"]`.
- Add `ROUTABLE_INTENTS = [...LIVE_INTENTS, "other"]` when `ENABLE_FREE_TEXT_ROUTER`.
- New `visibleChipIntents()` returns LIVE + `"other"` when router on; LIVE alone otherwise. `educational` / `sector_view` chips stay hidden until their report surfaces ship.
- Add `isRoutableIntent(v)` accepting LIVE ∪ {"other"} for client + server allowlists.

### 2. Router schema + canonical taxonomy (`src/lib/intent-router-schema.ts` — new)

Zod schema shared by client + server fn:

```ts
export const RouterIntent = z.enum([
  "fresh_entry",        // == buy_decision
  "existing_position",  // == stuck_position
  "averaging_decision", // == should_average
  "sector_view",
  "educational",
  "other",
]);

export const RouterOutput = z.object({
  interpreted_type: RouterIntent,
  symbol: z.string().nullable(),         // NSE/BSE ticker, UPPERCASE or null
  sector: z.string().nullable(),
  horizon: z.enum(["intraday","short","medium","long"]).nullable(),
  entry_price: z.number().positive().nullable(),
  qty: z.number().int().positive().nullable(),
  custom_question: z.string().nullable(),
  language_hint: z.enum(["english","hindi","hinglish","other"]),
  confidence_score: z.number().min(0).max(1),
  clarification_needed: z.boolean(),
  router_version: z.literal("router_v1"),
});
```

Plus `toFormIntent()` mapper that collapses canonical → form `Intent`:
- `fresh_entry` → `"buy_decision"`
- `existing_position` → `"stuck_position"`
- `averaging_decision` → `"should_average"`
- `sector_view` / `educational` / `other` → `"other"` (graceful fallback while downstream is unshipped)

### 3. Server-side classifier (`src/lib/intent-router.functions.ts` — new)

`createServerFn({ method: "POST" })` with `requireSupabaseAuth` middleware. Input: `{ text: string (15..500 chars) }`. Calls Lovable AI Gateway directly (no edge function — TanStack-native), uses **tool calling** for structured output. Provider/model:

- Endpoint: `https://ai.gateway.lovable.dev/v1/chat/completions`
- Auth: `Authorization: Bearer ${process.env.LOVABLE_API_KEY}`
- Model: `google/gemini-3-flash-preview` (default, cheap, fast, multilingual — handles Hindi/Hinglish classification)
- `tool_choice: { type: "function", function: { name: "classify_intent" } }`
- Strict JSON schema mirrors RouterOutput.
- System prompt: classification-only, English-only outputs, must not fabricate symbol/sector/numbers; set fields to `null` when unsure; downgrade `confidence_score` on ambiguity.

Failure modes: on 429/402/parse-fail/timeout(>8s), return a deterministic fallback `{ interpreted_type: "other", confidence_score: 0.0, clarification_needed: true, ... nulls }` with `router_version: "router_v1_fallback"`. Never throw — UI must degrade gracefully.

Validate response with `RouterOutput.parse()` before returning.

### 4. QueryForm wiring (`src/components/query/QueryForm.tsx`)

a. Replace the local heuristic `classifyIntent` + `extractFields` (lines 61–82) with an async router call.

b. On Step 0 → 1 transition (`goNext` when `step === 0`):
   1. If `queryText.length >= 15`, call router via `useServerFn(classifyIntentRouter)`.
   2. Show inline `Loader2` "Understanding your question…" — block transition until response (or 8s timeout).
   3. Apply results:
      - **Manual chip wins**: if user already clicked a chip BEFORE typing AND router output is compatible (LIVE chip matches canonical mapping, or chip is `other`), keep user's chip.
      - **Incompatibility**: if user picked `buy_decision` but router says `existing_position` with `confidence_score ≥ 0.75`, override the chip and toast "Updated to: Sell or Hold based on your question".
      - **No manual chip**: set intent from `toFormIntent(interpreted_type)`.
   4. Confidence buckets drive prefill:
      - `≥ 0.75` (high) → prefill `stockName`/`stockSymbol` (only if `symbol` non-null and resolvable via `nseStocks` lookup), `entry_price`, `qty`, `horizon`. Auto-advance to Step 1.
      - `0.5–0.75` (medium) → prefill but show banner "Looks like {label}. Confirm or change the question type below." Stay on Step 0.
      - `< 0.5` (low) → force `intent = "other"`, prefill nothing, show "We couldn't classify confidently — submit as 'Other' or rephrase."
   5. **Never** prefill `symbol` when `router.symbol` is null (no fabrication).
   6. Store `routerMeta` in component state for use in submission.

c. Quick examples bar: add 2 free-text examples that include sector / educational / ambiguous text to exercise the router visibly (not pre-binding intent). Keep existing 6 chip-bound examples.

d. Submit (`handleSubmit`):
   - Allowlist becomes `isRoutableIntent(intent)` (LIVE ∪ `"other"`).
   - For `"other"` (any of educational/sector/other downstream), insert with `query_type: "other"`, `status: "pending"`, no v1 engine call, no `generateAiReport` call (skip — placeholder surface only).
   - Persist `router_meta` JSON on the inserted row (see §6).
   - Audit event `query_submitted` payload gains `router_version`, `confidence_score`, `interpreted_type`, `clarification_needed`, `language_hint`.

### 5. Reflective banner enhancement

`ReflectiveBanner` already shows `"Interpreted as: …"`. Add an optional `routerNote?: { interpreted_type, confidence_band: "high"|"medium"|"low", language_hint }`. When provided, append an italic line:

> _Auto-routed via free-text router · confidence: high_

For `other` placeholder we still surface the raw user quote and an italic interpretation line — never blank.

### 6. Database — single jsonb column (`router_meta`)

Migration on `public.queries`:

```sql
ALTER TABLE public.queries
  ADD COLUMN IF NOT EXISTS router_meta jsonb;
```

No new RLS grants — existing `queries_own` policy already covers it. No changes to brain/orchestrator schemas. Shape stored: full `RouterOutput` object.

### 7. Placeholder route handling for `other`

Update `src/routes/report.$queryId.tsx` (`ReportContent`) to recognise rows where `query_type === "other"` AND no `ai_report`. Render a new `<RoutedPendingPanel />` that:
- Shows the user's quoted question + router interpretation
- Says "This question type is being routed to a human analyst (or coming soon to AI)."
- Offers "Post another question" + "Open analyst CTA"
- No Brain call, no polling-forever

Sector View / Educational classifications also end up here (mapped to `other`), so we get one graceful surface. No broken navigation.

### 8. `report.functions.ts` allowlist

Already rejects unknown types. Add `"other"` to `ALLOWED_QUERY_TYPES` so a manual retry of `generateAiReport` for an `other` row returns a controlled `"Report not yet available for this question type"` instead of `"Unsupported query type"`. Better UX, same security envelope.

### 9. Files

**New**
- `src/lib/intent-router-schema.ts` — Zod schema + `toFormIntent`.
- `src/lib/intent-router.functions.ts` — `classifyIntentRouter` server fn (Lovable AI Gateway, gemini-3-flash-preview, tool calling).
- `src/components/report/RoutedPendingPanel.tsx` — placeholder surface for `other`.
- `supabase/migrations/<timestamp>_add_router_meta.sql` — `ALTER TABLE queries ADD COLUMN router_meta jsonb`.

**Modified**
- `src/lib/feature-flags.ts` — add `ENABLE_FREE_TEXT_ROUTER`, `visibleChipIntents`, `isRoutableIntent`.
- `src/components/query/QueryForm.tsx` — async router on goNext, prefill rules, "Other" chip surface, audit payload.
- `src/components/report/ReflectiveBanner.tsx` — optional `routerNote` prop.
- `src/routes/report.$queryId.tsx` — render `RoutedPendingPanel` for `query_type === "other"`.
- `src/lib/report.functions.ts` — allowlist gains `"other"` with controlled response.

### 10. Verification (12 free-text inputs)

| # | Input | Expected `interpreted_type` | Expected confidence band | Notes |
|---|---|---|---|---|
| 1 | "Should I buy ICICIBANK for the next 6 months?" | fresh_entry | high | symbol=ICICIBANK, horizon=medium |
| 2 | "Fresh entry in TCS — long-term view please" | fresh_entry | high | symbol=TCS, horizon=long |
| 3 | "Thinking of starting a SIP in HDFCBANK" | fresh_entry | medium | symbol=HDFCBANK |
| 4 | "Good levels to enter Reliance now?" | fresh_entry | high | symbol=RELIANCE |
| 5 | "I bought HDFC Bank at 1850, should I sell now?" | existing_position | high | entry_price=1850 |
| 6 | "Stuck in Yes Bank from 20, what next?" | existing_position | high | entry_price=20 |
| 7 | "Holding Tata Motors — exit or wait?" | existing_position | high | |
| 8 | "I'm down badly in Suzlon, should I average?" | averaging_decision | high | |
| 9 | "Down 30% in Dixon, averaging justified?" | averaging_decision | high | |
| 10 | "Which private bank stocks look strongest?" | sector_view | medium | → form intent "other" placeholder |
| 11 | "Explain RSI in simple words" | educational | high | → form intent "other" placeholder |
| 12 | "My father bought Dixon long back and I'm confused" | other | low | no prefill, no fabricated price |

Per-case confirmations:
- Live flows (Fresh Entry / Sell-Hold / Average) still produce v1 tier-shaped reports.
- Sector / Educational / Other reach the `RoutedPendingPanel` without touching Brain or PDF.
- `router_meta` jsonb on the row contains the full classification.
- Reflective banner shows verbatim user quote + interpretation line + auto-routed note when applicable.
- No fabricated symbol/price in any of cases 10–12.
- `forbidden-vocab` lint still passes.

### 11. Blockers before Phase 3B

None expected. Once shipped:
- Phase 3B can wire the actual Sector View report (replace placeholder for `interpreted_type === "sector_view"`).
- Phase 3C can wire Educational answer flow analogously.
- Router metadata accumulating in `router_meta` gives a real corpus to tune the prompt / add deterministic post-filters before unlocking the chips.
