import { createServerFn } from "@tanstack/react-start";
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

export const getMarketSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketResult> => {
    try {
      const { data: cached } = await supabaseAdmin
        .from("market_cache")
        .select("data, expires_at")
        .eq("id", CACHE_ID)
        .maybeSingle();

      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        return { data: cached.data as MarketSnapshot, cached: true, error: null };
      }

      const fresh = await fetchFromGemini();
      if (!fresh) {
        if (cached?.data) {
          return { data: cached.data as MarketSnapshot, cached: true, error: null };
        }
        return { data: FALLBACK, cached: false, error: "Using fallback data" };
      }

      const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
      await supabaseAdmin
        .from("market_cache")
        .upsert({
          id: CACHE_ID,
          data: fresh,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        });

      return { data: fresh, cached: false, error: null };
    } catch (err) {
      console.error("getMarketSnapshot error:", err);
      return { data: FALLBACK, cached: false, error: (err as Error).message };
    }
  },
);
