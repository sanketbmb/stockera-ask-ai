
# FINAL Revised Combined Plan — Task 2 becomes query-time GICS mapping only

## Headline changes vs previous revision
- **Task 1**: unchanged (approved).
- **Task 2**: **M5 (stock_master.sector_canonical backfill) is removed entirely**. No schema, no data change on `stock_master`. Fix lives purely in `stock-recommendation-query` as a UI-label → GICS-label mapper that matches `sector_canonical` first, then falls back to `sector`.
- **Task 3**: unchanged (data-blocked, no code this cycle).

## 1. Revised root-cause summary

### Task 1 — visible cohort churn (unchanged)
Visible cohort chosen at read-time by score-slice on the raw include pool. Sub-point score moves near the top-N cutoff flip membership day-over-day with no upstream reason. `composite_score_persist_*` is a misnamed display-visibility flag, not a membership persister. Fix: mark the low-churn top-N in the batch producer via new `is_top_pick` column; the query prefers that cohort **only when unfiltered** so filtered views keep breadth.

### Task 2 — sector filter (revised)
`stock-recommendation-query` compares the UI label (e.g. `"Pharma"`) directly against `stock_master.sector` (GICS labels like `"Healthcare"`). Every non-`ALL` selection returns zero survivors. Verified live data: `stock_master.sector_canonical` is already populated with **GICS-style labels** (e.g. `"Financial Services"`, `"Healthcare"`, `"IT"`, `"Industrials"`), NOT snake_case slugs. Slug vocabulary lives on a different path (sector-aggregates / sector-view) and is not the vocabulary this filter should be forced onto. Fix is a query-time UI-label → GICS mapping in `stock-recommendation-query`, matching `sector_canonical` first and falling back to `sector`. No `stock_master` write.

### Task 3 — index filter (unchanged)
Query joins `stock_index_membership` correctly; table has 3 rows and no ingestion. Documented; no code changes this cycle.

## 2. Where hysteresis applies (unchanged)
- **Broad eligible pool** = all `verdict='include'` rows for latest completed batch. Serves any filtered view. Hysteresis does NOT apply here (breadth required for filters to return results).
- **Visible top cohort** = low-churn top-N (default 10). Serves the default unfiltered view via `is_top_pick=true`. Hysteresis applies here only.
- Query branch:
  ```
  unfiltered = (sector === ALL_SECTORS) && (indexName === ALL_INDICES)
  if unfiltered && topRows.length > 0 → pool = topRows (is_top_pick=true)
  else                                → pool = auditRows (broad include pool)
  ```
- Bootstrap fallback: if `is_top_pick` count is 0, unfiltered view falls back to broad pool (never empty).

## 3. `persistence_reason` semantics + enum (unchanged from prior revision)
- `new_entry` — NOT in yesterday's `is_top_pick` set; IS in today's.
- `incumbent_within_band` — WAS incumbent; today's raw score < cutoff but ≥ (cutoff − band); kept.
- `incumbent_tenure_hold` — WAS incumbent; below band; tenure_days < min_tenure_days; kept.
- `evicted_churn_cap` — WAS incumbent; would have been evicted; churn cap forced retention; kept.
- Natural retention: `persistence_reason IS NULL` + `was_incumbent = true`.
- Evictions are implicit (yesterday's incumbent absent from today's include-set / cohort). No exclude-audit rows written. `evicted_hard_exclusion` and `evicted_score` are NOT in the enum.

CHECK constraint:
```sql
CHECK (persistence_reason IS NULL OR persistence_reason IN
  ('new_entry','incumbent_within_band','incumbent_tenure_hold','evicted_churn_cap'))
```

## 4. Task 2 mapping (query-time only)

**Explicit statement:** Task 2 is implemented purely as query-time UI-label → GICS-label mapping in `stock-recommendation-query`. **No migration, no `stock_master` backfill, no slug conversion, no snapshot rebuild.**

Exact UI → GICS mapping (from user directive, verbatim):

```ts
const UI_TO_GICS: Record<string, string[]> = {
  "Banking & Finance": ["Financial Services"],
  "Pharma":            ["Healthcare"],
  "Auto":              ["Consumer Discretionary", "Consumer Durables"],
  "FMCG":              ["Consumer Staples"],
  "IT":                ["IT", "Information Technology"],
  "Metals":            ["Materials"],
  "Infra":             ["Industrials"],
  "Energy":            ["Energy"],
  "Utilities":         ["Utilities"],
  "Telecom":           ["Communication Services"],
  "Defence":           ["Industrials"],
};
```

Filter rules:
1. If `sector === ALL_SECTORS` → **skip sector filter entirely**; no mapping attempted.
2. `effectiveSector = stock_master.sector_canonical ?? stock_master.sector`
3. `allowed = UI_TO_GICS[uiLabel] ?? [uiLabel]`
4. Row passes if `effectiveSector` matches any entry in `allowed` using **trimmed, case-insensitive** equality.
5. If `effectiveSector` is null/empty → row is excluded from the filtered result.

## 5. Files touched (revised — M5 removed)

| File | Kind | Why |
|---|---|---|
| `supabase/migrations/<ts>_sp_pick_audit_hysteresis_cols.sql` | new (M1) | Add `was_incumbent`, `is_top_pick`, `persistence_reason` + CHECK + partial index + `sp_pick_tenure_days` helper |
| `supabase/migrations/<ts>_sp_write_audit_row_v3.sql` | new (M2) | RPC gains 3 optional trailing params (bookkeeping only, after `p_legal_name`) |
| `supabase/migrations/<ts>_sp_composite_score_visible_rename.sql` | new (M3) | Value-preserving rename `composite_score_persist_*` → `composite_score_visible_*` |
| `supabase/migrations/<ts>_sp_hysteresis_defaults.sql` | new (M4) | Seed `hysteresis_display_n=10`, `hysteresis_band_pts=2.0`, `hysteresis_min_tenure_days=1`, `hysteresis_daily_churn_cap_pct=30` |
| ~~`supabase/migrations/<ts>_stock_master_sector_canonical_backfill.sql`~~ | **REMOVED** | Not doing any `stock_master` write |
| `supabase/functions/_shared/stock-picker/types.ts` | edit | 3 optional trailing fields on `WriteAuditRowParams` |
| `supabase/functions/stock-picker-write-audit/index.ts` | edit | Forward the 3 new params to the RPC |
| `supabase/functions/stock-picker-daily-cron/index.ts` | edit | Hysteresis + `is_top_pick` marking on visible cohort |
| `supabase/functions/stock-recommendation-query/index.ts` | edit | Flag rename + query-time GICS mapping + `is_top_pick` preference when unfiltered |

Unchanged & explicitly untouched: `sync-ltp-dhan`, `refresh-ltp`, `snapshot-ltp-close`, `sync-fundamentals-finedge`, `sync-news-marketaux`, `_shared/stock-picker/replay-hash.ts`, `stock-picker-build-universe`, UI (no redesign), index ingestion (deferred).

## 6. Migration list (final)
1. **M1** `sp_pick_audit_hysteresis_cols.sql`
2. **M2** `sp_write_audit_row_v3.sql`
3. **M3** `sp_composite_score_visible_rename.sql`
4. **M4** `sp_hysteresis_defaults.sql`
5. ~~M5~~ **REMOVED**

## 7. Migration SQL

### M1 — `sp_pick_audit_hysteresis_cols.sql`
```sql
ALTER TABLE public.stock_picker_pick_audit
  ADD COLUMN IF NOT EXISTS was_incumbent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_top_pick   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS persistence_reason text NULL;

ALTER TABLE public.stock_picker_pick_audit
  DROP CONSTRAINT IF EXISTS stock_picker_pick_audit_persistence_reason_chk;
ALTER TABLE public.stock_picker_pick_audit
  ADD CONSTRAINT stock_picker_pick_audit_persistence_reason_chk
  CHECK (persistence_reason IS NULL OR persistence_reason IN (
    'new_entry','incumbent_within_band','incumbent_tenure_hold','evicted_churn_cap'
  ));

CREATE INDEX IF NOT EXISTS idx_pick_audit_batch_top
  ON public.stock_picker_pick_audit(batch_id) WHERE is_top_pick = true;

COMMENT ON COLUMN public.stock_picker_pick_audit.is_top_pick IS
  'True for rows in the low-churn visible cohort (default unfiltered view). Bookkeeping only; never enters replay-hash. Evictions are implicit — no exclude-audit rows written.';
COMMENT ON COLUMN public.stock_picker_pick_audit.persistence_reason IS
  'KEPT-row reason only. NULL = natural retention when was_incumbent=true, OR new_entry when was_incumbent=false. Evictions are implicit and not audited here.';

CREATE OR REPLACE FUNCTION public.sp_pick_tenure_days(
  p_symbol text, p_exchange text, p_before_batch uuid, p_max_lookback int DEFAULT 20)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  WITH batches AS (
    SELECT DISTINCT batch_id, generated_at FROM stock_picker_pick_audit
     WHERE batch_type='live' AND batch_id <> p_before_batch
     ORDER BY generated_at DESC LIMIT p_max_lookback),
  m AS (
    SELECT b.batch_id, b.generated_at,
           EXISTS (SELECT 1 FROM stock_picker_pick_audit a
                    WHERE a.batch_id=b.batch_id AND a.symbol=p_symbol AND a.exchange=p_exchange
                      AND a.verdict='include' AND a.is_top_pick=true) AS present
      FROM batches b)
  SELECT COALESCE(SUM(CASE WHEN present THEN 1 ELSE 0 END), 0)::int
    FROM (SELECT present, bool_and(present) OVER (ORDER BY generated_at DESC) AS streak FROM m) x
   WHERE streak;
$$;
GRANT EXECUTE ON FUNCTION public.sp_pick_tenure_days(text,text,uuid,int) TO service_role;
```
Rollback: drop the 3 columns, the index, the constraint, and the function.

### M2 — `sp_write_audit_row_v3.sql`
Replaces the prior 16-arg RPC with a 19-arg version. New optional args are appended strictly AFTER `p_legal_name`:
- `p_was_incumbent boolean DEFAULT false`
- `p_is_top_pick boolean DEFAULT false`
- `p_persistence_reason text DEFAULT NULL`

Body identical to current except INSERT column list adds the three new columns with the parameter values. Existing callers that pass 16 args continue to work (defaults apply). No change to replay-hash inputs.

Rollback: reapply the previous 16-arg definition.

### M3 — `sp_composite_score_visible_rename.sql`
```sql
-- Value-preserving rename. Reads new key, deletes old.
INSERT INTO public.stock_picker_runtime_config (config_key, config_value)
SELECT REPLACE(config_key, 'composite_score_persist_', 'composite_score_visible_'), config_value
  FROM public.stock_picker_runtime_config
 WHERE config_key LIKE 'composite_score_persist_%'
ON CONFLICT (config_key) DO NOTHING;

DELETE FROM public.stock_picker_runtime_config
 WHERE config_key LIKE 'composite_score_persist_%';
```
Rollback: mirror-image INSERT/DELETE.

### M4 — `sp_hysteresis_defaults.sql`
```sql
INSERT INTO public.stock_picker_runtime_config (config_key, config_value) VALUES
  ('hysteresis_display_n',            '10'::jsonb),
  ('hysteresis_band_pts',             '2.0'::jsonb),
  ('hysteresis_min_tenure_days',      '1'::jsonb),
  ('hysteresis_daily_churn_cap_pct',  '30'::jsonb)
ON CONFLICT (config_key) DO NOTHING;
```
Rollback: `DELETE FROM stock_picker_runtime_config WHERE config_key LIKE 'hysteresis_%';`

## 8. Code diffs

### `_shared/stock-picker/types.ts` — `WriteAuditRowParams`
Append AFTER `p_legal_name`:
```ts
  p_was_incumbent?: boolean;
  p_is_top_pick?: boolean;
  p_persistence_reason?: string | null;
```

### `stock-picker-write-audit/index.ts` — RPC payload
Append to the RPC arg object (matching order):
```ts
  p_was_incumbent:      params.p_was_incumbent      ?? false,
  p_is_top_pick:        params.p_is_top_pick        ?? false,
  p_persistence_reason: params.p_persistence_reason ?? null,
```
Verdict guard unchanged: these fields are only meaningful for `verdict='include'`; defaults (false/false/null) are safe for the other verdicts.

### `stock-picker-daily-cron/index.ts` — hysteresis block
Insert BEFORE the `pickAuditOps` map (around line 1401). Full block identical to prior revision — reproduced here for completeness:

```ts
// ---- Hysteresis: choose today's visible cohort of size DISPLAY_N ----
const hDisplayN     = Number(config.get('hysteresis_display_n')           ?? 10);
const hBandPts      = Number(config.get('hysteresis_band_pts')            ?? 2.0);
const hMinTenure    = Number(config.get('hysteresis_min_tenure_days')     ?? 1);
const hChurnCapPct  = Number(config.get('hysteresis_daily_churn_cap_pct') ?? 30);
const churnCap      = Math.ceil((hChurnCapPct / 100) * hDisplayN);

// 1. Yesterday's is_top_pick set (single most recent prior live batch)
const { data: yRows } = await supabase
  .from('stock_picker_pick_audit')
  .select('symbol, exchange, generated_at, batch_id')
  .eq('batch_type','live').eq('verdict','include').eq('is_top_pick', true)
  .neq('batch_id', batchId)
  .order('generated_at', { ascending:false })
  .limit(500);
const yBatchId = yRows?.[0]?.batch_id ?? null;
const yesterdayIncumbents = new Set(
  (yRows ?? []).filter(r => r.batch_id === yBatchId).map(r => `${r.symbol}|${r.exchange}`));

// 2. Today's scores for survivors
const scoreByKey = new Map<string, number | null>();
for (const s of includedSurvivors) {
  scoreByKey.set(`${s.symbol}|${s.exchange}`, computeCompositeScore(s.symbol, s.exchange));
}

// 3. Rank survivors → rawTop + cutoff
const survivorsSorted = [...includedSurvivors].sort((a,b) => {
  const sa = scoreByKey.get(`${a.symbol}|${a.exchange}`);
  const sb = scoreByKey.get(`${b.symbol}|${b.exchange}`);
  if (sa == null && sb == null) return 0;
  if (sa == null) return 1;
  if (sb == null) return -1;
  return sb - sa;
});
const rawTop = survivorsSorted.slice(0, hDisplayN);
const cutoff = rawTop.length === hDisplayN
  ? (scoreByKey.get(`${rawTop[hDisplayN-1].symbol}|${rawTop[hDisplayN-1].exchange}`) ?? -Infinity)
  : -Infinity;

// 4. Seed cohort with rawTop
const cohort = new Map<string, { survivor: typeof includedSurvivors[number]; reason: string | null }>();
for (const s of rawTop) {
  const k = `${s.symbol}|${s.exchange}`;
  cohort.set(k, { survivor: s, reason: yesterdayIncumbents.has(k) ? null : 'new_entry' });
}

// 5. Reinstate incumbents dropped by rawTop
const droppedIncumbents = [...yesterdayIncumbents].filter(k => !cohort.has(k));
type Candidate = { key:string; score:number; margin:number; hardExcluded:boolean; tenure:number };
const evalCand: Candidate[] = [];
for (const k of droppedIncumbents) {
  const [sym, exch] = k.split('|');
  const surv = includedSurvivors.find(s => s.symbol===sym && s.exchange===exch);
  const hardExcluded = !surv;
  const sc = surv ? (scoreByKey.get(k) ?? -Infinity) : -Infinity;
  const { data: tenureVal } = await supabase.rpc('sp_pick_tenure_days',
    { p_symbol: sym, p_exchange: exch, p_before_batch: batchId, p_max_lookback: 20 });
  const tenure = hardExcluded ? 0 : Number(tenureVal ?? 0);
  evalCand.push({ key:k, score:sc, margin: sc - cutoff, hardExcluded, tenure });
}

// 5a. Band reinstates
for (const c of evalCand) {
  if (c.hardExcluded) continue;
  if (c.score >= cutoff - hBandPts) {
    const [sym, exch] = c.key.split('|');
    const surv = includedSurvivors.find(s => s.symbol===sym && s.exchange===exch)!;
    cohort.set(c.key, { survivor: surv, reason: 'incumbent_within_band' });
  }
}
// 5b. Tenure-hold reinstates
for (const c of evalCand) {
  if (cohort.has(c.key) || c.hardExcluded) continue;
  if (c.tenure < hMinTenure) {
    const [sym, exch] = c.key.split('|');
    const surv = includedSurvivors.find(s => s.symbol===sym && s.exchange===exch)!;
    cohort.set(c.key, { survivor: surv, reason: 'incumbent_tenure_hold' });
  }
}

// 6. Churn cap
const stillDropped = evalCand
  .filter(c => !c.hardExcluded && !cohort.has(c.key))
  .sort((a,b) => b.margin - a.margin);
if (stillDropped.length > churnCap) {
  const reinstateCount = stillDropped.length - churnCap;
  for (const c of stillDropped.slice(0, reinstateCount)) {
    const [sym, exch] = c.key.split('|');
    const surv = includedSurvivors.find(s => s.symbol===sym && s.exchange===exch)!;
    cohort.set(c.key, { survivor: surv, reason: 'evicted_churn_cap' });
  }
}

// 7. Trim overflow (bias retention toward incumbents)
if (cohort.size > hDisplayN) {
  const trim = cohort.size - hDisplayN;
  const trimmable = [...cohort.entries()]
    .filter(([,v]) => v.reason === null || v.reason === 'new_entry')
    .sort(([,a],[,b]) => {
      const sa = scoreByKey.get(`${a.survivor.symbol}|${a.survivor.exchange}`) ?? -Infinity;
      const sb = scoreByKey.get(`${b.survivor.symbol}|${b.survivor.exchange}`) ?? -Infinity;
      return sa - sb;
    })
    .slice(0, trim);
  for (const [k] of trimmable) cohort.delete(k);
}

const cohortKeys = new Set(cohort.keys());
```

Then in the `pickAuditOps` builder, attach the 3 new params for each row:
```ts
const pickAuditOps = includedSurvivors.map((survivor) => {
  const k = `${survivor.symbol}|${survivor.exchange}`;
  const isTop = cohortKeys.has(k);
  const wasInc = yesterdayIncumbents.has(k);
  const reason = isTop ? (cohort.get(k)!.reason) : null;
  const params: WriteAuditRowParams = {
    /* ...existing fields unchanged, including p_composite_score... */
    p_was_incumbent: wasInc,
    p_is_top_pick: isTop,
    p_persistence_reason: reason,
  };
  return { op:'write_pick_audit' as const, params, risk_profile_guard: riskProfile };
});
```

### `stock-recommendation-query/index.ts` — Task 2 query-time mapping + visible-cohort preference + flag rename

**(a) `stock_master` select** — add `sector_canonical` at line 269 if absent:
```ts
.select("symbol, company_name, sector, sector_canonical, exchange, is_active")
```

**(b) `MasterAgg`** — add `sector_canonical: string | null` field; aggregator preserves first non-null.

**(c) Audit-row select at line 252** — add `is_top_pick`:
```ts
.select("symbol, exchange, verdict, composite_score, generated_at, batch_id, is_top_pick")
```

**(d) Visible-cohort preference** — around Step 4 (line 347):
```ts
const unfiltered = (sector === ALL_SECTORS) && (indexName === ALL_INDICES);
const topRows = unfiltered ? auditRows.filter(r => (r as any).is_top_pick === true) : [];
const pool = (unfiltered && topRows.length > 0) ? topRows : auditRows;
// existing sector+index+sort+slice pipeline runs over `pool`
```

**(e) Sector filter — replace the broken lines 346–359** with the query-time GICS mapper:
```ts
const UI_TO_GICS: Record<string, string[]> = {
  "Banking & Finance": ["Financial Services"],
  "Pharma":            ["Healthcare"],
  "Auto":              ["Consumer Discretionary", "Consumer Durables"],
  "FMCG":              ["Consumer Staples"],
  "IT":                ["IT", "Information Technology"],
  "Metals":            ["Materials"],
  "Infra":             ["Industrials"],
  "Energy":            ["Energy"],
  "Utilities":         ["Utilities"],
  "Telecom":           ["Communication Services"],
  "Defence":           ["Industrials"],
};
const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase();

// In the predicate (only executed when sector !== ALL_SECTORS):
if (sector !== ALL_SECTORS) {
  const agg = masterBySymbol.get(sym);
  const effectiveSector = agg?.sector_canonical ?? agg?.sector ?? null;
  if (!effectiveSector) return false;
  const allowed = (UI_TO_GICS[sector] ?? [sector]).map(norm);
  if (!allowed.includes(norm(effectiveSector))) return false;
}
```

Notes on (e):
- When `sector === ALL_SECTORS`, the sector predicate is skipped entirely — no mapping attempted, no rows dropped by sector.
- `effectiveSector = sector_canonical ?? sector` — canonical wins when present, raw GICS is the fallback for rows where canonical is null.
- Comparison is trimmed + case-insensitive so `"IT"` vs `"IT"` and `"Financial Services"` vs `"financial services"` both match.
- Unknown UI labels fall through to `[uiLabel]` (self-match), matching current behavior for any label not in the map.

**(f) Flag rename (lines 1277–1301)** — swap 4 keys from `composite_score_persist_*` → `composite_score_visible_*`. Read fresh per request (already the case).

## 9. Filter-breadth invariant (unchanged)
- Unfiltered (`sector=ALL`, `index=ALL`) → serves `is_top_pick=true` cohort (~10 rows). Falls back to broad pool if cohort empty.
- Any filter engaged → serves broad `verdict='include'` pool. No hysteresis; full breadth preserved.
- `stock_count` slicing behavior unchanged.

## 10. Confirmations
- `replay-hash.ts`: **UNCHANGED**. New RPC params sit strictly AFTER `p_legal_name`; not in `CanonicalBundle`; not in canonicalizers; not in replay-hash argument list.
- LTP / fundamentals / news / snapshot pipelines: **UNCHANGED**.
- `stock-picker-build-universe`: **UNCHANGED**.
- **No `stock_master` write**. No slug conversion. No snapshot rebuild. No UI redesign. No index ingestion this cycle.

## 11. Rollback
- Per migration: reverse SQL provided in §7.
- Per code file: revert to prior SHA. Query tolerates missing `is_top_pick` (unfiltered branch reads `undefined` as `false`, falls back to broad pool). RPC defaults handle 16-arg callers.

## 12. Post-deploy verification
- **Task 1** (after first live cron post-deploy):
  ```sql
  SELECT COUNT(*) FILTER (WHERE is_top_pick) AS top_n,
         COUNT(*) AS include_pool
    FROM stock_picker_pick_audit
   WHERE batch_id = (SELECT batch_id FROM stock_picker_pick_audit
                       WHERE batch_type='live' AND verdict='include'
                       ORDER BY generated_at DESC LIMIT 1)
     AND verdict='include';
  -- expect top_n ≤ hysteresis_display_n (=10)

  SELECT persistence_reason, COUNT(*)
    FROM stock_picker_pick_audit
   WHERE batch_id = (…) AND is_top_pick
   GROUP BY 1;
  -- expect NULL + new_entry dominant on day 1; incumbent_* / evicted_churn_cap on later days
  ```
- **Task 2** live API smoke:
  - `sector=ALL_SECTORS` → sector filter skipped; result count unchanged from today.
  - `sector="Banking & Finance"` → returns rows where `effectiveSector = "Financial Services"`.
  - `sector="Pharma"` → returns rows where `effectiveSector = "Healthcare"`.
  - `sector="IT"` → matches both `"IT"` and `"Information Technology"`.
  - `sector="Auto"` → matches `"Consumer Discretionary"` and `"Consumer Durables"`.
  - Unfiltered day-over-day symbol overlap (after two live batches) ≥ (10 − churnCap = 7).

## 13. Task 3
Data-blocked. NSE index CSVs, monthly ingestion job. Not built this cycle.

---

**Explicit statement:** Task 2 now uses **query-time GICS mapping only**. No migration, no `stock_master` backfill, no slug conversion, no snapshot rebuild. M5 is removed from the migration list.

**STOP. Awaiting explicit approval of this final revised plan before code + migrations are written and deployed.**
