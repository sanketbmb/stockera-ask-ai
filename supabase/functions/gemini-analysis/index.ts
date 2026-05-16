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
      console.warn("fetch-stock-data returned", res.status, (await res.text()).slice(0, 200));
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
  if (!d || d.price == null) {
    return "GROUND TRUTH MARKET DATA: unavailable — base your levels on your own knowledge of this stock, and be explicit that price levels are indicative.";
  }
  const recent = d.ohlc30d.slice(-10);
  const ohlcLines = recent.map(c => `  ${c.date}: O ${c.open} H ${c.high} L ${c.low} C ${c.close} Vol ${c.volume}`).join("\n");
  return `GROUND TRUTH MARKET DATA (${d.source === "twelvedata" ? "live from Twelve Data" : "AI-estimated fallback"}):
- Symbol: ${d.symbol} (${d.exchange})
- Current Price (LTP): ₹${d.price}
- Day change: ${d.change ?? "?"} (${d.changePercent ?? "?"}%)
- 52-week High: ${d.fiftyTwoWeekHigh != null ? `₹${d.fiftyTwoWeekHigh}` : "n/a"}
- 52-week Low:  ${d.fiftyTwoWeekLow  != null ? `₹${d.fiftyTwoWeekLow}`  : "n/a"}
- P/E Ratio: ${d.peRatio ?? "n/a"}
- Market Cap: ${d.marketCapFormatted ?? "n/a"}
- Recent OHLC:
${ohlcLines || "  (not available)"}
${d.warning ? `- NOTE: ${d.warning}` : ""}

RULES: all price levels (supportZone, resistanceZone, stopLoss, target1, target2, averagingZone, freshEntryZone) MUST be within ±25% of Current Price. Targets above LTP for BUY, below for SELL. StopLoss below LTP for BUY, above for SELL.`;
}

async function callLovableAI(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.35,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Lovable AI ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callGeminiDirect(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 2500,
          responseMimeType: "application/json",
        },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { stockName, stockSymbol, buyPrice, currentPrice, queryText, queryType, analystName, analystSebi } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!LOVABLE_API_KEY && !GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "No AI API key configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
  "fundamentalPoints": ["point1", "point2", "point3", "point4"],
  "technicalPoints": ["point1", "point2", "point3"],
  "ifHoldingAction": "Clear sentence of what to do if already holding",
  "ifAveragingRecommended": true,
  "averagingZone": "₹X – ₹Y or N/A",
  "freshEntryZone": "₹X – ₹Y or N/A",
  "freshEntryTrigger": "Specific trigger condition",
  "whatCanGoWrong": ["risk1", "risk2", "risk3"],
  "expertQuote": "One compelling analyst insight (30 words max)",
  "closingInsight": "2-3 sentence closing synthesis",
  "behavioralReminder": "One behavioral finance warning",
  "pnlContext": "${pnlPct ? `Current P&L: ${pnlPct}%` : "No buy price provided"}",
  "tags": ["High Beta", "Mid Cap", "Momentum Play"]
}

Stock: ${stockName} ${stockSymbol ? `(${stockSymbol})` : ""}
${buyPrice ? `Investor's Buy Price: ₹${buyPrice}` : ""}
${livePrice ? `Current Market Price: ₹${livePrice}` : ""}
${pnlPct ? `P&L: ${pnlPct}%` : ""}
Query Type: ${queryType || "General"}
Query: ${queryText}
Analyst: ${analystName || "AI System"}
SEBI Reg: ${analystSebi || "AI-generated educational report"}`;

    // Try Lovable AI Gateway first (more reliable), fall back to direct Gemini
    let raw = "";
    let provider = "";
    let firstErr: string | null = null;

    if (LOVABLE_API_KEY) {
      try {
        raw = await callLovableAI(prompt, LOVABLE_API_KEY);
        provider = "lovable_ai";
      } catch (e) {
        firstErr = (e as Error).message;
        console.warn("Lovable AI failed:", firstErr);
      }
    }
    if (!raw && GEMINI_API_KEY) {
      try {
        raw = await callGeminiDirect(prompt, GEMINI_API_KEY);
        provider = "gemini_direct";
      } catch (e) {
        const msg = (e as Error).message;
        console.error("Gemini direct failed:", msg);
        return new Response(JSON.stringify({
          error: "AI provider failed",
          details: firstErr ? `${firstErr} | ${msg}` : msg,
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (!raw) {
      return new Response(JSON.stringify({ error: "AI returned empty response", details: firstErr }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let report;
    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      report = JSON.parse(clean);
    } catch (err) {
      console.error("JSON parse failed. Raw preview:", raw.slice(0, 500));
      return new Response(JSON.stringify({
        error: "Failed to parse AI response as JSON",
        details: (err as Error).message,
        rawPreview: raw.slice(0, 500),
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true,
      report,
      marketData: ground,
      dataSource: ground?.source ?? "none",
      provider,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("gemini-analysis fatal:", (err as Error).message, (err as Error).stack);
    return new Response(JSON.stringify({ error: "Analysis failed", details: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
