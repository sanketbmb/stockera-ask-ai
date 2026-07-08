// SEO STAGE B — public stock-logo proxy with in-memory cache.
// GET /functions/v1/stock-logo/:symbol  (or ?symbol=INFY)
// Fetches Twelve Data logo, caches bytes for 24h, serves with CDN headers.
// Falls back to site default PNG on miss/timeout. No auth.

const SITE_ORIGIN = "https://asktheexpert.in";
const FALLBACK_URL = `${SITE_ORIGIN}/stockera-logo.png`;
const TTL_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 4000;

interface CacheEntry {
  bytes: ArrayBuffer;
  contentType: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

function sanitize(raw: string | null): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function loadFromTwelveData(symbol: string): Promise<CacheEntry | null> {
  try {
    const meta = await fetchWithTimeout(
      `https://api.twelvedata.com/logo?symbol=${encodeURIComponent(symbol)}`,
      UPSTREAM_TIMEOUT_MS,
    );
    if (!meta.ok) return null;
    const json = (await meta.json()) as { url?: string };
    const imgUrl = typeof json?.url === "string" ? json.url : "";
    if (!imgUrl) return null;
    const img = await fetchWithTimeout(imgUrl, UPSTREAM_TIMEOUT_MS);
    if (!img.ok) return null;
    const bytes = await img.arrayBuffer();
    const contentType = img.headers.get("content-type") ?? "image/png";
    return { bytes, contentType, expiresAt: Date.now() + TTL_MS };
  } catch {
    return null;
  }
}

function redirectFallback(): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: FALLBACK_URL,
      "Cache-Control": "public, max-age=3600",
      "X-Logo-Source": "fallback",
      ...CORS,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return new Response("method not allowed", { status: 405, headers: CORS });

  const url = new URL(req.url);
  // Path shape: /functions/v1/stock-logo/<SYMBOL>  OR  ?symbol=<SYMBOL>
  const parts = url.pathname.split("/").filter(Boolean);
  const pathSym = parts[parts.length - 1] !== "stock-logo" ? parts[parts.length - 1] : "";
  const symbol = sanitize(pathSym || url.searchParams.get("symbol"));

  if (!symbol) return redirectFallback();

  const hit = cache.get(symbol);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return new Response(hit.bytes, {
      status: 200,
      headers: {
        "Content-Type": hit.contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
        "X-Logo-Source": "twelvedata-cache",
        ...CORS,
      },
    });
  }

  const fresh = await loadFromTwelveData(symbol);
  if (!fresh) return redirectFallback();
  cache.set(symbol, fresh);

  return new Response(fresh.bytes, {
    status: 200,
    headers: {
      "Content-Type": fresh.contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      "X-Logo-Source": "twelvedata",
      ...CORS,
    },
  });
});
