// supabase/functions/_shared/marketaux-claude-tool.ts
// Stage 2.3 — Marketaux adapter exposed as an Anthropic-style tool.
// Wraps /functions/v1/marketaux-fetch; normalizes payload into a compact
// article shape that Claude tool_use can consume and that the UI can render
// as citation chips.

export type MarketauxClaudeArgs = {
  symbols?: string[];
  industry_tags?: string[];
  days_back?: number;
  limit?: number;
  language?: string;
};

export type MarketauxArticle = {
  title: string;
  url: string;
  source: string;
  published_at: string;
  summary: string;
};

export type MarketauxClaudeResult = {
  ok: boolean;
  articles: MarketauxArticle[];
  total: number;
  error_code?: string;
  error_message?: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MAX_ARTICLES = 12;
const MAX_SUMMARY_LEN = 240;

function stripHtml(input: string): string {
  if (!input) return "";
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

// Bug 3 — reject HTML banner timestamps that masquerade as article titles.
export function sanitizeTitle(t: string): string {
  const cleaned = stripHtml(String(t ?? "")).trim();
  if (!cleaned) return "";
  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)/i.test(cleaned)) return "";
  if (/^\d{1,2}[\s\-/](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(cleaned)) return "";
  if (/\d{1,2}:\d{2}\s?(am|pm|ist)/i.test(cleaned) && cleaned.length < 50) return "";
  return cleaned.slice(0, 200);
}


export async function callMarketauxForClaude(
  args: MarketauxClaudeArgs,
  userJwt: string,
): Promise<MarketauxClaudeResult> {
  const out: MarketauxClaudeResult = { ok: false, articles: [], total: 0 };

  if (!SUPABASE_URL) {
    out.error_code = "MARKETAX_UPSTREAM_ERROR";
    out.error_message = "SUPABASE_URL not configured";
    return out;
  }

  const body = {
    endpoint: "news/all",
    symbols: args.symbols ?? [],
    industry_tags: args.industry_tags ?? [],
    days_back: Math.min(Math.max(args.days_back ?? 7, 1), 30),
    limit: Math.min(args.limit ?? MAX_ARTICLES, MAX_ARTICLES),
    language: args.language ?? "en",
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/marketaux-fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userJwt || SUPABASE_ANON_KEY}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const j = await resp.json().catch(() => ({} as any));
    if (!resp.ok) {
      out.error_code = j?.error_code ?? "MARKETAX_UPSTREAM_ERROR";
      out.error_message = j?.error_message ?? `HTTP ${resp.status}`;
      return out;
    }

    const raw: any[] = Array.isArray(j?.articles)
      ? j.articles
      : Array.isArray(j?.data)
        ? j.data
        : [];
    const articles: MarketauxArticle[] = raw.slice(0, MAX_ARTICLES).map((a) => {
      const source = String(a.source ?? a.source_name ?? "Unknown");
      const rawTitle = sanitizeTitle(String(a.title ?? ""));
      const summary = truncate(stripHtml(String(a.description ?? a.summary ?? "")), MAX_SUMMARY_LEN);
      const title = rawTitle || (summary ? `${source} article` : "");
      return {
        title,
        url: String(a.url ?? ""),
        source,
        published_at: String(a.published_at ?? a.publishedAt ?? ""),
        summary,
      };
    }).filter((a) => a.url && (a.title || a.summary));


    out.ok = true;
    out.articles = articles;
    out.total = articles.length;
    return out;
  } catch (e: any) {
    clearTimeout(timer);
    out.error_code = e?.name === "AbortError" ? "TIMEOUT" : "MARKETAX_UPSTREAM_ERROR";
    out.error_message = String(e?.message ?? e);
    return out;
  }
}
