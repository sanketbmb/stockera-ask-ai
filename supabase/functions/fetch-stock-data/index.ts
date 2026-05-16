// fetch-stock-data
// Returns ground-truth market data for an NSE/BSE symbol.
// Primary source: Twelve Data. Fallback: Gemini estimate (clearly flagged).
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
  source: "twelvedata" | "gemini_estimate";
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

function normalizeSymbol(input: string): { td: string; clean: string; exchange: string } {
  const raw = input.trim().toUpperCase();
  // Strip common suffixes
  const clean = raw.replace(/\.(NS|BO|NSE|BSE)$/, "").replace(/:(NSE|BSE)$/, "");
  // Twelve Data uses SYMBOL:NSE / SYMBOL:BSE
  const exchange = raw.includes("BSE") || raw.endsWith(".BO") ? "BSE" : "NSE";
  return { td: `${clean}:${exchange}`, clean, exchange };
}

async function fetchFromTwelveData(symbol: string, apiKey: string): Promise<StockData | null> {
  const { td, clean, exchange } = normalizeSymbol(symbol);

  try {
    const [quoteRes, tsRes] = await Promise.all([
      fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(td)}&apikey=${apiKey}`),
      fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(td)}&interval=1day&outputsize=30&apikey=${apiKey}`),
    ]);

    const quote = await quoteRes.json();
    const ts = await tsRes.json();

    // Twelve Data returns { code, message, status: "error" } on failure
    if (quote?.status === "error" || quote?.code) {
      console.warn("Twelve Data quote error:", quote?.message || quote?.code);
      return null;
    }

    const price = parseFloat(quote.close ?? quote.price);
    if (!isFinite(price)) {
      console.warn("Twelve Data returned no price for", td);
      return null;
    }

    const marketCap = quote.market_cap ? parseFloat(quote.market_cap) : null;
    const ohlc30d = Array.isArray(ts?.values)
      ? ts.values
          .slice(0, 30)
          .map((v: Record<string, string>) => ({
            date: v.datetime,
            open: parseFloat(v.open),
            high: parseFloat(v.high),
            low: parseFloat(v.low),
            close: parseFloat(v.close),
            volume: parseFloat(v.volume ?? "0"),
          }))
          .reverse()
      : [];

    return {
      symbol: clean,
      exchange,
      price,
      currency: quote.currency ?? "INR",
      change: quote.change ? parseFloat(quote.change) : null,
      changePercent: quote.percent_change ? parseFloat(quote.percent_change) : null,
      fiftyTwoWeekHigh: quote.fifty_two_week?.high ? parseFloat(quote.fifty_two_week.high) : null,
      fiftyTwoWeekLow: quote.fifty_two_week?.low ? parseFloat(quote.fifty_two_week.low) : null,
      peRatio: quote.pe ? parseFloat(quote.pe) : null,
      marketCap,
      marketCapFormatted: formatMarketCap(marketCap),
      ohlc30d,
      source: "twelvedata",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("Twelve Data fetch threw:", (err as Error).message);
    return null;
  }
}

async function fetchFromGeminiEstimate(symbol: string, geminiKey: string): Promise<StockData | null> {
  const { clean, exchange } = normalizeSymbol(symbol);
  const prompt = `Return ONLY a raw JSON object (no markdown) with the most recent publicly known market data for the Indian listed stock ${clean} on ${exchange}.
{
  "price": number_in_INR,
  "change": number,
  "changePercent": number,
  "fiftyTwoWeekHigh": number,
  "fiftyTwoWeekLow": number,
  "peRatio": number_or_null,
  "marketCap": number_in_INR
}
If you don't know, return your best honest estimate based on your training data. Numbers only, no strings, no currency symbols.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 400,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!raw) {
      console.warn("Gemini returned empty body:", JSON.stringify(data).slice(0, 400));
      return null;
    }
    const cleanJson = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

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
      warning: "Live data provider unavailable. Prices are AI-estimated and may be outdated.",
    };
  } catch (err) {
    console.error("Gemini fallback failed:", (err as Error).message);
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

    const tdKey = Deno.env.get("TWELVE_DATA_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    let data: StockData | null = null;
    if (tdKey) {
      data = await fetchFromTwelveData(symbol, tdKey);
    }
    if (!data && geminiKey) {
      console.log("Falling back to Gemini estimate for", symbol);
      data = await fetchFromGeminiEstimate(symbol, geminiKey);
    }

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
