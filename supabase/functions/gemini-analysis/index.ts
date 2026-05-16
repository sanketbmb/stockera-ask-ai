import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StockData {
  symbol: string;
  exchange: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  peRatio: number | null;
  marketCap: number | null;
  marketCapFormatted: string | null;
  ohlc30d: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
  source: "twelvedata" | "gemini_estimate";
  warning?: string;
}

async function fetchGroundTruth(symbol: string | undefined, authHeader: string | null): Promise<StockData | null> {
  if (!symbol) return null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) return null;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/fetch-stock-data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      },
      body: JSON.stringify({ symbol }),
    });
    if (!res.ok) {
      console.warn("fetch-stock-data returned", res.status);
      return null;
    }
    const json = await res.json();
    return json?.success ? (json.data as StockData) : null;
  } catch (err) {
    console.warn("fetchGroundTruth threw:", (err as Error).message);
    return null;
  }
}

function buildGroundTruthBlock(d: StockData | null): string {
  if (!d || d.price == null) return "GROUND TRUTH MARKET DATA: unavailable — base your levels on your own knowledge of this stock, and be explicit that price levels are indicative.";

  const recent = d.ohlc30d.slice(-10);
  const ohlcLines = recent.map(c => `  ${c.date}: O ${c.open} H ${c.high} L ${c.low} C ${c.close} Vol ${c.volume}`).join("\n");

  return `GROUND TRUTH MARKET DATA (${d.source === "twelvedata" ? "live from Twelve Data" : "AI-estimated fallback"}) — anchor all price levels to these numbers:
- Symbol: ${d.symbol} (${d.exchange})
- Current Price (LTP): ₹${d.price}
- Day change: ${d.change ?? "?"} (${d.changePercent ?? "?"}%)
- 52-week High: ${d.fiftyTwoWeekHigh != null ? `₹${d.fiftyTwoWeekHigh}` : "n/a"}
- 52-week Low:  ${d.fiftyTwoWeekLow  != null ? `₹${d.fiftyTwoWeekLow}`  : "n/a"}
- P/E Ratio: ${d.peRatio ?? "n/a"}
- Market Cap: ${d.marketCapFormatted ?? "n/a"}
- Recent OHLC (last ${recent.length} sessions):
${ohlcLines || "  (not available)"}
${d.warning ? `- NOTE: ${d.warning}` : ""}

RULES:
- supportZone, resistanceZone, stopLoss, target1, target2, averagingZone and freshEntryZone MUST be within ±25% of the Current Price above.
- Targets above Current Price for BUY; below for SELL.
- StopLoss for BUY should be below Current Price; above for SELL.
- Use the 52-week range as the outer bound for support/resistance.
- Reference OHLC trend when describing momentum.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { stockName, stockSymbol, buyPrice, currentPrice, queryText, queryType, analystName, analystSebi } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return new Response(JSON.stringify({ error: "API key not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // 1. Pull ground-truth market data first
    const symbolForLookup = stockSymbol || stockName;
    const ground = await fetchGroundTruth(symbolForLookup, req.headers.get("Authorization"));
    const livePrice = ground?.price ?? currentPrice ?? null;
    const pnlPct = buyPrice && livePrice ? (((livePrice - buyPrice) / buyPrice) * 100).toFixed(2) : null;

    const groundBlock = buildGroundTruthBlock(ground);

    const prompt = `You are a SEBI-registered research analyst assistant for Indian retail investors on the "Ask The Expert by Stockera" platform. Analyze the following stock query and return ONLY a raw JSON object — no markdown, no backticks, no explanation.

${groundBlock}

Return this exact JSON structure:
{
  "verdict": "BUY" | "SELL" | "HOLD" | "AVERAGE" | "WAIT" | "PARTIAL_EXIT",
  "verdictColor": "green" | "red" | "orange" | "yellow",
  "tagline": "One punchy actionable sentence (max 12 words)",
  "confidence": 72,
  "riskScore": 6.5,
  "rewardPotential": 5,
  "fundamentals": "Strong" | "Stable" | "Weakening" | "Deteriorating",
  "technical": "Bullish" | "Bearish" | "Neutral" | "Recovering" | "Weakening",
  "risk": "Low" | "Medium" | "High" | "Very High",
  "trend": "Uptrend" | "Downtrend" | "Sideways" | "Recovering",
  "momentum": "Strong" | "Improving" | "Neutral" | "Weak",
  "supportZone": "₹X – ₹Y",
  "resistanceZone": "₹X – ₹Y",
  "stopLoss": "₹X",
  "target1": "₹X",
  "target2": "₹X",
  "timeHorizon": "1-2 weeks" | "1-3 months" | "3-6 months" | "6-12 months" | "1-3 years",
  "fundamentalPoints": ["point1 (25 words max)", "point2", "point3", "point4"],
  "technicalPoints": ["point1 (25 words max)", "point2", "point3"],
  "ifHoldingAction": "Clear sentence of what to do if already holding",
  "ifAveragingRecommended": true | false,
  "averagingZone": "₹X – ₹Y or N/A",
  "freshEntryZone": "₹X – ₹Y or N/A",
  "freshEntryTrigger": "Specific trigger condition",
  "whatCanGoWrong": ["risk1 (20 words max)", "risk2", "risk3"],
  "expertQuote": "One compelling analyst insight in quotation-worthy language (30 words max)",
  "closingInsight": "2-3 sentence closing synthesis with actionable takeaway",
  "behavioralReminder": "One behavioral finance warning relevant to this situation",
  "pnlContext": "${pnlPct ? `Current P&L: ${pnlPct}%` : "No buy price provided"}",
  "tags": ["High Beta", "Mid Cap", "Momentum Play"]
}

Stock: ${stockName} ${stockSymbol ? `(${stockSymbol})` : ""}
${buyPrice ? `Investor's Buy Price: ₹${buyPrice}` : ""}
${livePrice ? `Current Market Price (use this exact value): ₹${livePrice}` : ""}
${pnlPct ? `P&L: ${pnlPct}%` : ""}
Query Type: ${queryType || "General"}
Query: ${queryText}
Analyst: ${analystName || "AI System"}
SEBI Reg: ${analystSebi || "AI-generated report — not SEBI advice"}

IMPORTANT: Anchor every price-related field to the GROUND TRUTH MARKET DATA block above. Do not invent prices that contradict it. Reminder — this is educational, not SEBI-registered advice.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 1500 },
        }),
      }
    );

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const report = JSON.parse(clean);

    return new Response(JSON.stringify({
      success: true,
      report,
      marketData: ground,
      dataSource: ground?.source ?? "none",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Analysis failed", details: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
