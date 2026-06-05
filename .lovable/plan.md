# Wave 5b — PLAN ONLY

Two independent sub-tracks. Both are data + small-resolver changes. No scoring, weights, RLS, UI, or stock-picker changes.

---

## Sub-track A — NSDL / stock_master exchange-row gap

### Evidence

`stock_master` query confirms:

- **NSDL** → 1 row only, `BSE / BSE_EQ`, dhan_security_id `544467`, company "National Securities Depos" (truncated).
- ICICIBANK / NESTLEIND / IDFCFIRSTB → both NSE + BSE rows present (these are NOT a master-data gap; their issue is Marketaux, sub-track B).

Resolver (`supabase/functions/generate-stock-analysis/index.ts` L150–158):

1. L152 — exact symbol + `exchange=NSE` `limit=1` → miss for NSDL.
2. L156 — exact symbol any-exchange `limit=1` → returns the BSE row. Order is non-deterministic but for NSDL only BSE exists, so it always returns BSE.

So the resolver itself is correct given the data. NSDL fails downstream because callers (Dhan LTP fetch, intraday microstructure, news entity matching with `.NS` suffix) assume an NSE listing.

### Root cause hypothesis

`seed-stock-master/index.ts` filter (L93–98):

```ts
if (instr !== "EQUITY") continue;   // SEM_INSTRUMENT_NAME
if (seg !== "E")        continue;   // SEM_SEGMENT
if (exch !== "NSE" && exch !== "BSE") continue;
```

NSDL IPO'd on NSE in Aug-2025. Either:

- (a) Dhan's CSV currently does not list an NSE EQUITY row for NSDL (upstream gap), or
- (b) the NSE row exists but uses `SEM_INSTRUMENT_NAME` ≠ "EQUITY" (e.g. `EQ`) or `SEM_SEGMENT` ≠ "E" so our filter drops it.

### Step A1 — Verification (no code change, ~0 credits)

1. `curl -s https://images.dhan.co/api-data/api-scrip-master.csv | head -1` to confirm header order.
2. `curl … | awk -F, '$… == "NSDL" {print}'` filtered on `SEM_TRADING_SYMBOL=NSDL` to print every Dhan row for NSDL across both exchanges and inspect `SEM_EXM_EXCH_ID / SEM_INSTRUMENT_NAME / SEM_SEGMENT`.
3. Same scan for a control set of confirmed recent NSE listings (e.g. SWIGGY, OLAELEC, NTPCGREEN, BAJAJHFL, HEXT) to see whether the filter is dropping NSE EQUITY rows for a class of recent listings.

Outcome decides A2.

### Step A2 — Smallest safe fix


| Verification outcome                                             | Fix                                                                                                                                                                                    | File(s)                                                       | Migration? | Deploy surface                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------- | -------------------------------------------------------- |
| Upstream Dhan CSV truly has no NSE row for NSDL                  | One-shot manual insert of the NSE row in `stock_master` (Amendment 1)                                                                                                                  | none (data-only via `supabase--insert`)                       | no schema  | DB write only — no publish, no function redeploy         |
| Dhan CSV has the NSE row but uses different `instr`/`seg` values | Loosen filter in `seed-stock-master` (e.g. accept `EQUITY` OR `EQ`; accept `seg` ∈ {`E`,`EQ`}) **plus** one-shot backfill row for NSDL so today's reports don't wait for the next cron | `supabase/functions/seed-stock-master/index.ts` + data insert | no         | Edge function redeploy (`seed-stock-master`) + DB insert |
| Mixed (some recent listings missing, filter is fine)             | Schedule a one-shot manual reseed (`POST seed-stock-master` with `x-cron-secret`) plus targeted insert for NSDL                                                                        | none                                                          | no         | Function invocation + DB insert                          |


Recommended default before A1 runs: assume (a). Plan the one-shot insert as the baseline; promote to (b) if A1 shows otherwise.

### Step A3 — Defer L156 hardening

Per Amendment 1, the `limit=2 + find(NSE)` hardening at orchestrator L156–173 stays deferred — only revisit when a second dual-listed symbol reproduces the same failure mode. Not in 5b scope.

### Credit estimate (A)

- A1 verification: 0 (curl + awk, no LLM, no Marketaux).
- A2 insert: 0.
- A2 filter loosening + redeploy: ~0 runtime credits (one redeploy).

### Verification checklist (A)

After A2 lands:

1. `SELECT * FROM stock_master WHERE symbol='NSDL'` shows both NSE + BSE rows.
2. Regenerate NSDL intraday report. Confirm:
  - resolver picks NSE row (`audit_meta.exchange='NSE'`),
  - Dhan LTP path returns a quote (no `LTP_UNAVAILABLE`),
  - intraday microstructure module returns numbers instead of `NO_DATA`,
  - hero may still be gray "Insufficient Data" if news/sentiment is empty — that's sub-track B.
3. Re-run a control NSE-only name (`HDFCBANK`) to confirm no regression in resolver order.

---

## Sub-track B — Marketaux alias map

### Evidence (`sentiment_cache` last 7 days)

Zero-article rows on bluechips with obvious recent news flow:

- `NESTLEIND.NS` → 0
- `ICICIBANK.NS` → 0
- `IDFCFIRSTB.NS` → 0
- `HAVELLS.NS` → 0, `VOLTAS.NS` → 0, `KAYNES.NS` → 0, `JYOTHYLAB.NS` → 0, `DEEPAKNTR.NS` → 0, `LICI.NS` → 0, `BPCL.NS` → 0
- `NSDL.NS` → 0 (also affected by sub-track A)

Comparable peers return full quota (`HDFCBANK.NS=20`, `KOTAKBANK.NS=20`, `INFY.NS=20`, `TCS.NS=20`, `PNB.NS=20`). So the Marketaux API is healthy and quota is fine — these symbols are entity-mapping misses.

### Current fetch path

`supabase/functions/compute-sentiment/index.ts`:

- L411–431: tries `${symbol}.NS` first, falls back to bare `${symbol}` if zero articles.
- L201–217 `pickEntitySentiment`: matches entity by `.NS`, then bare, then `${symbol}.` prefix.

Failure modes Marketaux is known to use for Indian equities:

- ICICI Bank: `IBN` (NYSE ADR) and `ICICIBANK.BO` rather than `ICICIBANK.NS`.
- Nestle India: `NEST.BO` / `NESTLEIND.BO`.
- IDFC First Bank: occasionally `IDFCFIRSTB.BO` only; the bare `IDFCFIRSTB` query may collide with delisted IDFC entries.
- LIC India: `LICI.BO` only.
- BPCL: `BPCL.BO` only.
- NSDL: too new — likely genuinely absent (mark as `NO_NEWS_NEW_LISTING`).

### Step B1 — Audit (no code change, ~30–50 Marketaux calls = ~30–50 credits)

For each zero-article symbol above, manually probe Marketaux with three query shapes and record which (if any) returns articles:

- `SYMBOL.NS`
- `SYMBOL.BO`
- `SYMBOL` bare
Plus one `entity_types=equity&search=<company name>` call to detect Marketaux's preferred symbol string.

Output: a candidate alias table `{ canonical_symbol → marketaux_query_string }` for confirmed mismappings, and a residual list of "true NO_NEWS" or "RECENTLY_LISTED" symbols.

### Step B2 — Alias map + multi-format fetch (code change)

New file: `**supabase/functions/_shared/marketaux-aliases.ts**`

```ts
// Canonical NSE symbol → ordered list of Marketaux query strings to try.
// Only add an entry when B1 confirmed the default `.NS` → bare path fails.
export const MARKETAUX_ALIASES: Record<string, string[]> = {
  ICICIBANK:  ["ICICIBANK.BO", "IBN"],
  NESTLEIND:  ["NESTLEIND.BO", "NEST.BO"],
  IDFCFIRSTB: ["IDFCFIRSTB.BO"],
  LICI:       ["LICI.BO"],
  BPCL:       ["BPCL.BO"],
  HAVELLS:    ["HAVELLS.BO"],
  VOLTAS:     ["VOLTAS.BO"],
  // …populated from B1 audit output
};

// Symbols where Marketaux genuinely has no coverage — short-circuit, no API call.
export const MARKETAUX_NO_COVERAGE: Set<string> = new Set([
  "NSDL", // listed Aug-2025, not yet indexed
]);
```

Patch `**supabase/functions/compute-sentiment/index.ts**` L411–431:

1. If symbol ∈ `MARKETAUX_NO_COVERAGE` → set `warning = "NO_COVERAGE_NEW_LISTING"`, write empty cache with longer TTL (e.g. 7 d), return.
2. Build ordered query list: `[${symbol}.NS, ...MARKETAUX_ALIASES[symbol] ?? [], symbol]` (dedup).
3. Iterate; stop on first non-empty result. Record actual successful format in `symbol_format_used` (already exists). Cap at 3 calls per request to bound credit burn.
4. Extend `pickEntitySentiment` (L201–217) to also accept entity symbols matching any alias from the same map (case-insensitive), so the sentiment score from a `.BO` article actually lands on the canonical symbol.

No schema migration. No new env var. Both files are inside `supabase/functions/`.

### Step B3 — Cache invalidation

After deploy, one-shot delete of poisoned cache rows so the new format is exercised immediately:

```sql
DELETE FROM sentiment_cache
WHERE jsonb_array_length(articles) = 0
  AND symbol = ANY(ARRAY['ICICIBANK','NESTLEIND','IDFCFIRSTB','LICI','BPCL','HAVELLS','VOLTAS','NSDL', …]);
```

Run via `supabase--insert` (DELETE allowed).

### Deploy surface (B)

- B1: no deploy, ad-hoc curl scripts only.
- B2: edge function redeploy (`compute-sentiment` + new `_shared/marketaux-aliases.ts`). No frontend publish.
- B3: DB delete.

### Credit estimate (B)

- B1 audit: ~30–50 Marketaux calls (well inside the 2,500/day budget; ~2% of cap).
- B2 runtime: same or *fewer* calls in steady state — most symbols still resolve on `.NS`; aliased symbols cost +1 call once per TTL cycle.
- B3: 0.

### Verification checklist (B)

After B2 deploy + B3 cache clear:

1. Regenerate medium-term reports for ICICIBANK, NESTLEIND, IDFCFIRSTB. Confirm `sentiment_cache.symbol_format_used` is no longer `…NS`, and `jsonb_array_length(articles) > 0`.
2. Spot-check `audit_meta.sentiment_module` shows numeric `news_sentiment` instead of `NO_NEWS`.
3. Regenerate HDFCBANK / INFY / TCS to confirm no regression on healthy symbols (still `.NS`, ≥1 article).
4. NSDL report still gray "Insufficient Data" but with reason now including `NO_COVERAGE_NEW_LISTING` rather than empty-cache from a failed fetch.
5. `SELECT call_count FROM marketaux_usage_log WHERE date=CURRENT_DATE` shows total daily calls within historical envelope (no runaway alias loop).

---

## Cross-track summary


| Step                           | Files                                                                                                    | Migration | Deploy           | Credits                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | --------- | ---------------- | ------------------------ |
| A1 verify                      | (curl only)                                                                                              | —         | —                | 0                        |
| A2 insert NSDL NSE row         | `supabase--insert`                                                                                       | none      | DB only          | 0                        |
| A2 (conditional) filter loosen | `supabase/functions/seed-stock-master/index.ts`                                                          | none      | edge fn redeploy | 0                        |
| B1 audit                       | (curl only)                                                                                              | —         | —                | ~30–50 Marketaux         |
| B2 alias map                   | `supabase/functions/_shared/marketaux-aliases.ts` (new), `supabase/functions/compute-sentiment/index.ts` | none      | edge fn redeploy | 0 build, neutral runtime |
| B3 cache purge                 | `supabase--insert` (DELETE)                                                                              | none      | DB only          | 0                        |


## Out of scope (unchanged deferrals)

- Scoring logic, weights, action buckets, RLS.
- Stock picker (still deferred until 5a/5b ship).
- UI/frontend polish, gray-state copy.
- Move 4b (banking carveout sign).
- L156 `limit=2 + find(NSE)` resolver hardening — deferred until a second dual-listed failure surfaces.
- `PROMOTION_RULES_ENABLED=false` — unchanged.
- RECENTLY_LISTED flag, returns strip, trade-plan diagnostic — these are Wave 5c.

**STOP — awaiting founder approval before BUILD.** 

Approve Wave 5b PLAN.

This is approved as a gated plan with evidence-first execution, not as a blanket build.

Execution rules:

1) Sub-track A:

- Run A1 verification first.

- If Dhan CSV truly has no NSE row for NSDL, do the one-shot NSDL NSE insert only.

- If Dhan CSV has an NSE row but our filter drops it, then loosen the seed-stock-master filter and do the one-shot backfill.

- Do NOT pull L156 resolver hardening into Wave 5b.

2) Sub-track B:

- Run B1 audit first.

- Only add aliases for symbols explicitly confirmed by the audit.

- Keep the alias list narrow and evidence-based.

- If NSDL is confirmed as genuinely unindexed/new-listing no-coverage, keep it in NO_COVERAGE_NEW_LISTING rather than forcing a fake alias.

Guardrails remain unchanged:

- no scoring changes

- no weights/buckets changes

- no RLS changes

- no UI/frontend changes

- no stock-picker work

- no PROMOTION_RULES_ENABLED change

After the audit/build proposal is finalized, return:

- exact files to change

- deploy surface

- whether A2 is insert-only or filter+backfill

- final alias list from B1

- verification checklist

STOP before any out-of-scope work.

&nbsp;