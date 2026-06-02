# Phase 3D — Mixed Query Intelligence

Ship a deterministic secondary-ask parser + lazy composer + a "You also asked" UI block, with additive schema only. No changes to primary report shell, freeze behavior, verdict math, or metering.

## 1. Migration (additive only)

Single migration adding three nullable JSONB columns to `public.queries`:

- `secondary_asks jsonb` — parsed list `[{ type, raw_span, confidence }]`, max 2
- `secondary_answers jsonb` — composed answers `[{ type, status: "supported"|"fallback", title, body, provenance }]`
- `mixed_query_meta jsonb` — `{ version, parser_version: "deterministic_v1", signature, unsupported_flags[], clarification_needed, composed_at }`

No RLS changes (existing `queries_own` policies cover new columns). No GRANT changes (queries table already granted).

## 2. New files

### `src/lib/secondary-asks-parser.ts` (client-safe, pure)
Deterministic parser over `query_text + custom_question`:

- Regex/keyword detection for 5 ask types:
  - `explain_metric` → matches "what is/what's/explain/define/meaning of …" + `resolveConcept()` returns canonical
  - `key_risks` → matches "risk(s)|downside|what could go wrong|red flag"
  - `reentry_clarification` → matches "re-?entry|re-enter|second entry|add again|when to buy back"
  - `news_clarification` → matches "news|headline|why is it moving|catalyst"
  - `alternatives_same_sector` → matches "alternative|similar stock|peer|other stock in (sector)"
- Strips primary intent span (use router_meta.interpreted_type) so the primary ask isn't re-parsed.
- Caps at 2; dedupes by type.
- Computes a stable `signature` = `sha256(sorted_types + canonical_concept?).slice(0,16)` for cache identity.
- Returns `{ secondary_asks, signature, unsupported_flags }`.

### `src/lib/secondary-composer.ts` (server-safe, pure data in → pure data out)
Given `{ asks, primaryPayload, queryType, frozenArtifact }`, returns `secondary_answers`. Compose rules:

- **explain_metric** (all report types): pull definition from `educational-glossary.ts` via `resolveConcept`. Short 2-3 sentence card with `provenance: { source: "glossary", concept_canonical, library_version }`.
- **key_risks**:
  - stock → assemble from `risk_snapshot`, `flags.news_data_limited`, `audit_meta.trade_plan_validation`, `sentiment_snapshot.top_news_driver` (deterministic template, no new prose).
  - sector → macro-state-aware template using `sector_macro_state` + `risk_band_label`.
  - educational → omit (skip silently, not a fallback card).
- **reentry_clarification**:
  - stock with `levels.support && resistance && intraday_microstructure_snapshot.atr_14` → deterministic re-entry framing card.
  - else → honest fallback card.
- **news_clarification**:
  - stock with `sentiment_snapshot.top_news_driver` → one-line echo + "not exhaustive" disclaimer.
  - else → fallback.
- **alternatives_same_sector**: always fallback ("we don't surface ranked peers in this MVP").

Each answer carries `status: "supported" | "fallback"`, `title`, `body` (string), `provenance` (object). No fabricated tickers, prices, or headlines. All text drawn from glossary / deterministic templates → passes forbidden-vocab lint.

### `src/components/report/YouAlsoAskedSection.tsx`
Renders `secondary_answers` as 1-2 cards under heading "You also asked". Skip render entirely when `secondary_answers` is empty/null. Each card: small type chip, title, body, muted provenance footer. Uses existing design tokens (no custom colors). Hidden when nothing valid.

## 3. Composer wiring (lazy, inside existing freeze fns)

Extend each freeze server fn to compose secondaries once, persist, return:

- `src/lib/freeze-report.functions.ts` (stock unified)
- `src/lib/sector-report.functions.ts`
- `src/lib/educational-report.functions.ts`

Flow in each:
1. After primary payload is composed/loaded from cache, check if `row.secondary_answers` exists AND `row.mixed_query_meta.signature` matches the current parser signature for `(query_text, custom_question)`.
2. If yes → return as-is (already frozen).
3. If no → run parser, run composer, `UPDATE queries SET secondary_asks, secondary_answers, mixed_query_meta` (single update, non-fatal if it fails — log warn). Emit `audit_events` row `event_type: "mixed_query_composed"`.
4. Return full payload + secondaries to caller.

Cache identity: PDF cache key already hashes `query_id + frozen_at`; we additionally fold `mixed_query_meta.signature` into the hash so primary-only and mixed-query versions don't collide.

No-charge metering: add `noop_dev_mode_mixed_query` label to audit only; no credit path change.

## 4. Render wiring

`src/routes/report.$queryId.tsx` dispatcher: after primary report body component, before `<ExpertAnswerSection>` / analyst CTA, render `<YouAlsoAskedSection answers={query.secondary_answers} />`. Same insertion for all three report types. For `query_type === "other"` / routed, render only if a valid `explain_metric` answer resolved.

No changes to report shell, hero, verdict, addenda, or PDF print routes' primary content (the print routes already read `queries.ai_report` — they will pick up secondaries if we want them in PDF, but Phase 3D scope = on-screen only; print routes untouched).

## 5. Verification

Run the mixed-query matrix:
1. Stock + explain_metric ("Should I buy ICICIBANK? Also what is RoE?")
2. Stock + key_risks + reentry ("Holding HDFC, key risks and when to re-enter?")
3. Sector + explain_metric ("View on private banks, what is NIM?")
4. Educational + key_risks (educational primary, key_risks should omit silently)
5. Anything + alternatives_same_sector → honest fallback card
6. Duplicate secondary = primary → skipped
7. >2 secondaries → truncated to 2
8. Junk-only → no "You also asked" rendered

Lint: `node scripts/check-forbidden-vocab.mjs` on composer + glossary outputs.

## 6. Files changed (summary)

- **migration**: 1 new file adding 3 columns
- **new**: `src/lib/secondary-asks-parser.ts`, `src/lib/secondary-composer.ts`, `src/components/report/YouAlsoAskedSection.tsx`
- **edited**: `src/lib/freeze-report.functions.ts`, `src/lib/sector-report.functions.ts`, `src/lib/educational-report.functions.ts`, `src/routes/report.$queryId.tsx`
- **types regenerated**: `src/integrations/supabase/types.ts` (after migration)

## Out of scope (explicitly)

- LLM router for secondaries (deterministic_v1 only)
- Live news fetch
- Peer/comparable surfacing
- PDF inclusion of secondaries
- QueryForm submit flow changes
- Brain math / verdict / weighting / addenda
