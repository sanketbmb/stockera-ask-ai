# Stop-gate plan — LTP cron + reader hotfix (final)

**Scope locked to 2 files. No DB migration. No UI changes. No scoring/zone changes.**

- `supabase/functions/sync-ltp-dhan/index.ts`
- `supabase/functions/stock-recommendation-query/index.ts`

`ltp_cache` PK confirmed in prod as `(symbol, exchange)`. `stock_master` confirmed to carry duplicate `EQ` + `NSE_EQ` / `BSE_EQ` rows per symbol; this fix uses canonical only.

---

## A. Canonical + paginated stock_master read (writer)

**Before** (`sync-ltp-dhan/index.ts`):

```ts
const { data: masters, error: mErr } = await supabase
  .from("stock_master")
  .select("symbol, exchange, segment, dhan_security_id")
  .in("symbol", symbols)
  .in("exchange", ["NSE", "BSE"]);
if (mErr) return json({ ok: false, error: mErr.message }, 500);

const idMap = new Map<string, { NSE?: string; BSE?: string }>();
for (const m of masters ?? []) {
  const sym = m.symbol as string;
  const ex  = m.exchange as string;
  const seg = (m.segment as string) ?? "";
  const id  = String(m.dhan_security_id);
  const cur = idMap.get(sym) ?? {};
  if (ex === "NSE" && (seg === "NSE_EQ" || cur.NSE == null)) cur.NSE = id;
  if (ex === "BSE" && (seg === "BSE_EQ" || cur.BSE == null)) cur.BSE = id;
  idMap.set(sym, cur);
}
```

**After**:

```ts
// Canonical-only read, chunked to defeat the silent PostgREST 1000-row cap.
// ~500 symbols × 2 canonical rows = ~1000 total; chunks of 200 symbols
// return ≤400 rows each (well under the cap).
const MASTER_CHUNK = 200;
const idMap = new Map<string, { NSE?: string; BSE?: string }>();
for (let i = 0; i < symbols.length; i += MASTER_CHUNK) {
  const slice = symbols.slice(i, i + MASTER_CHUNK);
  const { data: masters, error: mErr } = await supabase
    .from("stock_master")
    .select("symbol, exchange, segment, dhan_security_id")
    .in("symbol", slice)
    .in("segment", ["NSE_EQ", "BSE_EQ"])              // canonical only
    .not("dhan_security_id", "is", null);
  if (mErr) return json({ ok: false, error: mErr.message }, 500);
  for (const m of masters ?? []) {
    const sym = m.symbol as string;
    const seg = m.segment as string;
    const id  = String(m.dhan_security_id);
    const cur = idMap.get(sym) ?? {};
    if (seg === "NSE_EQ") cur.NSE = id;
    else if (seg === "BSE_EQ") cur.BSE = id;
    idMap.set(sym, cur);
  }
}
```

Eliminates the alphabetical-tail truncation that produced prod's `NSE id=n/a`.

---

## B. One Dhan call per symbol — NSE-first, BSE-fallback (writer)

**Decision rule (writer):**
1. If `idMap[sym].NSE` exists → call Dhan with `NSE_EQ` and write `(sym, 'NSE')` to `ltp_cache`. **Do not also call BSE.**
2. Else if `idMap[sym].BSE` exists → call Dhan with `BSE_EQ` and write `(sym, 'BSE')`.
3. Else → log `missing_id`, no call.

This yields ~500 Dhan calls per full run (one per symbol). BSE-only names are still processed (path 2). No symbol is dropped from the universe.

**Before**:

```ts
for (const sym of symbols) {
  const ids = idMap.get(sym);
  if (!ids || (!ids.NSE && !ids.BSE)) {
    errors.push({ symbol: sym, reason: "no_dhan_security_id_in_stock_master" });
    attempts.push({ symbol: sym, exchange: null, dhan_security_id_used: null, ltp_or_null: null, source: "dhan" });
    continue;
  }
  let ltp: number | null = null;
  let exUsed: "NSE" | "BSE" | null = null;
  let idUsed: string | null = null;
  if (ids.NSE) { idUsed = ids.NSE; exUsed = "NSE"; ltp = await fetchDhanLtp(ids.NSE, "NSE_EQ"); }
  if (ltp == null && ids.BSE) { idUsed = ids.BSE; exUsed = "BSE"; ltp = await fetchDhanLtp(ids.BSE, "BSE_EQ"); }
  /* ...upsert with onConflict:"symbol"... */
}
```

**After** (one call per symbol; chosen exchange decided by `idMap` only):

```ts
for (const sym of symbols) {
  counters.symbols_seen++;
  const ids = idMap.get(sym);
  let exUsed: "NSE" | "BSE" | null = null;
  let idUsed: string | null = null;
  let seg: "NSE_EQ" | "BSE_EQ" | null = null;

  if (ids?.NSE)      { exUsed = "NSE"; idUsed = ids.NSE; seg = "NSE_EQ"; counters.nse_selected_count++; }
  else if (ids?.BSE) { exUsed = "BSE"; idUsed = ids.BSE; seg = "BSE_EQ"; counters.bse_selected_count++; }

  if (!exUsed || !idUsed || !seg) {
    counters.missing_id_count++;
    errors.push({ symbol: sym, reason: "no_canonical_dhan_security_id" });
    attempts.push({ symbol: sym, exchange: null, dhan_security_id_used: null, ltp_or_null: null, source: "dhan" });
    continue;
  }

  counters.attempted_count++;
  const r = await fetchLtpWithRetry(idUsed, seg);
  attempts.push({ symbol: sym, exchange: exUsed, dhan_security_id_used: idUsed, ltp_or_null: r.kind === "ok" ? r.ltp : null, source: "dhan", kind: r.kind });

  if (r.kind !== "ok") {
    if (r.kind === "auth_error")    counters.auth_error_count++;
    if (r.kind === "rate_limited")  counters.rate_limited_count++;
    if (r.kind === "dhan_null")     counters.dhan_null_count++;
    if (r.kind === "fetch_error")   counters.fetch_error_count++;
    errors.push({ symbol: sym, reason: `${r.kind}${seg ? ` (${seg} id=${idUsed})` : ""}` });
    if (counters.auth_error_count >= 3) { /* systemic auth — see Section E */ break; }
    continue;
  }

  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("ltp_cache")
    .upsert(
      { symbol: sym, exchange: exUsed, ltp: r.ltp, as_of: nowIso, source: "dhan", fetched_at: nowIso, updated_at: nowIso },
      { onConflict: "symbol,exchange" },                 // ← Section C
    );
  if (upErr) { errors.push({ symbol: sym, reason: `upsert_failed: ${upErr.message}` }); continue; }
  updated++; counters.updated_count++;
}
```

---

## C. Correct upsert key

**Before:** `{ onConflict: "symbol" }` (mismatch with PK).
**After:** `{ onConflict: "symbol,exchange" }` (matches confirmed prod PK; no migration).

---

## D. Failure classification + Retry-After + telemetry (writer)

**Before** — `fetchDhanLtp` collapses everything to `null`:

```ts
async function fetchDhanLtp(securityId: string, segment: string): Promise<number | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/dhan-fetch`, { /* ... */ });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try { body = text ? JSON.parse(text) : {}; } catch {}
    if (!res.ok || body.success !== true) return null;        // ← swallows 401/429/empty/5xx
    /* ...parse ltp... */
    return typeof ltp === "number" && ltp > 0 ? ltp : null;
  } catch { return null; }
}
```

**After** — discriminated result + one-shot retry honouring `Retry-After`:

```ts
type DhanFetchResult =
  | { kind: "ok"; ltp: number }
  | { kind: "dhan_null" }                  // HTTP 200 + DHAN_EMPTY_QUOTE / malformed
  | { kind: "auth_error" }                 // 401 / 403
  | { kind: "rate_limited"; retryAfterMs: number }   // 429
  | { kind: "fetch_error"; message: string };        // network / JSON / 5xx

async function fetchDhanLtp(securityId: string, segment: string): Promise<DhanFetchResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/dhan-fetch`, {
      method: "POST",
      headers: { "Content-Type":"application/json", apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ endpoint:"ltp", securityId, exchangeSegment: segment }),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try { body = text ? JSON.parse(text) : {}; } catch { return { kind:"fetch_error", message:"non_json_response" }; }

    if (res.status === 401 || res.status === 403) return { kind:"auth_error" };
    if (res.status === 429) {
      const raHeader = res.headers.get("Retry-After");
      const ra = Number(raHeader ?? body?.retry_after ?? 1);
      const retryAfterMs = Math.min(Math.max(500, (Number.isFinite(ra) ? ra : 1) * 1000), 5000);
      return { kind:"rate_limited", retryAfterMs };
    }
    if (res.status >= 500) return { kind:"fetch_error", message:`http_${res.status}` };
    if (!res.ok)           return { kind:"fetch_error", message:`http_${res.status}` };

    if (body.success !== true) return { kind:"dhan_null" };   // includes DHAN_EMPTY_QUOTE
    const data  = body.data  as Record<string, unknown> | undefined;
    const inner = data?.data as Record<string, unknown> | undefined;
    const seg   = inner?.[segment] as Record<string, unknown> | undefined;
    const node  = seg?.[securityId] as Record<string, unknown> | undefined;
    const ltp   = node?.last_price ?? node?.ltp ?? node?.lastPrice;
    return typeof ltp === "number" && ltp > 0 ? { kind:"ok", ltp } : { kind:"dhan_null" };
  } catch (e) {
    return { kind:"fetch_error", message: String(e) };
  }
}

async function fetchLtpWithRetry(id: string, seg: "NSE_EQ"|"BSE_EQ"): Promise<DhanFetchResult> {
  const r1 = await fetchDhanLtp(id, seg);
  if (r1.kind === "rate_limited") {
    await new Promise((r) => setTimeout(r, r1.retryAfterMs));
    return fetchDhanLtp(id, seg);
  }
  return r1;
}
```

**Counters block** (declared next to `let updated = 0;`):

```ts
const counters = {
  symbols_seen: 0,
  attempted_count: 0,
  updated_count: 0,
  auth_error_count: 0,
  rate_limited_count: 0,
  dhan_null_count: 0,
  fetch_error_count: 0,
  missing_id_count: 0,
  nse_selected_count: 0,
  bse_selected_count: 0,
  chunk_count: 0,
};
```

Telemetry call:

```ts
await logTelemetry({
  status: counters.auth_error_count >= 3 ? "error"
        : (errors.length === 0 ? "ok" : (updated === 0 ? "error" : "partial")),
  processed: updated,
  errors_count: errors.length,
  details: { filter_applied: filterSymbols != null, counters, errors_sample: errors.slice(0, 10) },
});
```

The `last_sync_ltp_dhan` row in `stock_picker_runtime_config` likewise embeds `counters` in `config_value`.

---

## E. Chunking / throttle + runtime math (writer)

**Constraints**
- Supabase Edge Function wall-clock budget for this project: 150 s (per Deno deploy default; we treat 120 s as safe upper bound).
- Manual `POST { symbols: [...] }` ≤ 10 must stay inline (no chunk pauses).
- Goal: ~500 calls per full run, NSE-or-BSE single-leg.

**Chosen parameters**

| Parameter | Value |
|---|---|
| `FULL_RUN_CHUNK` | 50 symbols |
| `INTRA_CHUNK_PAUSE_MS` | 0 (sequential `await`, no extra pause) |
| `INTER_CHUNK_PAUSE_MS` | 800 ms |
| Retry budget | one 429 retry, ≤ 5000 ms wait |
| Abort | break loop if `auth_error_count >= 3` |

**Runtime math (500 symbols)**

- Per call: ~180 ms typical Dhan round-trip through the wrapper.
- 500 × 180 ms = **90 s** of fetch time.
- Inter-chunk: `(500 / 50 − 1) × 800 ms` = 9 × 800 = **7.2 s**.
- Telemetry + stock_master pagination (3 chunks): **<1 s**.
- Worst-case 429 retries (assume ≤ 5 in a healthy run): ≤ **5 s**.
- **Estimated total: ~103 s**, comfortably inside the 120 s safe bound.

If Dhan latency degrades (≥ 240 ms p50) total approaches 130 s — still fits 150 s, but the fallback is documented:

> If the cron job consistently exceeds 120 s in prod, reduce `FULL_RUN_CHUNK` to 25 and double cron frequency. No code change required beyond this constant.

**Code shape**

```ts
const FULL_RUN_CHUNK       = 50;
const INTER_CHUNK_PAUSE_MS = 800;
const INTRA_CHUNK_PAUSE_MS = 0;

const chunkSize = filterSymbols ? symbols.length : FULL_RUN_CHUNK;  // inline manual runs skip chunking

outer: for (let i = 0; i < symbols.length; i += chunkSize) {
  counters.chunk_count++;
  const chunk = symbols.slice(i, i + chunkSize);
  for (const sym of chunk) {
    // ...per-symbol block from Section B...
    if (counters.auth_error_count >= 3) break outer;     // systemic auth
    if (INTRA_CHUNK_PAUSE_MS) await new Promise((r) => setTimeout(r, INTRA_CHUNK_PAUSE_MS));
  }
  if (i + chunkSize < symbols.length) {
    await new Promise((r) => setTimeout(r, INTER_CHUNK_PAUSE_MS));
  }
}
```

---

## F. Exchange-aware `ltp_cache` read (reader)

**Before** (`stock-recommendation-query/index.ts`, ~L609-630) — symbol-only map; one row silently overwrites another:

```ts
const { data: ltpRows } = await supabase
  .from("ltp_cache")
  .select("symbol, ltp, fetched_at, as_of, source")
  .in("symbol", filteredSymbols);
const ltpBySymbol = new Map<string, { ltp: number; fetched_at: string; source: string | null }>();
const ltpFreshSet = new Set<string>();
for (const r of ltpRows ?? []) {
  const v = Number(r.ltp);
  if (!Number.isFinite(v) || v <= 0) continue;
  const ts = (r.as_of as string | null) ?? (r.fetched_at as string | null);
  if (!ts) continue;
  const sym = r.symbol as string;
  ltpBySymbol.set(sym, { ltp: v, fetched_at: ts, source: (r.source as string | null) ?? null }); // overwrite bug
  const ageSec = (nowMs - new Date(ts).getTime()) / 1000;
  if (Number.isFinite(ageSec) && ageSec >= 0 && ageSec <= ltpTtlSec) ltpFreshSet.add(sym);
}
```

**After** — collect BOTH legs per symbol, then pick one with a deterministic rule (Section G):

```ts
const { data: ltpRows } = await supabase
  .from("ltp_cache")
  .select("symbol, exchange, ltp, fetched_at, as_of, source")
  .in("symbol", filteredSymbols)
  .in("exchange", ["NSE", "BSE"]);

// 1) collect candidates per symbol, never overwrite
type LtpCand = { ltp: number; ts: string; tsMs: number; source: string | null; exchange: "NSE"|"BSE" };
const ltpCands = new Map<string, LtpCand[]>();
for (const r of ltpRows ?? []) {
  const v = Number(r.ltp);
  if (!Number.isFinite(v) || v <= 0) continue;
  const ts = (r.as_of as string | null) ?? (r.fetched_at as string | null);
  if (!ts) continue;
  const tsMs = new Date(ts).getTime();
  if (!Number.isFinite(tsMs)) continue;
  const ex = r.exchange as "NSE"|"BSE";
  if (ex !== "NSE" && ex !== "BSE") continue;
  const sym = r.symbol as string;
  const arr = ltpCands.get(sym) ?? [];
  arr.push({ ltp: v, ts, tsMs, source: (r.source as string|null) ?? null, exchange: ex });
  ltpCands.set(sym, arr);
}

// 2) pick the row for the single displayed card (Section G rule)
const ltpBySymbol = new Map<string, { ltp: number; fetched_at: string; source: string | null; exchange: "NSE"|"BSE" }>();
const ltpFreshSet = new Set<string>();
for (const [sym, arr] of ltpCands) {
  const picked = pickLtpRow(arr);                 // ← deterministic, see Section G
  if (!picked) continue;
  ltpBySymbol.set(sym, { ltp: picked.ltp, fetched_at: picked.ts, source: picked.source, exchange: picked.exchange });
  const ageSec = (nowMs - picked.tsMs) / 1000;
  if (Number.isFinite(ageSec) && ageSec >= 0 && ageSec <= ltpTtlSec) ltpFreshSet.add(sym);
}
```

`ltpBySymbol.get(sym)` shape is **additive** (`exchange` added). All existing downstream readers consume `.ltp` / `.fetched_at` / `.source` and remain unchanged. Technicals/zones already key off this same `ltp`, so the CMP they use is exactly the chosen row.

---

## G. Deterministic row-selection rule (reader)

Given candidate rows for one symbol, pick **one** for the single card:

```ts
const STALE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;   // "much fresher" threshold

function pickLtpRow(cands: LtpCand[]): LtpCand | null {
  if (cands.length === 0) return null;
  if (cands.length === 1) return cands[0];

  // Both NSE and BSE rows exist for this symbol.
  const nse = cands.find((c) => c.exchange === "NSE");
  const bse = cands.find((c) => c.exchange === "BSE");
  if (nse && !bse) return nse;
  if (bse && !nse) return bse;

  // Both present. Prefer NSE unless BSE is materially fresher than NSE
  // (writer is NSE-first, so the BSE row is necessarily older or unrelated
  // historical data unless NSE has gone stale).
  if (bse!.tsMs - nse!.tsMs > STALE_DAYS_MS) return bse!;
  return nse!;
}
```

**Why this rule is correct for the new writer:**
- Writer makes **one** call per symbol per run, NSE-first. So in steady state only one row per symbol gets refreshed each run.
- A BSE row coexisting with an NSE row in cache after this fix lands means the BSE row is **historical** (written before the change) or was written on a run where NSE failed.
- The 3-day "much fresher" threshold means: if the NSE row is current, NSE wins; if NSE has gone genuinely stale (≥ 3 days older than BSE), BSE wins. This prevents the reported "frozen 5–10 days" symptom from surviving once even one successful sync runs.
- BSE-only symbols (no `idMap.NSE`) only ever produce BSE rows → always picked.

---

## How the requested failure modes are eliminated

| Symptom | Fix |
|---|---|
| `NSE id=n/a` in prod | Section A — paginated canonical read prevents 1000-row cap truncation. |
| `processed:0`, `errors_count:500` | Sections A + D — IDs now resolve; explicit classification stops collapsing everything to one bucket. |
| Stale rows 5–10 days old surviving | Sections B + C + G — successful writer now actually persists (PK match); reader picks the fresher leg when NSE goes stale. |
| Symbol-only overwrite in reader | Section F — composite candidate map; never overwrites silently. |
| Symbols dropped from universe | Section B path 2 — BSE-only names still attempted and written. |
| Auth/rate-limit storms invisible | Section D + E — counters surfaced in telemetry; abort on systemic auth. |

---

## Strict constraints — confirmation

- ✅ Only files changed: `supabase/functions/sync-ltp-dhan/index.ts` and `supabase/functions/stock-recommendation-query/index.ts`.
- ✅ No DB migration. `ltp_cache` PK `(symbol, exchange)` already matches the new `onConflict`.
- ✅ No new tables / columns / indexes / RLS / secrets / scheduled jobs.
- ✅ No scoring changes. No zone formula changes. No UI changes. No history-math changes (technicals/zones continue to consume the same `ltp` field, now from the correctly-selected row).
- ✅ `dhan-fetch/index.ts` untouched — already classifies 401/429/empty correctly; only the caller was collapsing them.

## STOP

Awaiting approval before any file edits or deploys.
