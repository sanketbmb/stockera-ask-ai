## Task 2.5 — compute-sentiment

Build the 5th and final Brain scoring module. News-driven sentiment via Marketaux Basic tier, with hard caching to protect the 2,500/day budget.

### Scope (single commit)

1. **DB migration** — `sentiment_cache` + `marketaux_usage_log`
2. **Edge Function** — `supabase/functions/compute-sentiment/index.ts`
3. **Wrapper cleanup** — drop `news/by-symbol` from `ALLOWED_ENDPOINTS` in `marketaux-fetch/index.ts`
4. **Validation run** — TCS, INFY, HDFCBANK, ICICIBANK, RELIANCE + TCS re-run cache check

### Migration

```sql
CREATE TABLE public.sentiment_cache (
  symbol TEXT PRIMARY KEY,
  articles JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ttl_hours INT NOT NULL DEFAULT 6,
  symbol_format_used TEXT
);
-- GRANTs: service_role only (Edge Function writes via service key, no client access)
GRANT ALL ON public.sentiment_cache TO service_role;
ALTER TABLE public.sentiment_cache ENABLE ROW LEVEL SECURITY;
-- no policies → locked to service_role

CREATE TABLE public.marketaux_usage_log (
  date DATE PRIMARY KEY,
  call_count INT NOT NULL DEFAULT 0,
  articles_returned INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketaux_usage_log TO service_role;
ALTER TABLE public.marketaux_usage_log ENABLE ROW LEVEL SECURITY;
```

Both tables are server-only (Edge Function uses service role). No anon/authenticated grants — clients never read these directly.

### Edge Function flow

```text
POST { symbol: "TCS" }
  │
  ├─ 1. Load today's marketaux_usage_log row (upsert if missing)
  │     if call_count > 2300 → conservation mode
  │
  ├─ 2. Read sentiment_cache[symbol]
  │     if fetched_at + ttl_hours > now() → use cached articles (cache_hit=true)
  │     if conservation mode AND cached → use cached even if stale
  │
  ├─ 3. Cache miss path:
  │     a. Call marketaux-fetch (endpoint=news/all, symbols=<SYM>.NS, limit=20,
  │        published_after = now()-30d)
  │     b. If 0 articles → retry with bare <SYM>
  │     c. Increment usage log (call_count, articles_returned)
  │     d. Upsert cache with symbol_format_used + ttl
  │        (ttl_hours = 24 if total < 3 articles, else 6)
  │     e. If still 0 → cache empty 24h, classification SYMBOL_UNRECOGNIZED
  │
  ├─ 4. For each article, extract sentiment for target symbol:
  │     entity = entities.find(e => e.symbol matches <SYM>.NS OR <SYM>)
  │     sentiment = entity?.sentiment_score (fallback skip if missing)
  │     age_hours = (nowIST - publishedAtIST) / 3600s
  │
  ├─ 5. Compute metrics (pure JS, IST-windowed):
  │     - counts.{24h,7d,30d}.{positive,negative,neutral,total}
  │     - weighted_sentiment = Σ(s · exp(-h/168)) / Σ exp(-h/168)
  │     - velocity {articles_last_24h, avg_per_24h_over_7d, ratio, flag}
  │     - diversity {unique_sources_7d, flag}
  │     - sentiment_score = 0.5·norm(w,-0.5,+0.5) + 0.2·norm(net_pos_7d,-1,+1)
  │                       + 0.15·velocity_bonus + 0.15·diversity_bonus
  │     - classification per thresholds; NO_NEWS override if total_30d == 0
  │
  └─ 6. Return output schema (counts, weighted_sentiment, velocity,
        diversity, top 3 articles by |sentiment|·recency, score,
        classification, data_quality, metadata)
```

### Key implementation details

- **IST conversion**: same helper used in compute-risk — `new Date(utc).getTime() + 5.5*3600*1000` then build windows from IST midnight.
- **Entity match**: iterate `article.entities`, pick the one whose `symbol` equals `<SYM>.NS` first, else `<SYM>`, else any with same `name` prefix. If none, skip the article for scoring but still count it.
- **Cache writes**: store the full Marketaux article array (already includes per-entity sentiment) — keeps re-scoring cheap and auditable.
- **Usage log**: single-row-per-date upsert with atomic increment via `INSERT … ON CONFLICT DO UPDATE SET call_count = call_count + EXCLUDED.call_count`.
- **No external NLP** — Marketaux `entities[].sentiment_score` is the only sentiment source.
- **Failure modes as outputs** (HTTP 200): `NO_NEWS`, `SYMBOL_UNRECOGNIZED`, `DAILY_BUDGET_CONSERVATION_MODE` warning.

### marketaux-fetch cleanup

Single-line change in `ALLOWED_ENDPOINTS`:
```ts
const ALLOWED_ENDPOINTS = new Set(["news/all"]);
```
Header comment updated to drop `news/by-symbol` reference. Redeploy.

### Validation

Curl `compute-sentiment` for TCS, INFY, HDFCBANK, ICICIBANK, RELIANCE (one each), then TCS again to confirm cache hit. Report:

| symbol | total_7d | weighted_sentiment | velocity_flag | diversity_flag | symbol_format | score | classification |

Plus footer: `marketaux_calls_today` (target ≤ 5), TCS re-run `cache_hit=true`, any NO_NEWS for large caps flagged.

### Out of scope

- No UI
- No other compute-* module edits
- No pre-population of 600-stock cache
- No Twitter/Reddit
- No external NLP libs

### Open questions

None — symbol format strategy, endpoint, budget thresholds, scoring weights, and validation set are all fully specified in your brief. Proceeding on green light.
