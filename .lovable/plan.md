# Fundamentals Fallback — Diagnosis + Narrow Fix

Scope: `supabase/functions/sync-fundamentals-finedge/index.ts` only. No LTP, UI, news, stock-recommendation, schema, cron, or unrelated changes.

## Plain-English Root Causes

### RC-1 (real code bug) — stock_master seed **never fires**

In `stock_master`, `market_cap_rs` has Postgres type `**numeric**`. PostgREST returns `numeric` columns as **JSON strings** (to preserve precision), not JS numbers. The seed code at lines 491 and 508 guards with:

```ts
const mMcap = m && typeof m.market_cap_rs === "number" ? (m.market_cap_rs as number) : null;
```

That check is **always false** for `numeric` columns → `mMcap` is always `null` → seed branch never runs.

Proof — DB confirms `mcap_type = numeric` and ICICIBANK NSE has `market_cap_rs = 9906616600000.00`, yet its `fundamentals_cache` row was never created despite the cursor passing "I".

### RC-2 (external, not a code bug) — Twelve Data returns **403 twelvedata_auth** on every call

Attempts sample from latest runs shows every TD fallback path recorded:

```
fallback: { source: "twelve_data", http_status: 403, reason: "twelvedata_auth", retries: 0 }
```

`http_status_histogram` on latest runs: `{200:15, 403:1, 0:3}` etc. — TD `/profile` returns 403 immediately, so the code short-circuits (correctly) before calling `/statistics`. 403 is **not** in `TRANSIENT`, so no retry is attempted (also correct).

This is an **API-key / plan** problem (the current `TWELVE_DATA_API_KEY` is either invalid, unset in this function's env, or on a plan that doesn't include `/profile` + `/statistics`). No code change can recover it — we surface it clearly and stop pretending TD is the safety net until the key is fixed.

### Why ALKEM / APOLLOHOSP / BIOCON / DRREDDY are still null

- `stock_master.market_cap_rs` is **NULL** for all four (verified). So even after RC-1 is fixed, `stock_master` seed cannot help them.
- Their FinEdge attempt during the sweep hit either `finedge_no_fields` or a transient `0/503`, and TD fallback 403'd. They stayed null.
- Fix path for these: TD key needs to be restored, OR they populate on a later FinEdge tick when the endpoint returns fields. Not a code fix.

### Why ICICIBANK stayed null

Purely RC-1. Master mcap is present; the numeric-string guard blocked the seed. This fix populates it on the next tick that reaches ICICIBANK (cursor will wrap tomorrow; can also be forced with a targeted invocation).

## Fix (surgical, 2 sites, identical shape)

Replace the two `typeof === "number"` guards with a numeric coercion that accepts PostgREST's string form.

Files changed: **1** — `supabase/functions/sync-fundamentals-finedge/index.ts`.

## Full Diff

```diff
@@ -488,7 +488,8 @@
           // Last-ditch: seed market_cap from stock_master so row doesn't stay null.
           if (source === "none") {
             const m = masterKey.get(key);
-            const mMcap = m && typeof m.market_cap_rs === "number" ? (m.market_cap_rs as number) : null;
+            // PostgREST returns numeric columns as strings; coerce before the finiteness check.
+            const mMcap = m ? pickNum(m.market_cap_rs) : null;
             if (mMcap != null && Number.isFinite(mMcap) && mMcap > 0) {
               finalMcap = mMcap;
               source = "finedge"; // enum-safe; provenance in attempts
@@ -505,7 +506,8 @@
           // Seed mcap from stock_master when upstream succeeded on sector but missed mcap.
           if (finalMcap == null) {
             const m = masterKey.get(key);
-            const mMcap = m && typeof m.market_cap_rs === "number" ? (m.market_cap_rs as number) : null;
+            // PostgREST returns numeric columns as strings; coerce before the finiteness check.
+            const mMcap = m ? pickNum(m.market_cap_rs) : null;
             if (mMcap != null && Number.isFinite(mMcap) && mMcap > 0) {
               finalMcap = mMcap;
               attempts.push({ symbol: sym, exchange: ex, source: "stock_master_seed", status: "mcap_filled", value: mMcap });
```

`pickNum` (existing helper, line 33) already handles both string and number and returns `null` for anything else. No new imports, no new state, no behavior change for any other code path.

## Proofs

- **Why TD recovered 0 before:** every attempt shows `http_status: 403 reason: twelvedata_auth`. TD `/profile` is 401/403-gating our requests. Not a code path — external auth.
- **Why stock_master seed didn't fire before:** DB shows `mcap_type = numeric` and ICICIBANK master mcap present, yet no cache row. The `typeof === "number"` guard collapses to false for every PostgREST `numeric` response.

## Rollback

Two-line revert on the same file (restore `typeof m.market_cap_rs === "number"` guards). No schema, no config, no cron touched.

## Confirmation of No Unrelated Change

- Only `sync-fundamentals-finedge/index.ts` is edited.
- No changes to: LTP flow, UI, sync-news-marketaux, stock-recommendation-query, migrations, cron.job entries, runtime_config, or shared helpers.
- News filtering, InvIT/REIT gating, freshness skip, cursor advance, telemetry, retry/backoff logic — all untouched.

## Post-Deploy Verification Plan

1. Invoke `sync-fundamentals-finedge` targeted at ICICIBANK's window (force = true, or wait for cursor to reach I on next wrap).
2. Run the verification SQL below.
3. Report the 5-symbol table.

**Verification SQL:**

```sql
SELECT
  sm.symbol,
  sm.market_cap_rs        AS master_mcap,
  fc.market_cap_rs        AS cache_mcap,
  fc.source               AS fundamentals_source,
  fc.updated_at           AS fundamentals_updated_at
FROM (
  SELECT DISTINCT ON (symbol) symbol, exchange, market_cap_rs
  FROM stock_master
  WHERE symbol IN ('ALKEM','APOLLOHOSP','BIOCON','DRREDDY','ICICIBANK')
    AND exchange = 'NSE'
  ORDER BY symbol, market_cap_rs NULLS LAST
) sm
LEFT JOIN fundamentals_cache fc
  ON fc.symbol = sm.symbol AND fc.exchange = sm.exchange
ORDER BY sm.symbol;
```

**Expected after deploy + next tick reaching each symbol:**


| symbol                                | expected outcome                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| ICICIBANK                             | cache row created via `stock_master_seed` (RC-1 fix); provenance in `attempts_sample`                    |
| ALKEM / APOLLOHOSP / BIOCON / DRREDDY | remain null until FinEdge returns fields OR TD key is restored — master mcap is null so seed cannot help |


---

**STOP. Awaiting your explicit approval to deploy this one-file, two-line diff. No code has been changed yet.**  
  
APPROVED — deploy the one-file, two-line stock_master seed fix (RC-1). Confirmed: pickNum coercion is correct, rollback is clean, no other paths touched.

After deploy, run a targeted invocation reaching ICICIBANK and return the 5-symbol verification SQL result. I expect ICICIBANK to populate via stock_master_seed; ALKEM/APOLLOHOSP/BIOCON/DRREDDY to stay null (their master_mcap is also null — understood, not a code issue).

Separately on RC-2 (Twelve Data 403 twelvedata_auth): this is a credentials/config issue, not code. Tell me:

1. Is TWELVE_DATA_API_KEY set in THIS function's Supabase env, and does it match my active Grow-plan key?

2. Does my Grow plan include the /profile and /statistics endpoints the fallback calls, or is it hitting an endpoint my plan excludes?

3. Once the key is fixed, will the existing (now-correct) fallback code recover the 503'd symbols with no further code change?

Do not change any other code. Report findings.

&nbsp;