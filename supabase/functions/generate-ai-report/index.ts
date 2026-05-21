// @ts-nocheck
// Stockera AI Report Generator — v1.0
// Compliance-first: NO verdicts, NO targets, NO stop-loss, factual context only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const TWELVE_DATA_API_KEY = Deno.env.get("TWELVE_DATA_API_KEY");

const PROMPT_VERSION = "1.0.0";
const PROHIBITED = [
  "guaranteed", "sure-shot", "sure shot", "multibagger", "assured returns",
  "100% return", "100 % return", "definitely will", "certainly will",
  "must buy", "must sell", "buy immediately", "sell immediately", "risk-free",
];
// Verdict-style single words (matched as whole tokens, case-insensitive)
const PROHIBITED_VERDICTS = ["verdict: buy", "verdict: sell", "verdict: hold",
  "our verdict", "final verdict"];
const PROHIBITED_FIELDS = ["target", "target_price", "stop_loss", "stoploss",
  "support_zone", "resistance_zone", "support_level", "resistance_level", "verdict"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `# SYSTEM PROMPT — AI REPORT GENERATOR v1.0
# Owner: Stockera Technology Pvt Ltd
# This prompt is regulatory-sensitive. Changes require compliance review.

You are an AI analyst assistant for Ask The Expert by Stockera, an Indian SEBI-compliance-aware stock query platform. You produce EDUCATIONAL position observations only. You are NOT a SEBI-registered Research Analyst. Final recommendations come from a human SEBI-RA who reviews your output and records a personalized video for the user.

HARD RULES (violating any = rejection):
1. NEVER output a buy/sell/hold verdict.
2. NEVER output a specific stop-loss, target, support, or resistance number.
3. NEVER use: "guaranteed", "sure-shot", "multibagger", "100% return", "buy immediately", "sell immediately", "risk-free".
4. NEVER predict prices. Describe only what is publicly known TODAY.
5. NEVER invent numbers. Every number must come from GROUND_TRUTH_DATA.
6. PNL_STATE drives behavioral language: don't say "given your profit" on a loss; don't suggest averaging on fresh_entry.

OUTPUT: return ONLY valid JSON matching this schema (no markdown):
{
  "ai_position_observation": string (1-2 neutral sentences, no buy/sell/hold words),
  "confidence_label": "data_rich" | "limited_data" | "needs_analyst_review",
  "confidence_breakdown": { "data_coverage": 0-100, "recency": 0-100, "specificity": 0-100 },
  "what_ai_can_tell_you": string[] (3-5 factual bullets citing GROUND_TRUTH numbers),
  "what_only_analyst_can_tell_you": string[] (3-4 bullets on what the 24h video will cover),
  "behavioral_note": string (1 sentence conditioned on PNL_STATE),
  "recent_news_context": string[] (up to 3, citing source; [] if none),
  "stock_specific_risks": string[] (3-5; at least 2 reference a recent headline or named factor; NO generic "market volatility"),
  "tags": string[]
}

If query is out_of_scope (crypto, US stocks, real estate), return minimal JSON with confidence_label="needs_analyst_review" and tags=["out_of_scope"].`;

function computePnlState(buyPrice: number | null, currentPrice: number | null): string {
  if (!buyPrice) return "fresh_entry";
  if (!currentPrice) return "n/a";
  const pct = ((currentPrice - buyPrice) / buyPrice) * 100;
  if (pct < -1) return "loss";
  if (pct < 5) return "small_gain";
  return "significant_gain";
}

async function classifyIntent(question: string): Promise<string> {
  const lower = question.toLowerCase();
  if (/\b(crypto|bitcoin|us stock|nasdaq|real estate|property)\b/.test(lower)) return "out_of_scope";
  if (/\b(should i (buy|enter)|fresh entry|entry point|invest in)\b/.test(lower)) return "buy_decision";
  if (/\b(average|averaging|buy more|double down)\b/.test(lower)) return "should_average";
  if (/\b(sell|exit|book profit|hold|stuck|loss)\b/.test(lower)) return "stuck_position";
  if (/\b(explain|what is|how does|teach|learn)\b/.test(lower)) return "educational";
  if (/\b(sector|industry|best stocks in)\b/.test(lower)) return "sector_view";
  return "stuck_position";
}

async function fetchStockData(symbol: string): Promise<any> {
  if (!symbol) return null;
  try {
    if (TWELVE_DATA_API_KEY) {
      const url = `https://api.twelvedata.com/quote?symbol=${symbol}:NSE&apikey=${TWELVE_DATA_API_KEY}`;
      const r = await fetch(url);
      const j = await r.json();
      if (j && !j.code && j.close) {
        return {
          ltp: parseFloat(j.close),
          ltp_timestamp: new Date().toISOString(),
          fifty_two_week_high: parseFloat(j.fifty_two_week?.high ?? "0") || null,
          fifty_two_week_low: parseFloat(j.fifty_two_week?.low ?? "0") || null,
          source: "Twelve Data",
          exchange: "NSE",
        };
      }
    }
  } catch (e) { console.error("twelvedata error", e); }
  return { ltp: null, ltp_timestamp: null, source: "unavailable", exchange: "NSE" };
}

async function callLLM(userPrompt: string): Promise<{ json: any; provider: string; model: string }> {
  // Try Lovable AI Gateway (Gemini 2.5 Pro) first
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (r.ok) {
      const j = await r.json();
      const content = j.choices?.[0]?.message?.content;
      return { json: JSON.parse(content), provider: "lovable", model: "google/gemini-2.5-pro" };
    }
    console.error("Lovable AI failed:", r.status, await r.text());
  } catch (e) { console.error("lovable err", e); }

  // Fallback: direct Gemini
  if (GEMINI_API_KEY) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + userPrompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 2500 },
        }),
      }
    );
    const j = await r.json();
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini empty response: " + JSON.stringify(j).slice(0, 300));
    return { json: JSON.parse(text), provider: "gemini-direct", model: "gemini-2.0-flash" };
  }
  throw new Error("No LLM provider available");
}

function guardrailCheck(report: any): { ok: boolean; reason?: string } {
  const flat = JSON.stringify(report).toLowerCase();
  for (const p of PROHIBITED) if (flat.includes(p)) return { ok: false, reason: `prohibited phrase: ${p}` };
  for (const f of PROHIBITED_FIELDS) {
    if (report[f] && report[f] !== null && report[f] !== "") {
      return { ok: false, reason: `prohibited field "${f}" present` };
    }
  }
  if (!report.ai_position_observation) return { ok: false, reason: "missing ai_position_observation" };
  if (!Array.isArray(report.what_ai_can_tell_you)) return { ok: false, reason: "missing what_ai_can_tell_you" };
  return { ok: true };
}

async function logAudit(supabase: any, event_type: string, actor_id: string | null, resource_id: string, payload: any) {
  try {
    await supabase.from("audit_events").insert({
      event_type, actor_id, resource_type: "query", resource_id, payload,
    });
  } catch (e) { console.error("audit log failed", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { query_id } = await req.json();
    if (!query_id) throw new Error("query_id required");

    // a) Fetch query
    const { data: query, error: qErr } = await supabase
      .from("queries").select("*").eq("id", query_id).single();
    if (qErr || !query) throw new Error("Query not found");

    // b) Classify intent
    const intent = await classifyIntent(query.query_text);

    // c) Fetch live data (if stock-specific)
    const stockData = ["buy_decision", "stuck_position", "should_average"].includes(intent) && query.stock_symbol
      ? await fetchStockData(query.stock_symbol)
      : null;

    // P&L state
    const ltp = stockData?.ltp ?? query.current_price;
    const pnl_state = computePnlState(query.buy_price, ltp);

    // d) Build context
    const userPrompt = `
INTENT: ${intent}
PNL_STATE: ${pnl_state}
USER_QUESTION: "${query.query_text}"
GROUND_TRUTH_DATA:
  stock_symbol: ${query.stock_symbol ?? "n/a"}
  exchange: ${stockData?.exchange ?? "n/a"}
  ltp: ${stockData?.ltp ?? "data not available"}
  ltp_timestamp: ${stockData?.ltp_timestamp ?? "n/a"}
  52w_high: ${stockData?.fifty_two_week_high ?? "n/a"}
  52w_low: ${stockData?.fifty_two_week_low ?? "n/a"}
  user_buy_price: ${query.buy_price ?? "n/a"}
  recent_headlines: []  (news API not configured yet)
USER_CONTEXT:
  holding_duration: ${query.query_type ?? "n/a"}
`;

    // e) LLM
    const llm = await callLLM(userPrompt);

    // f) Guardrail
    const guard = guardrailCheck(llm.json);
    if (!guard.ok) {
      console.error("GUARDRAIL REJECTION:", guard.reason, JSON.stringify(llm.json).slice(0, 500));
      throw new Error(`Guardrail rejected: ${guard.reason}`);
    }

    // Wrap with meta
    const renderedSections = {
      ...llm.json,
      stock_symbol: query.stock_symbol,
      stock_name: query.stock_name,
      ltp_value: stockData?.ltp ?? null,
      ltp_timestamp: stockData?.ltp_timestamp ?? null,
      ltp_source: stockData?.source ?? null,
      ltp_exchange: stockData?.exchange ?? null,
      pnl_state,
      intent,
      report_id: crypto.randomUUID(),
      generated_at: new Date().toISOString(),
    };

    // g) Save to ai_reports
    const { data: aiRow, error: arErr } = await supabase.from("ai_reports").insert({
      query_id,
      user_id: query.user_id,
      intent,
      stock_symbol: query.stock_symbol,
      stock_exchange: stockData?.exchange ?? null,
      ltp_value: stockData?.ltp ?? null,
      ltp_timestamp: stockData?.ltp_timestamp ?? null,
      ltp_source: stockData?.source ?? null,
      pnl_state,
      prompt_version: PROMPT_VERSION,
      llm_provider: llm.provider,
      llm_model: llm.model,
      raw_llm_response: llm.json,
      rendered_sections: renderedSections,
      requires_analyst_review: true,
      analyst_assigned_id: query.assigned_analyst_id,
      generated_at: new Date().toISOString(),
    }).select("id").single();
    if (arErr) console.error("ai_reports insert err:", arErr);

    // h) Update queries with report + intent + pnl
    await supabase.from("queries").update({
      ai_report: renderedSections,
      intent,
      pnl_state,
      status: "ai_answered",
    }).eq("id", query_id);

    // i) Audit
    await logAudit(supabase, "ai_report_generated", query.user_id, query_id, {
      ai_report_id: aiRow?.id, intent, pnl_state, provider: llm.provider,
    });

    return new Response(JSON.stringify({ ok: true, report: renderedSections, ai_report_id: aiRow?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("generate-ai-report error:", msg);
    return new Response(JSON.stringify({ ok: false, error: "Report generation failed", details: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
