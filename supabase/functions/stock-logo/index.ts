// SEO STAGE B.4 — multi-provider logo chain with initials SVG terminal fallback.
// GET /functions/v1/stock-logo/:symbol (or ?symbol=INFY)
// Provider order: Twelve Data (bare / :NSE / .BSE) -> FMP .NS.png ->
// Google favicon via hardcoded symbol->domain map -> generated initials SVG.
// The Stockera brand PNG is NEVER served by this function.

const TTL_OK_MS = 24 * 60 * 60 * 1000;
const TTL_RATE_MS = 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 4000;
const FMP_TIMEOUT_MS = 3000;
const FAVICON_TIMEOUT_MS = 3000;
const CHAIN_BUDGET_MS = 12_000;
const MIN_IMAGE_BYTES = 500;

const TWELVE_DATA_API_KEY = Deno.env.get("TWELVE_DATA_API_KEY");
let warnedMissingKey = false;
let warnedAuthFailed = false;

type LogoSource =
  | "twelvedata"
  | "twelvedata-nse"
  | "twelvedata-bse"
  | "twelvedata-cache"
  | "fmp"
  | "fmp-cache"
  | "google-favicon"
  | "google-favicon-cache"
  | "initials";

interface OkCacheEntry {
  kind: "ok";
  bytes: ArrayBuffer;
  contentType: string;
  source: LogoSource;
  expiresAt: number;
}
const cache = new Map<string, OkCacheEntry>();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

// -------- symbol -> domain map (normalized: uppercase, alphanumeric only) --------
const SYMBOL_TO_DOMAIN: Record<string, string> = {
  INFY: "infosys.com",
  TCS: "tcs.com",
  RELIANCE: "ril.com",
  KOTAKBANK: "kotak.com",
  SBIN: "sbi.co.in",
  ZOMATO: "zomato.com",
  ICICIBANK: "icicibank.com",
  IDFCFIRSTB: "idfcfirstbank.com",
  SUZLON: "suzlon.com",
  IREDA: "ireda.in",
  MAHABANK: "bankofmaharashtra.in",
  INDIANB: "indianbank.in",
  RBLBANK: "rblbank.com",
  SIEMENS: "siemens.com",
  HDFCBANK: "hdfcbank.com",
  AXISBANK: "axisbank.com",
  PTC: "ptcindia.com",
  TATAMOTORS: "tatamotors.com",
  MM: "mahindra.com",           // normalized "M&M"
  BLACKBUCK: "blackbuck.com",
  COALINDIA: "coalindia.in",
  GRSE: "grse.in",
  RVNL: "rvnl.org",
  DYNACONS: "dynacons.com",
  // Extended coverage — top NSE/BSE symbols
  HDFC: "hdfcbank.com",
  ITC: "itcportal.com",
  LT: "larsentoubro.com",
  SBILIFE: "sbilife.co.in",
  HDFCLIFE: "hdfclife.com",
  BAJFINANCE: "bajajfinserv.in",
  BAJAJFINSV: "bajajfinserv.in",
  MARUTI: "marutisuzuki.com",
  ASIANPAINT: "asianpaints.com",
  HINDUNILVR: "hul.co.in",
  NESTLEIND: "nestle.in",
  BRITANNIA: "britannia.co.in",
  DABUR: "dabur.com",
  GODREJCP: "godrejcp.com",
  TITAN: "titancompany.in",
  BHARTIARTL: "airtel.in",
  WIPRO: "wipro.com",
  HCLTECH: "hcltech.com",
  TECHM: "techmahindra.com",
  LTIM: "ltimindtree.com",
  PERSISTENT: "persistent.com",
  MPHASIS: "mphasis.com",
  SUNPHARMA: "sunpharma.com",
  DRREDDY: "drreddys.com",
  CIPLA: "cipla.com",
  DIVISLAB: "divislaboratories.com",
  APOLLOHOSP: "apollohospitals.com",
  ONGC: "ongcindia.com",
  IOC: "iocl.com",
  BPCL: "bharatpetroleum.com",
  GAIL: "gailonline.com",
  POWERGRID: "powergrid.in",
  NTPC: "ntpc.co.in",
  TATAPOWER: "tatapower.com",
  TATASTEEL: "tatasteel.com",
  JSWSTEEL: "jsw.in",
  HINDALCO: "hindalco.com",
  VEDL: "vedantalimited.com",
  ADANIENT: "adanienterprises.com",
  ADANIPORTS: "adaniports.com",
  ADANIPOWER: "adanipower.com",
  ADANIGREEN: "adanigreenenergy.com",
  DMART: "dmartindia.com",
  AVENUE: "dmartindia.com",
  PAYTM: "paytm.com",
  NYKAA: "nykaa.com",
  POLICYBZR: "policybazaar.com",
  IRCTC: "irctc.co.in",
  IRFC: "irfc.co.in",
  RECLTD: "recindia.nic.in",
  PFC: "pfcindia.com",
  BEL: "bel-india.in",
  HAL: "hal-india.co.in",
  BHEL: "bhel.com",
  BANKBARODA: "bankofbaroda.in",
  PNB: "pnbindia.in",
  CANBK: "canarabank.com",
  UNIONBANK: "unionbankofindia.co.in",
  YESBANK: "yesbank.in",
  FEDERALBNK: "federalbank.co.in",
  INDUSINDBK: "indusind.com",
  BANDHANBNK: "bandhanbank.com",
  AUBANK: "aubank.in",
  CHOLAFIN: "cholamandalam.com",
  MUTHOOTFIN: "muthootfinance.com",
  SHRIRAMFIN: "shriramfinance.in",
  LICI: "licindia.in",
  ULTRACEMCO: "ultratechcement.com",
  SHREECEM: "shreecement.com",
  AMBUJACEM: "ambujacement.com",
  ACC: "acclimited.com",
  GRASIM: "grasim.com",
  PIDILITIND: "pidilite.com",
  BERGEPAINT: "bergerpaints.com",
  HAVELLS: "havells.com",
  VOLTAS: "voltas.com",
  DIXON: "dixoninfo.com",
  TATAELXSI: "tataelxsi.com",
  COFORGE: "coforge.com",
  KPITTECH: "kpit.com",
  ZEEL: "zee.com",
  PVRINOX: "pvrinox.com",
  JIOFIN: "jfs.in",
  DLF: "dlf.in",
  GODREJPROP: "godrejproperties.com",
  OBEROIRLTY: "oberoirealty.com",
  LODHA: "lodhagroup.in",
  IDEA: "myvi.in",
  VBL: "varunpepsi.com",
  UBL: "unitedbreweries.com",
  MCDOWELL: "diageoindia.com",
  BIOCON: "biocon.com",
  LUPIN: "lupin.com",
  TORNTPHARM: "torrentpharma.com",
  ZYDUSLIFE: "zyduslife.com",
  ABBOTINDIA: "abbott.co.in",
};

// -------- helpers --------

function sanitize(raw: string | null): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
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

// -------- initials SVG terminal fallback --------

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildInitialsSvg(symbolRaw: string): Response {
  const sym = (symbolRaw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const label = sym.length === 0 ? "?" : sym.length <= 2 ? sym : sym.slice(0, 2);
  const hue = hashString(sym || "?") % 360;
  const bg = `hsl(${hue}, 55%, 45%)`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">` +
    `<rect width="200" height="200" rx="20" ry="20" fill="${bg}"/>` +
    `<text x="100" y="100" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" ` +
    `font-weight="700" font-size="90" fill="#ffffff">${label}</text>` +
    `</svg>`;
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Logo-Source": "initials",
      ...CORS,
    },
  });
}

// -------- provider attempts --------

type ImgOk = { kind: "ok"; bytes: ArrayBuffer; contentType: string };
type ImgFail = { kind: "fail" };
type ImgAuth = { kind: "auth-failed" };
type ImgRate = { kind: "rate-limited" };
type ImgConfig = { kind: "config-missing" };
type AttemptResult = ImgOk | ImgFail | ImgAuth | ImgRate | ImgConfig;

async function readImageIfValid(resp: Response): Promise<ImgOk | ImgFail> {
  if (!resp.ok) return { kind: "fail" };
  const ct = resp.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) {
    try { await resp.arrayBuffer(); } catch { /* ignore */ }
    return { kind: "fail" };
  }
  const bytes = await resp.arrayBuffer();
  if (bytes.byteLength < MIN_IMAGE_BYTES) return { kind: "fail" };
  return { kind: "ok", bytes, contentType: ct };
}

async function tryTwelveData(form: string): Promise<AttemptResult> {
  if (!TWELVE_DATA_API_KEY) {
    if (!warnedMissingKey) {
      console.warn("[stock-logo] TWELVE_DATA_API_KEY missing");
      warnedMissingKey = true;
    }
    return { kind: "config-missing" };
  }
  const upstreamUrl =
    `https://api.twelvedata.com/logo?symbol=${encodeURIComponent(form)}` +
    `&apikey=${TWELVE_DATA_API_KEY}`;
  let meta: Response;
  try {
    meta = await fetchWithTimeout(upstreamUrl, UPSTREAM_TIMEOUT_MS);
  } catch {
    return { kind: "fail" };
  }
  if (meta.status === 401 || meta.status === 403) {
    if (!warnedAuthFailed) {
      console.warn("[stock-logo] Twelve Data auth failed");
      warnedAuthFailed = true;
    }
    return { kind: "auth-failed" };
  }
  if (meta.status === 429) return { kind: "rate-limited" };
  if (!meta.ok) return { kind: "fail" };
  let json: { url?: string } = {};
  try { json = await meta.json() as { url?: string }; } catch { return { kind: "fail" }; }
  const imgUrl = typeof json?.url === "string" ? json.url.trim() : "";
  if (!imgUrl) return { kind: "fail" };
  try {
    const img = await fetchWithTimeout(imgUrl, UPSTREAM_TIMEOUT_MS);
    return await readImageIfValid(img);
  } catch {
    return { kind: "fail" };
  }
}

async function tryFmp(symbol: string): Promise<AttemptResult> {
  const url = `https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.NS.png`;
  try {
    const r = await fetchWithTimeout(url, FMP_TIMEOUT_MS);
    return await readImageIfValid(r);
  } catch {
    return { kind: "fail" };
  }
}

async function tryGoogleFavicon(domain: string): Promise<AttemptResult> {
  const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  try {
    const r = await fetchWithTimeout(url, FAVICON_TIMEOUT_MS);
    return await readImageIfValid(r);
  } catch {
    return { kind: "fail" };
  }
}

// -------- chain --------

async function resolveLogo(symbol: string): Promise<
  | { kind: "ok"; bytes: ArrayBuffer; contentType: string; source: LogoSource }
  | { kind: "initials" }
> {
  const started = Date.now();
  const budgetLeft = () => Date.now() - started < CHAIN_BUDGET_MS;

  const tdForms: Array<{ form: string; source: LogoSource }> = [
    { form: symbol, source: "twelvedata" },
    { form: `${symbol}:NSE`, source: "twelvedata-nse" },
    { form: `${symbol}.BSE`, source: "twelvedata-bse" },
  ];
  for (const { form, source } of tdForms) {
    if (!budgetLeft()) return { kind: "initials" };
    const r = await tryTwelveData(form);
    if (r.kind === "ok") return { kind: "ok", bytes: r.bytes, contentType: r.contentType, source };
    if (r.kind === "auth-failed" || r.kind === "config-missing") break; // no point retrying TD
    // rate-limited / fail → continue to next form
  }

  // FMP
  if (budgetLeft()) {
    const r = await tryFmp(symbol);
    if (r.kind === "ok") return { kind: "ok", bytes: r.bytes, contentType: r.contentType, source: "fmp" };
  }

  // Google favicon via map
  const domain = SYMBOL_TO_DOMAIN[symbol];
  if (domain && budgetLeft()) {
    const r = await tryGoogleFavicon(domain);
    if (r.kind === "ok") {
      return { kind: "ok", bytes: r.bytes, contentType: r.contentType, source: "google-favicon" };
    }
  }

  return { kind: "initials" };
}

function cacheVariant(source: LogoSource): LogoSource {
  if (source === "twelvedata" || source === "twelvedata-nse" || source === "twelvedata-bse") return "twelvedata-cache";
  if (source === "fmp") return "fmp-cache";
  if (source === "google-favicon") return "google-favicon-cache";
  return source;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return new Response("method not allowed", { status: 405, headers: CORS });

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const pathSym = parts[parts.length - 1] !== "stock-logo" ? parts[parts.length - 1] : "";
  const symbol = sanitize(pathSym || url.searchParams.get("symbol"));

  if (!symbol) return buildInitialsSvg("?");

  const now = Date.now();
  const hit = cache.get(symbol);
  if (hit && hit.expiresAt > now) {
    return okResponse(hit.bytes, hit.contentType, cacheVariant(hit.source));
  }

  const result = await resolveLogo(symbol);
  if (result.kind === "ok") {
    cache.set(symbol, {
      kind: "ok",
      bytes: result.bytes,
      contentType: result.contentType,
      source: result.source,
      expiresAt: now + TTL_OK_MS,
    });
    return okResponse(result.bytes, result.contentType, result.source);
  }

  // Terminal fallback — never the Stockera PNG. Not stored in in-memory cache.
  return buildInitialsSvg(symbol);
});
