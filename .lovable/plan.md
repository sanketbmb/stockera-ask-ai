# SP-1 Pro Sector Filter — Label Mismatch Fix

## 1. Root cause

`stock-recommendation-query/index.ts` already has a `UI_TO_GICS` map and query-time mapping wired up (Task 2 shipped). But the map's **keys use short labels** (`"Pharma"`, `"Auto"`, `"IT"`, `"Metals"`, `"Infra"`, `"Energy"`, `"Utilities"`), while `src/components/stock-picker/StockPickerFlow.tsx` sends the **long UI labels** (`"Pharmaceuticals"`, `"Automobile"`, `"Information Technology"`, `"Metals & Mining"`, `"Infrastructure"`, `"Energy & Power"`).

Result: every non-Banking/FMCG/Telecom/Defence sector falls through to `[sector]` (raw UI label), fails the case-insensitive match against `stock_master.sector_canonical` / `sector` (GICS labels), and returns `no_survivors_match_filter`.

Also missing entries: `"Real Estate"`, `"Chemicals"`, `"Consumer Durables"`.

## 2. Scope — what does NOT change

- No schema change, no migration, no backfill.
- No UI change.
- `sector_canonical` is already in the `stock_master` select (line 270) and already carried on `MasterAgg` (lines 282, 318) — no edit needed.
- `ALL_SECTORS` short-circuit preserved (line 380).
- Visible-cohort `is_top_pick` logic preserved (lines 357-361).
- Index filter preserved (line 394-396).
- `no_survivors_match_filter` behavior preserved (line 401-403).
- No changes to Task 1 hysteresis, replay-hash, LTP, sync-fundamentals-finedge, sync-news-marketaux, or index ingestion.

## 3. Exact change

**File:** `supabase/functions/stock-recommendation-query/index.ts`
**Lines:** 366–378 (the `UI_TO_GICS` object literal only). Nothing else in the file changes.

## 4. Full unified diff

```diff
--- a/supabase/functions/stock-recommendation-query/index.ts
+++ b/supabase/functions/stock-recommendation-query/index.ts
@@ -363,17 +363,20 @@
     // Task 2: query-time UI-label -> GICS-label mapping. stock_master.sector_canonical
     // already carries GICS-style labels ("Financial Services", "Healthcare", ...);
     // no schema/backfill needed. Match sector_canonical first, fall back to sector.
     const UI_TO_GICS: Record<string, string[]> = {
-      "Banking & Finance": ["Financial Services"],
-      "Pharma":            ["Healthcare"],
-      "Auto":              ["Consumer Discretionary", "Consumer Durables"],
-      "FMCG":              ["Consumer Staples"],
-      "IT":                ["IT", "Information Technology"],
-      "Metals":            ["Materials"],
-      "Infra":             ["Industrials"],
-      "Energy":            ["Energy"],
-      "Utilities":         ["Utilities"],
-      "Telecom":           ["Communication Services"],
-      "Defence":           ["Industrials"],
+      "Banking & Finance":     ["Financial Services"],
+      "Information Technology":["IT", "Information Technology"],
+      "Pharmaceuticals":       ["Healthcare"],
+      "Automobile":            ["Consumer Discretionary", "Consumer Durables"],
+      "FMCG":                  ["Consumer Staples"],
+      "Energy & Power":        ["Energy", "Utilities"],
+      "Infrastructure":        ["Industrials"],
+      "Metals & Mining":       ["Materials"],
+      "Real Estate":           ["Real Estate"],
+      "Telecom":               ["Communication Services"],
+      "Chemicals":             ["Chemicals"],
+      "Defence":               ["Industrials"],
+      "Consumer Durables":     ["Consumer Durables", "Consumer Discretionary"],
     };
```

## 5. Confirmation

No other paths in the repo are touched. Only the `UI_TO_GICS` literal at lines 366–378 is replaced. `norm()`, `allowedSectorsNorm`, the `filtered` loop, `effectiveSector = sector_canonical ?? sector`, ALL_SECTORS skip, index filter, and no_survivors_match_filter remain byte-identical.

## 6. Expected post-fix behavior


| UI selection           | Matches stock_master rows where sector_canonical ?? sector ∈ | Notes                                                     |
| ---------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| All Sectors            | (filter skipped)                                             | uses is_top_pick cohort                                   |
| Banking & Finance      | Financial Services                                           | &nbsp;                                                    |
| Information Technology | IT, Information Technology                                   | &nbsp;                                                    |
| Pharmaceuticals        | Healthcare                                                   | &nbsp;                                                    |
| Automobile             | Consumer Discretionary, Consumer Durables                    | &nbsp;                                                    |
| FMCG                   | Consumer Staples                                             | &nbsp;                                                    |
| Energy & Power         | Energy, Utilities                                            | &nbsp;                                                    |
| Infrastructure         | Industrials                                                  | &nbsp;                                                    |
| Metals & Mining        | Materials                                                    | &nbsp;                                                    |
| Real Estate            | Real Estate                                                  | may be empty — data gap, not a bug                        |
| Telecom                | Communication Services                                       | &nbsp;                                                    |
| Chemicals              | Chemicals                                                    | &nbsp;                                                    |
| Defence                | Industrials                                                  | shares pool with Infrastructure until Defence flag exists |
| Consumer Durables      | Consumer Durables, Consumer Discretionary                    | &nbsp;                                                    |


Matching is trimmed + case-insensitive; `sector_canonical` preferred, `sector` fallback; empty result still returns `no_survivors_match_filter`.

## 7. STOP — awaiting approval before deploy.  
  
Approved, with one small hardening requirement before deploy:

Do NOT replace the existing short-form sector keys only.

Make the UI_TO_GICS map additive so it supports BOTH:

- current long UI labels:

  "Information Technology", "Pharmaceuticals", "Automobile", "Metals & Mining", "Infrastructure", "Energy & Power", "Consumer Durables", "Chemicals", "Real Estate"

AND

- existing short-form aliases:

  "IT", "Pharma", "Auto", "Metals", "Infra", "Energy", "Utilities"

Keep all behavior otherwise identical.

No other file changes.

Then deploy and verify.

&nbsp;