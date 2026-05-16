import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { stockName, stockSymbol, buyPrice, currentPrice, queryText, queryType, analystName, analystSebi } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return new Response(JSON.stringify({ error: "API key not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const pnlPct = buyPrice && currentPrice ? (((currentPrice - buyPrice) / buyPrice) * 100).toFixed(2) : null;

    const prompt = `You are a SEBI-registered research analyst assistant for Indian retail investors on the "Ask The Expert by Stockera" platform. Analyze the following stock query and return ONLY a raw JSON object — no markdown, no backticks, no explanation.

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
  "pnlContext": "${pnlPct ? `Current P&L: ${pnlPct}%` : 'No buy price provided'}",
  "tags": ["High Beta", "Mid Cap", "Momentum Play"]
}

Stock: ${stockName} ${stockSymbol ? `(${stockSymbol})` : ""}
${buyPrice ? `Investor's Buy Price: ₹${buyPrice}` : ""}
${currentPrice ? `Current Market Price: ₹${currentPrice}` : ""}
${pnlPct ? `P&L: ${pnlPct}%` : ""}
Query Type: ${queryType || "General"}
Query: ${queryText}
Analyst: ${analystName || "AI System"}
SEBI Reg: ${analystSebi || "AI-generated report — not SEBI advice"}

IMPORTANT: Base analysis on real publicly available fundamentals and technicals for this Indian stock. Use NSE/BSE data context. Be specific with price levels. Reminder — this is educational, not SEBI-registered advice.`;

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

    return new Response(JSON.stringify({ success: true, report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Analysis failed", details: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
