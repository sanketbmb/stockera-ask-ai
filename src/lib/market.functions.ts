import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CACHE_ID = "market_snapshot";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface MarketMover {
  symbol: string;
  changePct: string;
}

export interface MarketSnapshot {
  nifty50: { value: string; change: string; changePct: string };
  sensex: { value: string; change: string; changePct: string };
  topGainers: MarketMover[];
  topLosers: MarketMover[];
  marketSentiment: "Bullish" | "Bearish" | "Neutral";
  oneLineSummary: string;
  fetchedAt: string;
}

interface MarketResult {
  data: MarketSnapshot | null;
  cached: boolean;
  error: string | null;
}

const FALLBACK: MarketSnapshot = {
  nifty50: { value: "24,247.50", change: "+198.45", changePct: "+0.82" },
  sensex: { value: "79,843.12", change: "+247.18", changePct: "+0.31" },
  topGainers: [
    { symbol: "TATAMOTORS", changePct: "+3.2" },
    { symbol: "ADANIENT", changePct: "+2.7" },
    { symbol: "BAJFINANCE", changePct: "+2.1" },
  ],
  topLosers: [
    { symbol: "HDFCBANK", changePct: "-1.1" },
    { symbol: "INFY", changePct: "-0.9" },
    { symbol: "WIPRO", changePct: "-0.7" },
  ],
  marketSentiment: "Neutral",
  oneLineSummary: "Markets steady with mixed sector performance.",
  fetchedAt: new Date().toISOString(),
};

async function fetchFromGemini(): Promise<MarketSnapshot | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Return ONLY raw JSON for a realistic current Indian market snapshot, no markdown:
{
  "nifty50": { "value": "24247.50", "change": "+198.45", "changePct": "+0.82" },
  "sensex": { "value": "79843.12", "change": "+247.18", "changePct": "+0.31" },
  "topGainers": [{"symbol": "TATAMOTORS", "changePct": "+3.2"}, {"symbol":"X","changePct":"+2.1"}, {"symbol":"Y","changePct":"+1.8"}],
  "topLosers": [{"symbol": "HDFCBANK", "changePct": "-1.1"}, {"symbol":"X","changePct":"-0.9"}, {"symbol":"Y","changePct":"-0.7"}],
  "marketSentiment": "Bullish" | "Bearish" | "Neutral",
  "oneLineSummary": "Markets..."
}
Use realistic recent values for top NSE stocks.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
        }),
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as Omit<MarketSnapshot, "fetchedAt">;
    return { ...parsed, fetchedAt: new Date().toISOString() };
  } catch (err) {
    console.error("Gemini market fetch failed:", err);
    return null;
  }
}

async function readCache(): Promise<{ data: MarketSnapshot; expiresAt: string } | null> {
  try {
    const { data } = await supabaseAdmin
      .from("market_cache")
      .select("data, expires_at")
      .eq("id", CACHE_ID)
      .maybeSingle();
    if (!data) return null;
    return { data: data.data as unknown as MarketSnapshot, expiresAt: data.expires_at };
  } catch {
    return null;
  }
}

async function writeCache(snap: MarketSnapshot, expiresAt: string): Promise<void> {
  try {
    await supabaseAdmin.from("market_cache").upsert({
      id: CACHE_ID,
      data: JSON.parse(JSON.stringify(snap)),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* cache is best-effort */
  }
}

export const getMarketSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketResult> => {
    try {
      const cached = await readCache();
      if (cached && new Date(cached.expiresAt).getTime() > Date.now()) {
        return { data: cached.data, cached: true, error: null };
      }

      const fresh = await fetchFromGemini();
      if (!fresh) {
        if (cached?.data) return { data: cached.data, cached: true, error: null };
        return { data: FALLBACK, cached: false, error: "Using fallback data" };
      }

      await writeCache(fresh, new Date(Date.now() + TTL_MS).toISOString());
      return { data: fresh, cached: false, error: null };
    } catch (err) {
      console.error("getMarketSnapshot error:", err);
      return { data: FALLBACK, cached: false, error: (err as Error).message };
    }
  },
);

// Wave 1 — Fix #3: LTP autofill helper for QueryForm.
// Reads the latest cached LTP for a symbol from the ltp_cache table.
// Returns { ltp, ageMs, stale } so the UI can decide whether to autofill.
// Fresh = fetched within the last 24 hours.

const LTP_FRESHNESS_MS = 24 * 60 * 60 * 1000;

export interface LtpResult {
  ltp: number | null;
  fetchedAt: string | null;
  ageMs: number | null;
  stale: boolean;
}

export const getLtpForSymbol = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ symbol: z.string().min(1).max(32).regex(/^[A-Za-z0-9._&-]+$/) }).parse(input),
  )
  .handler(async ({ data }): Promise<LtpResult> => {
    const symbol = data.symbol.toUpperCase();
    try {
      const { data: row, error } = await supabaseAdmin
        .from("ltp_cache")
        .select("ltp, fetched_at")
        .eq("symbol", symbol)
        .maybeSingle();
      if (error || !row || row.ltp == null || !row.fetched_at) {
        return { ltp: null, fetchedAt: null, ageMs: null, stale: true };
      }
      const fetchedAtMs = new Date(row.fetched_at as string).getTime();
      const ageMs = Date.now() - fetchedAtMs;
      const stale = ageMs > LTP_FRESHNESS_MS;
      return {
        ltp: Number(row.ltp),
        fetchedAt: row.fetched_at as string,
        ageMs,
        stale,
      };
    } catch (err) {
      console.error("[getLtpForSymbol] failed:", err);
      return { ltp: null, fetchedAt: null, ageMs: null, stale: true };
    }
  });
