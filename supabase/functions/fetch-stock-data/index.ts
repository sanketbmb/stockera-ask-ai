// fetch-stock-data
// Returns market data for an NSE/BSE symbol via Lovable AI estimate (Gemini).
// NOTE: Live market data is served by dhan-fetch / finedge-fetch; this function
// is retained only as an AI-estimated fallback for callers that still rely on it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StockData {
  symbol: string;
  exchange: string;
  price: number | null;
  currency: string;
  change: number | null;
  changePercent: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  peRatio: number | null;
  marketCap: number | null;
  marketCapFormatted: string | null;
  ohlc30d: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
  source: "gemini_estimate";
  fetchedAt: string;
  warning?: string;
}

function formatMarketCap(n: number | null): string | null {
  if (!n || !isFinite(n)) return null;
  if (n >= 1e12) return `₹${(n / 1e12).toFixed(2)} Lakh Cr`;
  if (n >= 1e10) return `₹${(n / 1e7).toFixed(0)} Cr`;
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  return `₹${n.toFixed(0)}`;
}

function parseSymbol(input: string): { clean: string; exchange: string } {
  const raw = input.trim().toUpperCase();
  const clean = raw.replace(/\.(NS|BO|NSE|BSE)$/, "").replace(/:(NSE|BSE)$/, "");
  const exchange = raw.includes("BSE") || raw.endsWith(".BO") ? "BSE" : "NSE";
  return { clean, exchange };
}

async function fetchFromLovableAI(symbol: string, apiKey: string): Promise<StockData | null> {
  const { clean, exchange } = parseSymbol(symbol);
  const prompt = `Return ONLY a raw JSON object (no markdown, no commentary) with the most recent publicly known market data for the Indian listed stock ${clean} on ${exchange}.
{
  "price": number_in_INR,
  "change": number,
  "changePercent": number,
  "fiftyTwoWeekHigh": number,
  "fiftyTwoWeekLow": number,
  "peRatio": number_or_null,
  "marketCap": number_in_INR
}
Return your best honest estimate based on your training data. Numbers only, no strings, no currency symbols.`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      console.warn("Lovable AI HTTP", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    if (!raw) {
      console.warn("Lovable AI returned empty content");
      return null;
    }
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

    const marketCap = typeof parsed.marketCap === "number" ? parsed.marketCap : null;
    return {
      symbol: clean,
      exchange,
      price: typeof parsed.price === "number" ? parsed.price : null,
      currency: "INR",
      change: typeof parsed.change === "number" ? parsed.change : null,
      changePercent: typeof parsed.changePercent === "number" ? parsed.changePercent : null,
      fiftyTwoWeekHigh: typeof parsed.fiftyTwoWeekHigh === "number" ? parsed.fiftyTwoWeekHigh : null,
      fiftyTwoWeekLow: typeof parsed.fiftyTwoWeekLow === "number" ? parsed.fiftyTwoWeekLow : null,
      peRatio: typeof parsed.peRatio === "number" ? parsed.peRatio : null,
      marketCap,
      marketCapFormatted: formatMarketCap(marketCap),
      ohlc30d: [],
      source: "gemini_estimate",
      fetchedAt: new Date().toISOString(),
      warning: "Prices are AI-estimated and may be outdated by hours or days. Use dhan-fetch for live data.",
    };
  } catch (err) {
    console.error("Lovable AI fetch failed:", (err as Error).message);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { symbol } = await req.json();
    if (!symbol || typeof symbol !== "string") {
      return new Response(JSON.stringify({ error: "symbol is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const data = lovableKey ? await fetchFromLovableAI(symbol, lovableKey) : null;

    if (!data) {
      return new Response(JSON.stringify({ error: "No market data available", symbol }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "fetch-stock-data failed", details: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
