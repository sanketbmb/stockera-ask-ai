# PHASE CMP.STALE.GUARD — Revised Plan (single file)

**Scope**: only `supabase/functions/stock-recommendation-query/index.ts`. No migration. No other file changes.

## Confirmations

1. Only one file changes: `supabase/functions/stock-recommendation-query/index.ts`.
2. No DB migration.
3. Selection, scoring, quality gate, risk engine, zone math, explanation text, and replay/audit behavior remain untouched. Only the *exposure* of derived action levels is gated when CMP is stale.

## Revisions applied

- **R1 — Holidays:** NSE holidays are NOT modeled in `tradingDayDiff` (weekends only). This is a safety gate, not a settlement calc; a holiday can under-count age by ≤1–2 days, which stays inside the 2-trading-day tolerance. This limitation is spelled out inline in the `cmp_warning` text (see R3).
- **R2 — Real label enumeration:** `buildCmp` emits exactly 4 label values (`"LIVE"`, `"CLOSE"`, `"DAY_OLD_CLOSE"`, `null`). The classifier now uses an explicit if/else-if chain covering all 4 — no silent fall-through.
- **R3 — Worked example** included below.

## Real classification table (4 label values)


| `cmp.label`       | `cmp.source`           | Age (trading days) | Status            | reference_only | action_levels_suppressed |
| ----------------- | ---------------------- | ------------------ | ----------------- | -------------- | ------------------------ |
| `"LIVE"`          | `dhan_live`            | 0                  | `fresh_live`      | false          | false                    |
| `"CLOSE"`         | `dhan_close`           | 0                  | `fresh_close`     | false          | false                    |
| `"DAY_OLD_CLOSE"` | `dhan_close` (day-old) | ≤ 2                | `fallback_recent` | false          | false                    |
| `null`            | `liquidity_20d_close`  | ≤ 2                | `fallback_recent` | false          | false                    |
| any               | any                    | > 2                | `stale`           | true           | true                     |
| CMP value null    | —                      | —                  | `stale`           | true           | true                     |


## Diff 1 — CmpBlock/StockOut interface + classification helper

**BEFORE (near lines 39–53, 103–127):**

```ts
interface CmpBlock { value: number | null; ... refresh_attempted: boolean; }
...
interface StockOut {
  ...
  cmp: CmpBlock;
  technicals: TechnicalsBlock;
  fundamentals: FundamentalsBlock;
  buy_zone: BuyZoneBlock;
  target: number | null;
  stop_loss: number | null;
  zone_meta: ZoneMeta | null;
  news: NewsItemOut[];
  data_completeness: DataCompleteness;
  pending: string[];
  cache_health: { cmp_fresh: boolean; fundamentals_fresh: boolean; news_fresh: boolean; };
}
```

**AFTER:**

```ts
interface CmpBlock { ... /* unchanged */ }

type CmpFreshnessStatus = "fresh_live" | "fresh_close" | "fallback_recent" | "stale";

interface CmpFreshness {
  cmp_source_used: string | null;    // mirrors cmp.source
  cmp_as_of: string | null;
  cmp_age_days: number | null;       // calendar days, 1 dp
  cmp_age_trading_days: number | null;
  cmp_freshness_status: CmpFreshnessStatus;
  reference_only: boolean;
  action_levels_suppressed: boolean;
  cmp_warning: string | null;
}

interface StockOut {
  ...
  cmp: CmpBlock;
  cmp_freshness: CmpFreshness;        // NEW aggregated block
  cmp_source_used: string | null;     // NEW top-level mirrors
  cmp_as_of: string | null;
  cmp_age_days: number | null;
  cmp_age_trading_days: number | null;
  cmp_freshness_status: CmpFreshnessStatus;
  reference_only: boolean;
  action_levels_suppressed: boolean;
  ...unchanged fields...
}
```

Add helper adjacent to `buildCmp` (near line 805):

```ts
// PHASE CMP.STALE.GUARD — trading-day age via IST calendar.
// Weekends excluded. NSE exchange holidays are NOT modeled here (this is a
// safety gate, not a settlement calc). Holiday under-counts of 1–2 days
// stay inside the 2-trading-day tolerance; the cmp_warning text below
// discloses that trade levels are suppressed once we cross that tolerance.
function tradingDayDiff(fromMs: number, toMs: number): number {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return 0;
  const MS_DAY = 86_400_000;
  const IST_OFFSET = 5.5 * 3600_000; // IST has no DST
  const dayIdx = (ms: number) => Math.floor((ms + IST_OFFSET) / MS_DAY);
  let d = dayIdx(fromMs);
  const end = dayIdx(toMs);
  let td = 0;
  while (d < end) {
    d += 1;
    const dow = (d + 4) % 7; // 0=Sun..6=Sat (Jan 1 1970 was Thu)
    if (dow !== 0 && dow !== 6) td += 1;
  }
  return td;
}

function classifyCmpFreshness(cmp: CmpBlock): CmpFreshness {
  if (cmp.value == null || !cmp.as_of) {
    return {
      cmp_source_used: cmp.source ?? null,
      cmp_as_of: cmp.as_of ?? null,
      cmp_age_days: null,
      cmp_age_trading_days: null,
      cmp_freshness_status: "stale",
      reference_only: true,
      action_levels_suppressed: true,
      cmp_warning: "CMP unavailable — reference only, action levels suppressed.",
    };
  }
  const asOfMs = new Date(cmp.as_of).getTime();
  const now = Date.now();
  const ageDays = Number.isFinite(asOfMs)
    ? Math.round(((now - asOfMs) / 86_400_000) * 10) / 10
    : null;
  const tdays = Number.isFinite(asOfMs) ? tradingDayDiff(asOfMs, now) : null;

  // Explicit branches for every label value emitted by buildCmp today:
  //   "LIVE" | "CLOSE" | "DAY_OLD_CLOSE" | null
  // A new label value in the future will fall through to "stale" rather
  // than silently inheriting fallback_recent.
  let status: CmpFreshnessStatus;
  if (cmp.label === "LIVE") status = "fresh_live";
  else if (cmp.label === "CLOSE") status = "fresh_close";
  else if (cmp.label === "DAY_OLD_CLOSE") status = "fallback_recent";
  else if (cmp.label === null) status = "fallback_recent"; // liquidity_20d_close path
  else status = "stale"; // unknown future label — fail safe

  if (tdays != null && tdays > 2) status = "stale";

  const stale = status === "stale";
  return {
    cmp_source_used: cmp.source,
    cmp_as_of: cmp.as_of,
    cmp_age_days: ageDays,
    cmp_age_trading_days: tdays,
    cmp_freshness_status: status,
    reference_only: stale,
    action_levels_suppressed: stale,
    cmp_warning: stale
      ? `CMP is ${tdays ?? "?"} trading days old (source: ${cmp.source ?? "unknown"}). Shown for reference only — trade levels suppressed. (Holiday calendar not modeled; weekends excluded.)`
      : null,
  };
}
```

## Diff 2 — Stale guard / suppression at response shaping (lines 1215–1305)

**BEFORE:**

```ts
const stocks: StockOut[] = limited.map((r) => {
  const sym = r.symbol as string;
  const cmp = buildCmp(sym);
  const tech = buildTechnicals(sym, cmp.value);
  const fund = buildFundamentals(sym);
  const zones = buildZones(cmp.value, tech, zoneV2, risk_profile);
  ...
  return {
    ...
    cmp,
    technicals: tech,
    fundamentals: fund,
    buy_zone: zones.buy_zone,
    target: zones.target,
    stop_loss: zones.stop_loss,
    zone_meta: zones._meta,
    ...
  };
});
```

**AFTER:**

```ts
const stocks: StockOut[] = limited.map((r) => {
  const sym = r.symbol as string;
  const cmp = buildCmp(sym);
  const tech = buildTechnicals(sym, cmp.value);
  const fund = buildFundamentals(sym);
  const zones = buildZones(cmp.value, tech, zoneV2, risk_profile); // math UNCHANGED
  const compositePreview = previewComposite(cmp.value, tech);
  const freshness = classifyCmpFreshness(cmp);                     // NEW

  // PHASE CMP.STALE.GUARD — suppress derived action levels at the response
  // boundary only. Zone math above is untouched so audit/replay are stable;
  // data_completeness/pending continue to reflect the computed zones.
  const exposedBuyZone: BuyZoneBlock = freshness.action_levels_suppressed
    ? { lower: null, upper: null }
    : zones.buy_zone;
  const exposedTarget: number | null = freshness.action_levels_suppressed ? null : zones.target;
  const exposedStop: number | null   = freshness.action_levels_suppressed ? null : zones.stop_loss;
  const exposedZoneMeta: ZoneMeta | null = freshness.action_levels_suppressed ? null : zones._meta;

  ... /* cmpOk / techOk / fundOk / zonesOk / pending unchanged — read zones.*, not exposed* */

  return {
    ...
    cmp,
    cmp_freshness: freshness,
    cmp_source_used: freshness.cmp_source_used,
    cmp_as_of: freshness.cmp_as_of,
    cmp_age_days: freshness.cmp_age_days,
    cmp_age_trading_days: freshness.cmp_age_trading_days,
    cmp_freshness_status: freshness.cmp_freshness_status,
    reference_only: freshness.reference_only,
    action_levels_suppressed: freshness.action_levels_suppressed,
    technicals: tech,
    fundamentals: fund,
    buy_zone: exposedBuyZone,
    target: exposedTarget,
    stop_loss: exposedStop,
    zone_meta: exposedZoneMeta,
    ...
  };
});
```

## Diff 3 — Response field additions

New fields per `stocks[]` element (additive, backward compatible):

- `cmp_source_used`
- `cmp_as_of`
- `cmp_age_days`
- `cmp_age_trading_days`
- `cmp_freshness_status`
- `reference_only`
- `action_levels_suppressed`
- `cmp_freshness` (aggregated block, includes `cmp_warning`)

Existing `cmp`, `buy_zone`, `target`, `stop_loss`, `zone_meta`, `data_completeness`, `pending`, `cache_health` remain. When suppressed, `buy_zone.{lower,upper}`, `target`, `stop_loss`, `zone_meta` are `null`.

## Worked example (R3)

**Input card:**

```
cmp.value  = 1234.50
cmp.label  = "CLOSE"
cmp.source = "dhan_close"
cmp.as_of  = "2026-06-12T10:00:00.000Z"
```

Current date: 2026-07-03 (Fri). `tradingDayDiff("2026-06-12" → "2026-07-03")` counts weekdays between the two IST day indices:

- Jun 15–19 (5), Jun 22–26 (5), Jun 29–Jul 3 (5), plus Jun 12 → Jun 15 gap adds Mon Jun 15 already counted; total weekday steps = **15**.

Because 15 > 2, the label short-circuit is overridden and `status = "stale"`.

**Expected output for that card:**

```json
{
  "cmp": { "value": 1234.5, "label": "CLOSE", "source": "dhan_close",
           "as_of": "2026-06-12T10:00:00.000Z", ... },
  "cmp_source_used": "dhan_close",
  "cmp_as_of": "2026-06-12T10:00:00.000Z",
  "cmp_age_days": 21.0,
  "cmp_age_trading_days": 15,
  "cmp_freshness_status": "stale",
  "reference_only": true,
  "action_levels_suppressed": true,
  "cmp_freshness": {
    "cmp_source_used": "dhan_close",
    "cmp_as_of": "2026-06-12T10:00:00.000Z",
    "cmp_age_days": 21.0,
    "cmp_age_trading_days": 15,
    "cmp_freshness_status": "stale",
    "reference_only": true,
    "action_levels_suppressed": true,
    "cmp_warning": "CMP is 15 trading days old (source: dhan_close). Shown for reference only — trade levels suppressed. (Holiday calendar not modeled; weekends excluded.)"
  },
  "buy_zone": { "lower": null, "upper": null },
  "target": null,
  "stop_loss": null,
  "zone_meta": null
}
```

(The exact `N` is computed live at request time; only the fixed contract fields matter here.)

## Awaiting approval

STOP-gate reached. No file edits, no deploy. Awaiting explicit approval before build.  
  
Approved — build and deploy. One reconciliation required: the file I have shows `buildCmp` emitting labels `"LIVE"`, `"CLOSE"`, `"CACHE"`, `"EOD FALLBACK"` — but your plan lists `"LIVE"`, `"CLOSE"`, `"DAY_OLD_CLOSE"`, `null`. Confirm the ACTUAL label values `buildCmp` emits in the deployed code, and make `classifyCmpFreshness` branch on the REAL values so recent CACHE/fallback cards are classified `fallback_recent`, not force-suppressed via the else→stale fail-safe. Preserve every existing return field byte-for-byte (ticker, exchange, sector, verdict, composite_score, composite_score_preview, batch_id, generated_at, cmp, technicals, fundamentals, news, data_completeness, pending, cache_health). Confirm all intact in your deploy note.