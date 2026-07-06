# Stage 4A.3.x — Scoped Close for B1 + B2 (PLAN ONLY)

## B1 — Version-drift reconciliation

### 1. Canonical source of truth (per field)


| Field                   | Canonical source                                                                                                                        | Value at canonical source |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `formula_version`       | `generate-stock-analysis/index.ts:18` — `const FORMULA_VERSION = "orchestrator-1.2"` (stamped into `analytics.audit_meta` at line 1255) | `"orchestrator-1.2"`      |
| `weighting_profile_id`  | `generate-stock-analysis/index.ts:1263` — `profileIdForTier(queryType)` (e.g. `"long_v1"`)                                              | tier-derived              |
| `action_bucket_version` | `supabase/functions/_shared/action-buckets.ts` — `ACTIVE_ACTION_BUCKET = "bucket_v1"` (stamped at orchestrator line 1264)               | `"bucket_v1"`             |


**Reason:** `audit_meta.*` is written by the compute pipeline itself, so it is the only surface that provably describes the math that produced the payload. The `provenance.*` block in `public-analysis-fetch/index.ts` currently hardcodes different values (`FORMULA_VERSION="v1.0"`, `WEIGHTING_PROFILE_ID="long-term-default"`, `ACTION_BUCKET_VERSION="v1"`) that describe neither the compute layer nor a cache-schema version — it is a documentation defect on the fetch layer.

### 2. Decision — (b) rename provenance fields to describe the fetch/cache layer

Mirroring (option a) would require the fetch layer to import orchestrator constants across the function boundary and would confuse two distinct concerns (what math ran vs. how the row was served). Rename is the smaller and semantically honest fix. `audit_meta.*` remains the authoritative version surface for UAT and downstream consumers; `provenance.*` describes cache/fetch semantics only.

Concretely in `public-analysis-fetch/index.ts` the three constants and the `provenance` object become:

```
// constants (top of file)
const CACHE_SCHEMA_VERSION = "v1";           // was FORMULA_VERSION = "v1.0"
const CACHE_HORIZON_PROFILE = "long-term";   // was WEIGHTING_PROFILE_ID = "long-term-default"
const CACHE_ORIGIN_CONTRACT = "v1";          // was ACTION_BUCKET_VERSION = "v1"

// provenance shape (both cache-hit and fresh-compute return sites)
provenance: {
  computed_at: <iso>,
  cache_schema_version: CACHE_SCHEMA_VERSION,
  cache_horizon_profile: CACHE_HORIZON_PROFILE,
  cache_origin_contract: CACHE_ORIGIN_CONTRACT,
  origin: <"prewarm" | "on_demand_authenticated">,
  cache_date: istDate(),
}
```

The three legacy keys (`formula_version`, `weighting_profile_id`, `action_bucket_version`) are removed from `provenance` — they exist unchanged inside `analytics.audit_meta` with authoritative values.

The `writeCache()` row insert keeps its existing column names (`formula_version`, `weighting_profile_id`, `action_bucket_version`) because those are DB columns on `stock_analytics_cache`, not payload contract fields. Values written into the DB row will change to the payload-authoritative values by reading them from the fresh-compute payload's `audit_meta` (line 283 area) instead of hardcoding — the writeCache signature gains those three as parameters, or reads them from the payload directly.

### 3. Files modified

**Exactly one file:** `supabase/functions/public-analysis-fetch/index.ts`

Diff scope:

- Rename 3 module-level constants (lines 29–31).
- Update 2 `provenance:` object literals (cache-hit branch ~line 205 and fresh-compute branch ~line 283) to use the 3 new key names and drop the 3 legacy keys.
- Change `writeCache()` (line 87) to source `formula_version` / `weighting_profile_id` / `action_bucket_version` DB column values from `payload.audit_meta` instead of the removed module constants.

No other file touched. No orchestrator change. No `_shared/*` change. No frontend change (consumers of `provenance.formula_version` etc. must be audited — see §4).

### 4. Contract & schema guarantees

- `**analytics` contract keys**: unchanged. Still exactly 12 top-level keys, `final_verdict` 3, `audit_meta` 8. Forbidden-field list still absent. `shapeAnalytics()` untouched.
- **DB schema**: unchanged. `stock_analytics_cache` columns keep their names; only the *values* written to `formula_version` / `weighting_profile_id` / `action_bucket_version` change (from hardcoded `"v1.0"` / `"long-term-default"` / `"v1"` to the payload's authoritative values).
- **RLS**: unchanged.
- **Frontend consumer audit (must run before APPLY)**: grep `AnalyticsProvenanceFooter.tsx` and any other component reading `provenance.formula_version` / `provenance.weighting_profile_id` / `provenance.action_bucket_version`. If found, they must switch to reading from `analytics.audit_meta.*` (canonical) or from the renamed `provenance.cache_*` fields. This audit is part of the plan; the diff estimate stays "1 file" only if the frontend already reads from `audit_meta` — otherwise add those component files to the diff. B1 does not APPLY until this audit is complete.

## B2 — Live compute-branch capture (`origin=on_demand_authenticated`, `cached:false`)

### Recommended path: use a non-prewarmed symbol

The prewarm universe (`prewarm-public-analytics/index.ts:37`) is Nifty 50 + Nifty Next 50 + top-queried recent symbols. Any liquid-but-outside-prewarm symbol will:

- have no `stock_analytics_cache` row for today's IST date on first click,
- pass the `readCache()` early-return,
- pass the daily rate-limit check (founder is at 0/5),
- trigger `generate-stock-analysis`,
- return `success:true, cached:false, analytics: <shaped>, provenance.origin: "on_demand_authenticated"`.

**Suggested symbol: `POLICYBZR**` (PB Fintech, NSE) — liquid, not in Nifty 50 / Next 50, and not a symbol the founder has been repeatedly querying, so it is very unlikely to be in the top-queried prewarm merge for today.

**Fallback symbols (any one works):** `ZOMATO`, `PAYTM`, `NYKAA`, `IRCTC`. Founder picks whichever confirms an empty cache row (verifiable with a single read-only SQL against `stock_analytics_cache` filtered by today's `cache_date` before clicking).

**Alternative (NOT recommended):** delete today's `stock_analytics_cache` row for INFY and re-invoke. Rejected because (a) it mutates the cache table during UAT window, (b) INFY may re-prewarm on the next cron tick and race the capture, (c) non-prewarmed-symbol path exercises the exact same compute branch with zero DB mutation.

### No code change to force compute

The compute branch is already reachable from the existing `Refresh Analytics` / `Generate now` CTA in `AnalyticsTab.tsx` when the cache is empty for today. No temporary flag, no forced `compute:true` override, no code edit required to obtain the capture.

### No row deletion

Plan only. No `DELETE FROM stock_analytics_cache` will be executed under this plan. If the founder rejects the non-prewarmed-symbol approach in favour of the delete-and-refetch approach, that becomes a separate approved step.

### Expected response shape for the `cached:false` compute-branch response

```json
{
  "success": true,
  "cached": false,
  "analytics": {
    "stock": { ... },
    "computed_at": "<ISO-8601 UTC, freshly stamped by this call>",
    "final_verdict": { "overall_score": <num>, "risk_label": <str|null>, "time_horizon": <str|null> },
    "score_breakdown": { ... },
    "returns_snapshot": { ... },
    "fundamental_snapshot": { ... },
    "risk_snapshot": { ... },
    "momentum_snapshot": { ... },
    "sentiment_snapshot": { ... },
    "long_term_quality_snapshot": { ... },
    "flags": { ... },
    "audit_meta": {
      "formula_version": "orchestrator-1.2",
      "weighting_profile_id": "long_v1",
      "action_bucket_version": "bucket_v1",
      "tier_weights": { ... },
      "dcf_status": <str|null>,
      "dcf_method_used": <str|null>,
      "banking_override_applied": <bool|null>,
      "banking_override_reason": <str|null>
    }
  },
  "provenance": {
    "computed_at": "<ISO-8601 UTC>",
    "formula_version": "v1.0",                    // ← today; renamed to cache_schema_version after B1 lands
    "weighting_profile_id": "long-term-default",  // ← today; renamed to cache_horizon_profile after B1 lands
    "action_bucket_version": "v1",                // ← today; renamed to cache_origin_contract after B1 lands
    "origin": "on_demand_authenticated",
    "cache_date": "<YYYY-MM-DD IST>"
  }
}
```

Contract keys: 12 / 3 / 8 unchanged. Forbidden fields absent (`action`, `summary_reason`, `verdict_reason`, `confidence_pct`, `trade_plan_*`, `source_trace`, `user_context`, `report_modules`, `intraday_microstructure_snapshot`, `levels`, `technical_snapshot`, `price_context`, `query_context`, `horizon_shaping`, `entry_strategy`, `targets_meta`).

## Summary

- **Files to modify (B1):** 1 — `supabase/functions/public-analysis-fetch/index.ts` (plus any frontend consumer file surfaced by the pre-APPLY grep audit).
- **Field renames (B1):** `provenance.formula_version` → `provenance.cache_schema_version`; `provenance.weighting_profile_id` → `provenance.cache_horizon_profile`; `provenance.action_bucket_version` → `provenance.cache_origin_contract`. Authoritative version strings continue to live in `analytics.audit_meta.*`, sourced from the orchestrator.
- **Symbol for compute-branch capture (B2):** `POLICYBZR` (fallbacks: `ZOMATO`, `PAYTM`, `NYKAA`, `IRCTC`).
- **Expected cached:false shape (B2):** as above — full 12/3/8 payload with `provenance.origin = "on_demand_authenticated"` and a freshly stamped `computed_at`.
- **STOP for founder review.** No code, no deploy, no file edits, no row deletion.  
  
APPROVED — Stage 4A.3.x B1 + B2 PLAN accepted.
  Approval scope:
  - Modify only `supabase/functions/public-analysis-fetch/index.ts`.
  - Do not include a frontend consumer fix unless the pre-APPLY grep audit
    below actually finds downstream reads.
  Mandatory clarifications to incorporate into APPLY:
  1. writeCache() source of truth
     After deploy, columns `stock_analytics_cache.formula_version`,
     `weighting_profile_id`, `action_bucket_version` will hold the
     payload-authoritative values from analytics.audit_meta
     (e.g. `formula_version = "orchestrator-1.2"`).
     - Existing rows are NOT backfilled.
     - Only new writes reflect corrected values.
     - Any consumer that reads these columns must be audited before APPLY.
  2. Renames are full renames, not aliases
     After deploy, the three legacy provenance keys
     `formula_version`, `weighting_profile_id`, `action_bucket_version`)
     do NOT exist in the response object. They are removed, not aliased.
     - Requests will return `cache_schema_version`, `cache_horizon_profile`,
       `cache_origin_contract`.
     - Clients reading old keys will receive `undefined`.
  3. Pre-APPLY grep audit commands (must run and report results before APPLY):
     - `grep -r "provenance.formula_version" src supabase/functions`
     - `grep -r "provenance.weighting_profile_id" src supabase/functions`
     - `grep -r "provenance.action_bucket_version" src supabase/functions`
     - `grep -r "stock_analytics_cache.formula_version" src supabase/functions`
     - `grep -r "stock_analytics_cache.weighting_profile_id" src supabase/functions`
     - `grep -r "stock_analytics_cache.action_bucket_version" src supabase/functions`
     If any matches are found, list them in the diff estimate and include
     those files in scope. If none are found, scope stays at exactly 1 file.
  4. B2 capture acceptance criteria (live public-analysis-fetch response
     for a non-prewarmed symbol, founder browser click):
     - HTTP 200
     - `success: true`
     - `cached: false`
     - `provenance.origin: "on_demand_authenticated"`
     - `provenance.computed_at` is freshly stamped on this call
     - `analytics` has exactly the 12 top-level keys
     - `analytics.final_verdict` has exactly 3 keys
     - `analytics.audit_meta` has exactly 8 keys
     - forbidden fields absent
     Symbols in order: `POLICYBZR`, `ZOMATO`, `PAYTM`, `NYKAA`, `IRCTC`.
  Sequence after this approval:
  1. Apply B1 + B2 patch.
  2. Pre-APPLY grep audit.
  3. Deploy.
  4. Founder signs in /stock/POLICYBZR Analytics tab and clicks Generate now.
  5. Capture the cached:false response.
  6. Founder verifies acceptance criteria above.
  7. If PASS, 4A.2c + 4A.3 are CLOSED simultaneously.
  8. Then Stage 4D.1 (B3 compliance strip) APPLY.
  9. Then Stage 4F (Video Answers) APPLY.
  Stop after this plan approval. Do not APPLY without founder authorisation.
  &nbsp;