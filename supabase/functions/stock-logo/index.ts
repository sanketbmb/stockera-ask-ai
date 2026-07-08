// SEO STAGE B.1 — public stock-logo proxy with in-memory cache + Twelve Data auth.
// GET /functions/v1/stock-logo/:symbol  (or ?symbol=INFY)
// Fetches Twelve Data logo (authed), caches bytes for 24h, serves with CDN headers.
// Falls back to site default PNG on miss/timeout/auth-failed/rate-limited.
// No auth required from client.

const SITE_ORIGIN = "https://asktheexpert.in";
const FALLBACK_URL = `${SITE_ORIGIN}/stockera-logo.png`;
const TTL_OK_MS = 24 * 60 * 60 * 1000;
const TTL_NEG_MS = 60 * 60 * 1000;       // not-found / auth-failed / upstream-error
const TTL_RATE_MS = 60 * 1000;            // rate-limited (short so throttle can clear)
const UPSTREAM_TIMEOUT_MS = 4000;

const TWELVE_DATA_API_KEY = Deno.env.get("TWELVE_DATA_API_KEY");

// One-shot warning latches (per cold start).
let warnedMissingKey = false;
let warnedAuthFailed = false;

type LogoSource =
  | "twelvedata"
  | "twelvedata-cache"
  | "not-found"
  | "auth-failed"
  | "rate-limited"
  | "upstream-error"
  | "exception"
  | "config-missing";

interface CacheEntry {
  kind: "ok" | "redirect";
  bytes?: ArrayBuffer;
  contentType?: string;
  source: LogoSource;
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

function redirectResponse(source: LogoSource): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: FALLBACK_URL,
      "Cache-Control": "public, max-age=3600",
      "X-Logo-Source": source,
      ...CORS,
    },
  });
}

function okResponse(bytes: ArrayBuffer, contentType: string, source: LogoSource): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      "X-Logo-Source": source,
      ...CORS,
    },
  });
}

type UpstreamResult =
  | { kind: "ok"; bytes: ArrayBuffer; contentType: string }
  | { kind: "redirect"; source: Exclude<LogoSource, "twelvedata" | "twelvedata-cache"> };

async function loadFromTwelveData(symbol: string): Promise<UpstreamResult> {
  if (!TWELVE_DATA_API_KEY) {
    if (!warnedMissingKey) {
      console.warn("[stock-logo] TWELVE_DATA_API_KEY missing — serving fallback");
      warnedMissingKey = true;
    }
    return { kind: "redirect", source: "config-missing" };
  }

  // TODO(B.2): stock_master may contain tickers like "M&M" that fail A-Z0-9 sanitize.
  const upstreamUrl =
    `https://api.twelvedata.com/logo?symbol=${symbol}` +
    `&apikey=${TWELVE_DATA_API_KEY}`;

  let meta: Response;
  try {
    meta = await fetchWithTimeout(upstreamUrl, UPSTREAM_TIMEOUT_MS);
  } catch {
    return { kind: "redirect", source: "exception" };
  }

  if (meta.status === 401 || meta.status === 403) {
    if (!warnedAuthFailed) {
      console.warn("[stock-logo] Twelve Data auth failed");
      warnedAuthFailed = true;
    }
    return { kind: "redirect", source: "auth-failed" };
  }
  if (meta.status === 429) {
    return { kind: "redirect", source: "rate-limited" };
  }
  if (!meta.ok) {
    return { kind: "redirect", source: "upstream-error" };
  }

  let json: { url?: string } = {};
  try {
    json = (await meta.json()) as { url?: string };
  } catch {
    return { kind: "redirect", source: "upstream-error" };
  }
  const imgUrl = typeof json?.url === "string" ? json.url.trim() : "";
  if (!imgUrl) {
    return { kind: "redirect", source: "not-found" };
  }

  try {
    const img = await fetchWithTimeout(imgUrl, UPSTREAM_TIMEOUT_MS);
    if (!img.ok) return { kind: "redirect", source: "upstream-error" };
    const bytes = await img.arrayBuffer();
    const contentType = img.headers.get("content-type") ?? "image/png";
    return { kind: "ok", bytes, contentType };
  } catch {
    return { kind: "redirect", source: "exception" };
  }
}

function ttlFor(source: LogoSource): number {
  if (source === "twelvedata") return TTL_OK_MS;
  if (source === "rate-limited") return TTL_RATE_MS;
  return TTL_NEG_MS; // not-found / auth-failed / upstream-error / exception
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return new Response("method not allowed", { status: 405, headers: CORS });

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const pathSym = parts[parts.length - 1] !== "stock-logo" ? parts[parts.length - 1] : "";
  const symbol = sanitize(pathSym || url.searchParams.get("symbol"));

  if (!symbol) return redirectResponse("not-found");

  const now = Date.now();
  const hit = cache.get(symbol);
  if (hit && hit.expiresAt > now) {
    if (hit.kind === "ok" && hit.bytes && hit.contentType) {
      return okResponse(hit.bytes, hit.contentType, "twelvedata-cache");
    }
    if (hit.kind === "redirect") {
      return redirectResponse(hit.source);
    }
  }

  const result = await loadFromTwelveData(symbol);

  if (result.kind === "ok") {
    cache.set(symbol, {
      kind: "ok",
      bytes: result.bytes,
      contentType: result.contentType,
      source: "twelvedata",
      expiresAt: now + ttlFor("twelvedata"),
    });
    return okResponse(result.bytes, result.contentType, "twelvedata");
  }

  // Do not cache config-missing — retry on next request when secret returns.
  if (result.source !== "config-missing") {
    cache.set(symbol, {
      kind: "redirect",
      source: result.source,
      expiresAt: now + ttlFor(result.source),
    });
  }
  return redirectResponse(result.source);
});
