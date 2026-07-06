// Stage 4G APPLY-4 — server-only OG scrape helper.
//
// Server-only. Do NOT import from client-reachable modules directly; only
// re-export via createServerFn handlers. Filename ends in `.server.ts` so
// the client-bundle guard blocks direct client imports.

type OgScrapeResult = {
  ok: boolean;
  source_url: string;
  source_url_norm: string;
  provider: string;
  suggested_embed_kind: "embed" | "link_out";
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  raw: Record<string, string>;
};

function normalizeUrl(input: string): string {
  try {
    const u = new URL(input.trim());
    // strip tracking params
    const junk = /^(utm_|fbclid$|gclid$|mc_|ref$)/i;
    const params = Array.from(u.searchParams.keys());
    for (const k of params) if (junk.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return input.trim();
  }
}

function detectProvider(host: string): { provider: string; embed: "embed" | "link_out" } {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (h === "youtube.com" || h === "m.youtube.com" || h === "youtu.be") return { provider: "youtube", embed: "embed" };
  if (h === "twitter.com" || h === "x.com" || h.endsWith(".twitter.com")) return { provider: "twitter", embed: "embed" };
  if (h === "linkedin.com" || h.endsWith(".linkedin.com")) return { provider: "linkedin", embed: "link_out" };
  if (h === "medium.com" || h.endsWith(".medium.com")) return { provider: "medium", embed: "link_out" };
  if (h === "substack.com" || h.endsWith(".substack.com")) return { provider: "substack", embed: "link_out" };
  if (h === "moneycontrol.com" || h.endsWith(".moneycontrol.com")) return { provider: "moneycontrol", embed: "link_out" };
  if (h === "livemint.com" || h.endsWith(".livemint.com")) return { provider: "livemint", embed: "link_out" };
  if (h === "economictimes.indiatimes.com" || h.endsWith(".economictimes.indiatimes.com")) return { provider: "economictimes", embed: "link_out" };
  return { provider: h, embed: "link_out" };
}

function extractMeta(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const metaRe = /<meta\s+([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html))) {
    const attrs = m[1];
    const propMatch = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const contentMatch = /content\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (propMatch && contentMatch) {
      const key = propMatch[1].toLowerCase();
      if (!out[key]) out[key] = decodeEntities(contentMatch[1]);
    }
  }
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  if (titleMatch && !out["og:title"]) out["title"] = decodeEntities(titleMatch[1].trim());
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export async function scrapeOg(rawUrl: string): Promise<OgScrapeResult> {
  const source_url = rawUrl.trim();
  const source_url_norm = normalizeUrl(source_url);
  let host = "";
  try {
    host = new URL(source_url_norm).host;
  } catch {
    return {
      ok: false, source_url, source_url_norm,
      provider: "unknown", suggested_embed_kind: "link_out",
      title: null, description: null, image_url: null, site_name: null, raw: {},
    };
  }
  const { provider, embed } = detectProvider(host);

  let html = "";
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(source_url_norm, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; StockeraBot/1.0; +https://asktheexpert.lovable.app)",
        "accept": "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(t);
    if (res.ok) {
      const text = await res.text();
      // cap to first 256KB to avoid huge pages
      html = text.slice(0, 256 * 1024);
    }
  } catch {
    // swallow — return best-effort result
  }

  const meta = html ? extractMeta(html) : {};
  const title = meta["og:title"] || meta["twitter:title"] || meta["title"] || null;
  const description = meta["og:description"] || meta["twitter:description"] || meta["description"] || null;
  const image_url = meta["og:image"] || meta["twitter:image"] || null;
  const site_name = meta["og:site_name"] || null;

  return {
    ok: !!html,
    source_url, source_url_norm,
    provider,
    suggested_embed_kind: embed,
    title, description, image_url, site_name,
    raw: meta,
  };
}
