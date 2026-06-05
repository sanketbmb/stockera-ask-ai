// compute-sentiment
// Fifth Brain module. News-driven sentiment via Marketaux Basic tier.
//
// Budget discipline:
//   - 2,500 calls/day, 20 articles per call (Basic).
//   - sentiment_cache (TTL 6h normal, 24h low-volume) shields the budget.
//   - marketaux_usage_log tracks daily call_count; >2,300 → conservation mode.
//
// SEBI auditability: pure JS. No external NLP. Uses Marketaux per-entity
// sentiment_score (Composite of Tetlock 2007, Garcia 2013, Da-Engelberg-Gao 2011).

import {
  MARKETAUX_NO_COVERAGE,
  marketauxSymbolChain,
  marketauxEntityAliases,
} from "../_shared/marketaux-aliases.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// ───────────────── auditable constants ─────────────────
const MARKETAUX_DAILY_LIMIT = 2500;
const ALERT_THRESHOLD = 2000;
const CONSERVATION_THRESHOLD = 2300;
const ARTICLES_PER_CALL = 20;
const CACHE_TTL_HOURS = 6;
const LOW_VOLUME_TTL_HOURS = 24;
const LOW_VOLUME_THRESHOLD = 3;       // <3 articles → cache for 24h
const NEWS_WINDOW_DAYS = 30;
const POSITIVE_THRESHOLD = 0.15;
const NEGATIVE_THRESHOLD = -0.15;
const HALF_LIFE_HOURS = 168;           // 7-day decay half-life
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const FORMULA_VERSION = "1.0";
const SOURCE_ATTRIBUTION =
  "Composite of Tetlock 2007 (sentiment-returns), Garcia 2013 (volume-weighted), Da-Engelberg-Gao 2011 (attention).";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ───────────────── types ─────────────────
interface MarketauxEntity {
  symbol?: string;
  name?: string;
  sentiment_score?: number;
  match_score?: number;
}
interface Article {
  uuid?: string;
  title?: string;
  description?: string;
  snippet?: string;
  source?: string;
  url?: string;
  published_at?: string;
  entities?: MarketauxEntity[];
}
interface ScoredArticle {
  title: string;
  source: string;
  url: string;
  published_at: string;
  sentiment: number;
  ageHoursIST: number;
}

// ───────────────── IST helpers ─────────────────
function todayIST(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function ageHoursIST(publishedAtUTC: string, nowMs: number): number {
  const pubMs = new Date(publishedAtUTC).getTime();
  return Math.max(0, (nowMs - pubMs) / 3_600_000);
}

// ───────────────── Supabase REST (service role) ─────────────────
async function sbFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
}

async function loadCache(symbol: string): Promise<
  | { articles: Article[]; fetched_at: string; ttl_hours: number; symbol_format_used: string | null }
  | null
> {
  const res = await sbFetch(`sentiment_cache?symbol=eq.${encodeURIComponent(symbol)}&select=*`);
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function upsertCache(
  symbol: string,
  articles: Article[],
  symbolFormatUsed: string | null,
  ttlHours: number,
): Promise<void> {
  await sbFetch(`sentiment_cache?on_conflict=symbol`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      symbol,
      articles,
      fetched_at: new Date().toISOString(),
      ttl_hours: ttlHours,
      symbol_format_used: symbolFormatUsed,
    }),
  });
}

async function getUsageToday(): Promise<{ call_count: number; articles_returned: number }> {
  const date = todayIST();
  const res = await sbFetch(
    `marketaux_usage_log?date=eq.${date}&select=call_count,articles_returned`,
  );
  if (!res.ok) return { call_count: 0, articles_returned: 0 };
  const rows = await res.json();
  if (Array.isArray(rows) && rows.length) {
    return { call_count: rows[0].call_count ?? 0, articles_returned: rows[0].articles_returned ?? 0 };
  }
  // seed today's row so upsert path is consistent
  await sbFetch("marketaux_usage_log", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ date, call_count: 0, articles_returned: 0 }),
  });
  return { call_count: 0, articles_returned: 0 };
}

async function bumpUsage(deltaCalls: number, deltaArticles: number): Promise<void> {
  const date = todayIST();
  // Read-modify-write (single-row, low contention; SEBI-auditable).
  const cur = await getUsageToday();
  await sbFetch(`marketaux_usage_log?on_conflict=date`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      date,
      call_count: cur.call_count + deltaCalls,
      articles_returned: cur.articles_returned + deltaArticles,
      updated_at: new Date().toISOString(),
    }),
  });
}

// ───────────────── Marketaux fetch (direct upstream) ─────────────────
// MISSION 6.1A.1: Call Marketaux directly using MARKETAUX_API_TOKEN.
// The previous sibling-wrapper call (marketaux-fetch) required either a
// JWT gateway that rejected our service key (UNAUTHORIZED_INVALID_JWT_FORMAT)
// or a fully-public wrapper that any caller could hit to burn our quota.
// Direct call eliminates both risks: only this function (which itself
// requires auth at the orchestrator boundary) can spend Marketaux credits.
const MARKETAUX_BASE_URL = "https://api.marketaux.com/v1/news/all";

async function fetchMarketaux(symbols: string): Promise<Article[]> {
  const token = Deno.env.get("MARKETAUX_API_TOKEN");
  if (!token) {
    throw new Error("MARKETAUX_API_TOKEN not configured");
  }
  const publishedAfter = new Date(Date.now() - NEWS_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 19); // YYYY-MM-DDTHH:MM:SS
  const qs = new URLSearchParams({
    api_token: token,
    symbols,
    filter_entities: "true",
    limit: String(ARTICLES_PER_CALL),
    published_after: publishedAfter,
    language: "en",
  });
  const res = await fetch(`${MARKETAUX_BASE_URL}?${qs.toString()}`, { method: "GET" });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`marketaux ${res.status}: ${txt.slice(0, 300)}`);
  }
  const body = await res.json();
  const arr = body?.data;
  return Array.isArray(arr) ? (arr as Article[]) : [];
}

// ───────────────── metric helpers ─────────────────
function normalize(x: number, min: number, max: number): number {
  // map [min,max] → [0,100], clamp
  const t = (x - min) / (max - min);
  return Math.max(0, Math.min(100, t * 100));
}

function pickEntitySentiment(article: Article, sym: string): number | null {
  if (!article.entities || !article.entities.length) return null;
  const aliases = marketauxEntityAliases(sym).map((s) => s.toUpperCase());
  const candidates = article.entities.filter(
    (e) =>
      typeof e?.sentiment_score === "number" &&
      typeof e?.symbol === "string",
  );
  // Priority: exact alias match (in declared order: .NS, alias .BO, bare)
  for (const a of aliases) {
    const hit = candidates.find((e) => e.symbol!.toUpperCase() === a);
    if (hit) return hit.sentiment_score!;
  }
  // Fallback: any symbol that starts with `${sym}.` (catches other listings)
  const upper = sym.toUpperCase();
  const startsWith = candidates.find((e) => e.symbol!.toUpperCase().startsWith(`${upper}.`));
  if (startsWith) return startsWith.sentiment_score!;
  return null;
}

function classify(score: number | null, total30d: number): string {
  if (total30d === 0) return "NO_NEWS";
  if (score === null) return "NO_NEWS";
  if (score >= 75) return "STRONG_POSITIVE";
  if (score >= 60) return "POSITIVE";
  if (score >= 40) return "NEUTRAL";
  if (score >= 25) return "NEGATIVE";
  return "STRONG_NEGATIVE";
}

// ───────────────── core compute ─────────────────
interface ComputeResult {
  counts: Record<string, { positive: number; negative: number; neutral: number; total: number }>;
  weighted_sentiment: number | null;
  velocity: {
    articles_last_24h: number;
    avg_per_24h_over_7d: number;
    velocity_ratio: number;
    flag: "ACCELERATING" | "DECELERATING" | "NORMAL";
  };
  diversity: { unique_sources_7d: number; flag: "DIVERSE" | "ECHO_CHAMBER" };
  top_articles: Array<{ title: string; source: string; sentiment: number; published_at: string; url: string }>;
  sentiment_score: number | null;
  net_positive_ratio_7d: number;
}

function computeFromArticles(articles: Article[], symbol: string): ComputeResult {
  const nowMs = Date.now();
  const scored: ScoredArticle[] = [];
  for (const a of articles) {
    if (!a.published_at) continue;
    const s = pickEntitySentiment(a, symbol);
    if (s === null) continue;
    scored.push({
      title: a.title ?? "",
      source: a.source ?? "",
      url: a.url ?? "",
      published_at: a.published_at,
      sentiment: s,
      ageHoursIST: ageHoursIST(a.published_at, nowMs),
    });
  }

  const inWindow = (hours: number) => scored.filter((s) => s.ageHoursIST <= hours);
  const bucket = (arr: ScoredArticle[]) => {
    let pos = 0, neg = 0, neu = 0;
    for (const s of arr) {
      if (s.sentiment > POSITIVE_THRESHOLD) pos++;
      else if (s.sentiment < NEGATIVE_THRESHOLD) neg++;
      else neu++;
    }
    return { positive: pos, negative: neg, neutral: neu, total: arr.length };
  };

  const w24 = inWindow(24);
  const w7d = inWindow(7 * 24);
  const w30d = inWindow(30 * 24);

  const counts = { "24h": bucket(w24), "7d": bucket(w7d), "30d": bucket(w30d) };

  // weighted sentiment over 30d window
  let weighted: number | null = null;
  if (w30d.length > 0) {
    let num = 0, den = 0;
    for (const s of w30d) {
      const w = Math.exp(-s.ageHoursIST / HALF_LIFE_HOURS);
      num += s.sentiment * w;
      den += w;
    }
    weighted = den > 0 ? num / den : null;
  }

  // velocity
  const articles_last_24h = w24.length;
  const articles_7d_excluding_last_24h = scored.filter(
    (s) => s.ageHoursIST > 24 && s.ageHoursIST <= 7 * 24,
  ).length;
  const avg_per_24h_over_7d = articles_7d_excluding_last_24h / 6; // 6 prior days
  const velocity_ratio = articles_last_24h / Math.max(avg_per_24h_over_7d, 0.5);
  const velocityFlag: "ACCELERATING" | "DECELERATING" | "NORMAL" =
    velocity_ratio > 2.5 ? "ACCELERATING" : velocity_ratio < 0.4 ? "DECELERATING" : "NORMAL";

  // diversity
  const unique_sources_7d = new Set(w7d.map((s) => s.source).filter(Boolean)).size;
  const diversityFlag: "DIVERSE" | "ECHO_CHAMBER" =
    w7d.length >= 5 && unique_sources_7d <= 2 ? "ECHO_CHAMBER" : "DIVERSE";

  // net positive ratio 7d  = (pos - neg) / total, range [-1,+1]
  const c7 = counts["7d"];
  const net_positive_ratio_7d = c7.total > 0 ? (c7.positive - c7.negative) / c7.total : 0;

  // sentiment score
  let sentiment_score: number | null = null;
  if (counts["30d"].total > 0 && weighted !== null) {
    const velocityBonus =
      velocityFlag === "ACCELERATING" && weighted > 0
        ? 70
        : velocityFlag === "ACCELERATING" && weighted < 0
          ? 30
          : 50;
    const diversityBonus = diversityFlag === "DIVERSE" ? 70 : 30;
    const s =
      0.50 * normalize(weighted, -0.5, 0.5) +
      0.20 * normalize(net_positive_ratio_7d, -1, 1) +
      0.15 * velocityBonus +
      0.15 * diversityBonus;
    sentiment_score = Math.round(Math.max(0, Math.min(100, s)));
  }

  // top articles: order by |sentiment| × recency (1 / (1 + age/24))
  const top_articles = [...scored]
    .sort((a, b) => {
      const sa = Math.abs(a.sentiment) / (1 + a.ageHoursIST / 24);
      const sb = Math.abs(b.sentiment) / (1 + b.ageHoursIST / 24);
      return sb - sa;
    })
    .slice(0, 3)
    .map((s) => ({
      title: s.title,
      source: s.source,
      sentiment: Number(s.sentiment.toFixed(4)),
      published_at: s.published_at,
      url: s.url,
    }));

  return {
    counts,
    weighted_sentiment: weighted === null ? null : Number(weighted.toFixed(4)),
    velocity: {
      articles_last_24h,
      avg_per_24h_over_7d: Number(avg_per_24h_over_7d.toFixed(3)),
      velocity_ratio: Number(velocity_ratio.toFixed(3)),
      flag: velocityFlag,
    },
    diversity: { unique_sources_7d, flag: diversityFlag },
    top_articles,
    sentiment_score,
    net_positive_ratio_7d: Number(net_positive_ratio_7d.toFixed(4)),
  };
}

// ───────────────── handler ─────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    // callerAuth intentionally not used — see fetchMarketaux() note (Mission 6.1A).
    void req.headers.get("authorization");
    const body = await req.json().catch(() => ({}));
    const rawSymbol = String(body?.symbol ?? "").trim().toUpperCase();
    if (!rawSymbol) return json({ success: false, error: "symbol required" }, 400);
    const symbol = rawSymbol.replace(/\.NS$/i, ""); // canonical bare form

    // 1. usage / conservation check
    const usageBefore = await getUsageToday();
    const conservationMode = usageBefore.call_count > CONSERVATION_THRESHOLD;
    const alert = usageBefore.call_count > ALERT_THRESHOLD;

    // 2. cache lookup
    const cached = await loadCache(symbol);
    const cacheFreshMs = cached
      ? new Date(cached.fetched_at).getTime() + cached.ttl_hours * 3_600_000
      : 0;
    const cacheIsFresh = cached !== null && cacheFreshMs > Date.now();

    let articles: Article[] | null = null;
    let cache_hit = false;
    let cache_age_hours: number | null = null;
    let symbol_format_used: string | null = cached?.symbol_format_used ?? null;
    let warning: string | null = null;
    let callsThisRequest = 0;
    let articlesThisRequest = 0;

    if (cacheIsFresh) {
      articles = cached!.articles ?? [];
      cache_hit = true;
      cache_age_hours = Number(
        ((Date.now() - new Date(cached!.fetched_at).getTime()) / 3_600_000).toFixed(2),
      );
    } else if (conservationMode && cached) {
      articles = cached.articles ?? [];
      cache_hit = true;
      cache_age_hours = Number(
        ((Date.now() - new Date(cached.fetched_at).getTime()) / 3_600_000).toFixed(2),
      );
      warning = "DAILY_BUDGET_CONSERVATION_MODE";
    } else if (conservationMode && !cached) {
      // No cache, no budget — empty
      articles = [];
      warning = "DAILY_BUDGET_CONSERVATION_MODE";
    } else if (MARKETAUX_NO_COVERAGE.has(symbol.toUpperCase())) {
      // Wave 5b: symbols with confirmed zero upstream coverage skip the fetch
      // chain entirely. Cache an empty result with normal TTL so we do not
      // re-probe daily, and surface the explicit classification downstream.
      articles = [];
      symbol_format_used = "NO_COVERAGE_NEW_LISTING";
      warning = "NO_COVERAGE_NEW_LISTING";
      await upsertCache(symbol, [], symbol_format_used, LOW_VOLUME_TTL_HOURS);
    } else {
      // Cache miss path → call Marketaux through the alias chain.
      // Order: .NS first, then any declared aliases (e.g. .BO), then bare.
      const chain = marketauxSymbolChain(symbol);
      const formatsTried: string[] = [];
      let fetched: Article[] = [];

      try {
        for (const fmt of chain) {
          formatsTried.push(fmt);
          const res = await fetchMarketaux(fmt);
          callsThisRequest += 1;
          articlesThisRequest += res.length;
          if (res.length > 0) {
            fetched = res;
            symbol_format_used = fmt;
            break;
          }
          // Remember the first format we tried so cache row is non-null.
          if (symbol_format_used === null) symbol_format_used = fmt;
        }
      } catch (e) {
        console.error(`[compute-sentiment] fetch failed for ${symbol}:`, e);
        warning = "MARKETAUX_FETCH_ERROR";
      }

      articles = fetched;
      // MISSION 6.1A: only persist a cache row when the fetch actually
      // succeeded. Cache poisoning (24h empty rows from failed fetches)
      // was the dominant cause of NULL sentiment across all recent reports.
      if (!warning) {
        const ttl = fetched.length < LOW_VOLUME_THRESHOLD ? LOW_VOLUME_TTL_HOURS : CACHE_TTL_HOURS;
        await upsertCache(symbol, fetched, symbol_format_used ?? formatsTried[0], ttl);
      }

      if (callsThisRequest > 0) {
        await bumpUsage(callsThisRequest, articlesThisRequest);
      }
    }

    const compute = computeFromArticles(articles ?? [], symbol);
    const classification =
      warning === "NO_COVERAGE_NEW_LISTING"
        ? "NO_COVERAGE_NEW_LISTING"
        : articles && articles.length === 0 && !cache_hit && !warning
        ? "SYMBOL_UNRECOGNIZED"
        : classify(compute.sentiment_score, compute.counts["30d"].total);

    // Re-read usage so output reflects post-call state
    const usageAfter = await getUsageToday();

    return json({
      success: true,
      symbol,
      as_of_date: todayIST(),
      counts: compute.counts,
      weighted_sentiment: compute.weighted_sentiment,
      velocity: compute.velocity,
      diversity: compute.diversity,
      top_articles: compute.top_articles,
      sentiment_score: classification === "SYMBOL_UNRECOGNIZED" ? null : compute.sentiment_score,
      classification,
      data_quality: {
        cache_hit,
        cache_age_hours,
        marketaux_calls_today: usageAfter.call_count,
        budget_remaining: Math.max(0, MARKETAUX_DAILY_LIMIT - usageAfter.call_count),
        budget_alert: alert,
        symbol_format_used,
        articles_in_window: articles?.length ?? 0,
        articles_with_entity_match: (() => {
          let n = 0;
          for (const a of articles ?? []) if (pickEntitySentiment(a, symbol) !== null) n++;
          return n;
        })(),
        warning,
      },
      metadata: {
        computed_at: new Date().toISOString(),
        source: SOURCE_ATTRIBUTION,
        formula_version: FORMULA_VERSION,
        window_days: NEWS_WINDOW_DAYS,
        half_life_hours: HALF_LIFE_HOURS,
      },
    });
  } catch (e) {
    console.error("[compute-sentiment] fatal:", e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
