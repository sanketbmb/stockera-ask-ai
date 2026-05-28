/**
 * get-price-data — unified price source for the Brain.
 *
 * Routes between FinEdge (accurate EOD/historical settlement closes) and
 * Dhan (live LTP during market hours), with transparent fallback.
 *
 * Input:  { symbol, securityId?, exchangeSegment?, mode, fromDate?, toDate? }
 * mode:   "live" | "eod" | "historical"
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Mode = "live" | "eod" | "historical";
type Segment = "NSE_EQ" | "BSE_EQ";

interface ReqBody {
  symbol: string;
  securityId?: string;
  exchangeSegment?: Segment;
  mode: Mode;
  fromDate?: string;
  toDate?: string;
}

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Hardcoded NSE holidays for 2026 (YYYY-MM-DD, IST). */
const NSE_HOLIDAYS_2026 = new Set<string>([
  "2026-01-26", // Republic Day
  "2026-03-03", // Holi
  "2026-03-19", // Eid al-Fitr (tentative)
  "2026-04-03", // Good Friday
  "2026-04-14", // Dr Ambedkar Jayanti
  "2026-05-01", // Maharashtra Day
  "2026-05-27", // Eid al-Adha (tentative)
  "2026-08-15", // Independence Day
  "2026-09-17", // Ganesh Chaturthi
  "2026-10-02", // Gandhi Jayanti
  "2026-10-21", // Diwali
  "2026-11-25", // Guru Nanak Jayanti
  "2026-12-25", // Christmas
]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Returns market status in IST: "open" | "pre" | "post" | "closed" | "holiday". */
function getMarketStatus(): "open" | "pre" | "post" | "closed" | "holiday" {
  const now = new Date();
  // IST = UTC+5:30
  const istMs = now.getTime() + (5 * 60 + 30) * 60_000;
  const ist = new Date(istMs);
  const day = ist.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return "closed";

  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;
  if (NSE_HOLIDAYS_2026.has(dateStr)) return "holiday";

  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const open = 9 * 60 + 15;
  const close = 15 * 60 + 30;
  if (mins < open) return "pre";
  if (mins > close) return "post";
  return "open";
}

/** Call a sibling edge function with the caller's auth header. */
async function callEdge(name: string, body: unknown, authHeader: string | null) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      authorization: authHeader ?? `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data } as {
    ok: boolean;
    status: number;
    data: Record<string, unknown> | string | null;
  };
}

/** Extract LTP from a dhan-fetch ltp response. */
function parseDhanLtp(resp: Record<string, unknown>, segment: Segment, securityId: string) {
  const data = resp?.data as Record<string, unknown> | undefined;
  const inner = data?.data as Record<string, unknown> | undefined;
  const seg = inner?.[segment] as Record<string, unknown> | undefined;
  const node = seg?.[securityId] as Record<string, unknown> | undefined;
  const ltp = node?.last_price ?? node?.ltp ?? node?.lastPrice;
  return typeof ltp === "number" && ltp > 0 ? ltp : null;
}

/** Extract latest price from a finedge daily-quotes response (last row). */
function parseFinedgeDailyQuotes(resp: Record<string, unknown>): { price: number | null; timestamp: string | null; candles: Candle[] } {
  const data = resp?.data as Record<string, unknown> | undefined;
  // FinEdge typically returns { data: [...] } or array directly
  const rows: unknown =
    (data as { data?: unknown })?.data ??
    (data as { quotes?: unknown })?.quotes ??
    data;
  if (!Array.isArray(rows) || rows.length === 0) {
    return { price: null, timestamp: null, candles: [] };
  }
  const candles: Candle[] = rows
    .map((r) => {
      const row = r as Record<string, unknown>;
      const date = String(row.date ?? row.timestamp ?? row.t ?? "");
      const close = Number(row.close ?? row.c ?? row.lastPrice ?? 0);
      return {
        date,
        open: Number(row.open ?? row.o ?? 0),
        high: Number(row.high ?? row.h ?? 0),
        low: Number(row.low ?? row.l ?? 0),
        close,
        volume: Number(row.volume ?? row.v ?? 0),
      };
    })
    .filter((c) => c.close > 0 && c.date);
  if (candles.length === 0) return { price: null, timestamp: null, candles: [] };
  // Sort ascending by date and pick last
  candles.sort((a, b) => a.date.localeCompare(b.date));
  const last = candles[candles.length - 1];
  return { price: last.close, timestamp: last.date, candles };
}

/** Extract candles from a dhan-fetch historical response. */
function parseDhanHistorical(resp: Record<string, unknown>): Candle[] {
  const data = resp?.data as Record<string, unknown> | undefined;
  const ts = data?.timestamp as number[] | undefined;
  const o = data?.open as number[] | undefined;
  const h = data?.high as number[] | undefined;
  const l = data?.low as number[] | undefined;
  const c = data?.close as number[] | undefined;
  const v = data?.volume as number[] | undefined;
  if (!Array.isArray(ts) || !Array.isArray(c)) return [];
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const epoch = ts[i] * 1000;
    const d = new Date(epoch);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    out.push({
      date: `${yyyy}-${mm}-${dd}`,
      open: Number(o?.[i] ?? 0),
      high: Number(h?.[i] ?? 0),
      low: Number(l?.[i] ?? 0),
      close: Number(c?.[i] ?? 0),
      volume: Number(v?.[i] ?? 0),
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ReqBody;
    const symbol = body?.symbol?.trim();
    const mode = body?.mode;
    const segment: Segment = body?.exchangeSegment ?? "NSE_EQ";
    const securityId = body?.securityId;
    const authHeader = req.headers.get("authorization");

    if (!symbol) return jsonResponse({ success: false, error: "symbol required" }, 400);
    if (!mode || !["live", "eod", "historical"].includes(mode)) {
      return jsonResponse({ success: false, error: "mode must be live | eod | historical" }, 400);
    }
    if (mode === "historical" && (!body.fromDate || !body.toDate)) {
      return jsonResponse({ success: false, error: "fromDate and toDate required for historical" }, 400);
    }

    const marketStatus = getMarketStatus();

    // ---------- LIVE: Dhan primary, FinEdge fallback ----------
    if (mode === "live") {
      if (!securityId) {
        return jsonResponse({ success: false, error: "securityId required for live mode" }, 400);
      }
      let primaryError: string | undefined;
      const dhan = await callEdge("dhan-fetch", {
        endpoint: "ltp", securityId, exchangeSegment: segment,
      }, authHeader);
      const dhanData = (typeof dhan.data === "object" && dhan.data) ? dhan.data as Record<string, unknown> : {};
      if (dhan.ok && dhanData.success === true) {
        const price = parseDhanLtp(dhanData, segment, securityId);
        if (price !== null) {
          return jsonResponse({
            success: true, mode, symbol,
            price, timestamp: new Date().toISOString(),
            source: "dhan", marketStatus, fallbackUsed: false,
          });
        }
        primaryError = "dhan returned no ltp value";
      } else {
        primaryError = String(dhanData.error ?? dhanData.message ?? `dhan http ${dhan.status}`);
      }

      // Fallback: FinEdge quote
      const fe = await callEdge("finedge-fetch", { endpoint: "quote", symbol }, authHeader);
      const feData = (typeof fe.data === "object" && fe.data) ? fe.data as Record<string, unknown> : {};
      if (fe.ok && feData.success === true) {
        const inner = (feData.data as Record<string, unknown> | undefined) ?? {};
        const innerData = (inner.data ?? inner) as Record<string, unknown>;
        const price = Number(
          innerData?.lastPrice ?? innerData?.last_price ?? innerData?.close ?? innerData?.price ?? 0,
        );
        if (price > 0) {
          return jsonResponse({
            success: true, mode, symbol,
            price, timestamp: new Date().toISOString(),
            source: "finedge-fallback", marketStatus, fallbackUsed: true, primaryError,
          });
        }
      }
      return jsonResponse({
        success: false, mode, symbol,
        price: null, source: null, marketStatus,
        primaryError, fallbackError: String(feData.error ?? `finedge http ${fe.status}`),
      }, 200);
    }

    // ---------- EOD: FinEdge primary, Dhan historical fallback ----------
    if (mode === "eod") {
      let primaryError: string | undefined;
      const fe = await callEdge("finedge-fetch", {
        endpoint: "daily-quotes", symbol,
      }, authHeader);
      const feData = (typeof fe.data === "object" && fe.data) ? fe.data as Record<string, unknown> : {};
      if (fe.ok && feData.success === true) {
        const parsed = parseFinedgeDailyQuotes(feData);
        if (parsed.price !== null) {
          return jsonResponse({
            success: true, mode, symbol,
            price: parsed.price, timestamp: parsed.timestamp,
            source: "finedge", marketStatus, fallbackUsed: false,
          });
        }
        primaryError = "finedge returned no daily-quote rows";
      } else {
        primaryError = String(feData.error ?? feData.message ?? `finedge http ${fe.status}`);
      }

      // Fallback: Dhan historical (last ~7 days)
      if (securityId) {
        const today = new Date();
        const past = new Date(today.getTime() - 10 * 86_400_000);
        const fmt = (d: Date) =>
          `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        const dhan = await callEdge("dhan-fetch", {
          endpoint: "historical", securityId, exchangeSegment: segment,
          params: { fromDate: fmt(past), toDate: fmt(today) },
        }, authHeader);
        const dhanData = (typeof dhan.data === "object" && dhan.data) ? dhan.data as Record<string, unknown> : {};
        if (dhan.ok && dhanData.success === true) {
          const candles = parseDhanHistorical(dhanData);
          if (candles.length > 0) {
            const last = candles[candles.length - 1];
            return jsonResponse({
              success: true, mode, symbol,
              price: last.close, timestamp: last.date,
              source: "dhan-fallback", marketStatus, fallbackUsed: true, primaryError,
            });
          }
        }
      }
      return jsonResponse({
        success: false, mode, symbol, price: null, source: null,
        marketStatus, primaryError,
      }, 200);
    }

    // ---------- HISTORICAL: FinEdge primary, Dhan fallback ----------
    let primaryError: string | undefined;
    const fe = await callEdge("finedge-fetch", {
      endpoint: "daily-quotes", symbol,
      params: { from: body.fromDate, to: body.toDate },
    }, authHeader);
    const feData = (typeof fe.data === "object" && fe.data) ? fe.data as Record<string, unknown> : {};
    if (fe.ok && feData.success === true) {
      const parsed = parseFinedgeDailyQuotes(feData);
      // Filter to requested range
      const candles = parsed.candles.filter(
        (c) => c.date >= body.fromDate! && c.date <= body.toDate!,
      );
      if (candles.length > 0) {
        const last = candles[candles.length - 1];
        return jsonResponse({
          success: true, mode, symbol,
          price: last.close, timestamp: last.date,
          candles, source: "finedge", marketStatus, fallbackUsed: false,
        });
      }
      primaryError = "finedge returned no candles in range";
    } else {
      primaryError = String(feData.error ?? feData.message ?? `finedge http ${fe.status}`);
    }

    if (securityId) {
      const dhan = await callEdge("dhan-fetch", {
        endpoint: "historical", securityId, exchangeSegment: segment,
        params: { fromDate: body.fromDate, toDate: body.toDate },
      }, authHeader);
      const dhanData = (typeof dhan.data === "object" && dhan.data) ? dhan.data as Record<string, unknown> : {};
      if (dhan.ok && dhanData.success === true) {
        const candles = parseDhanHistorical(dhanData);
        if (candles.length > 0) {
          const last = candles[candles.length - 1];
          return jsonResponse({
            success: true, mode, symbol,
            price: last.close, timestamp: last.date,
            candles, source: "dhan-fallback", marketStatus, fallbackUsed: true, primaryError,
          });
        }
      }
    }
    return jsonResponse({
      success: false, mode, symbol, candles: [], source: null,
      marketStatus, primaryError,
    }, 200);
  } catch (err) {
    console.error("get-price-data error:", err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
});
