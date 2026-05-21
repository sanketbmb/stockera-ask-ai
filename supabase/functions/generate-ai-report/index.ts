// @ts-nocheck
// Stockera AI Report Generator — v1.1 (debuggable)
// Compliance-first: NO verdicts, NO targets, NO stop-loss, factual context only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const TWELVE_DATA_API_KEY = Deno.env.get("TWELVE_DATA_API_KEY");

const PROMPT_VERSION = "1.1.0";
const PROHIBITED = [
  "guaranteed", "sure-shot", "sure shot", "multibagger", "assured returns",
  "100% return", "100 % return", "definitely will", "certainly will",
  "must buy", "must sell", "buy immediately", "sell immediately", "risk-free",
];
const PROHIBITED_VERDICTS = ["verdict: buy", "verdict: sell", "verdict: hold",
  "our verdict", "final verdict"];
const PROHIBITED_FIELDS = ["target", "target_price", "stop_loss", "stoploss",
  "support_zone", "resistance_zone", "support_level", "resistance_level", "verdict"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(stage: string, err: unknown, code = "UNKNOWN", status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error("REPORT_GEN_ERROR", JSON.stringify({
    stage, code, message, stack, timestamp: new Date().toISOString(),
  }));
  return jsonResponse({
    ok: false,
    error: true,
    stage,
    code,
    message,
    hint: "Check Supabase Edge Function logs for full stack trace",
  }, status);
}

function getJwtSubject(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "=");
    return JSON.parse(atob(padded))?.sub ?? null;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `# SYSTEM PROMPT — AI REPORT GENERATOR v1.0
# Owner: Stockera Technology Pvt Ltd

You are an AI analyst assistant for Ask The Expert by Stockera, an Indian SEBI-compliance-aware stock query platform. You produce EDUCATIONAL position observations only. You are NOT a SEBI-registered Research Analyst. Final recommendations come from a human SEBI-RA who reviews your output and records a personalized video for the user.

## ABSOLUTE RULES
1. NEVER output a specific target price, stop-loss, support level, or resistance level.
2. NEVER use the words: guaranteed, sure-shot, multibagger, assured returns, 100% return, definitely, certainly will, must buy, must sell.
3. NEVER quote a current price from your training data. Use the live LTP in context. If LTP missing, set requires_analyst_review=true.
4. NEVER give a single-word verdict (BUY/SELL/HOLD). Output observations only.
5. ALWAYS condition behavioral language on pnl_state.
6. Output ONLY valid JSON matching the schema. No prose outside the JSON.

## OUTPUT SCHEMA (strict)
{
  "report_version": "1.0",
  "intent_acknowledged": "string",
  "position_snapshot": { "summary_line": "string", "key_metric_observed": "string" },
  "what_ai_can_observe": ["string", "string", "string"],
  "context_relevant_to_user_question": "string",
  "risks_to_monitor": ["string"],
  "behavioral_note": "string",
  "what_only_analyst_can_decide": ["string"],
  "data_confidence": {
    "data_coverage": "high | medium | low",
    "data_recency": "high | medium | low",
    "specificity": "high | medium | low",
    "overall_label": "Data-rich analysis | Limited data — analyst review important | Insufficient data — please wait for analyst"
  },
  "requires_analyst_review": true,
  "sources_used": [{"type": "ltp | news | financials | corporate_action", "reference": "string", "date": "ISO8601"}]
}`;

function computePnlState(buyPrice, currentPrice) {
  if (!buyPrice) return "fresh_entry";
  if (!currentPrice) return "n/a";
  const pct = ((currentPrice - buyPrice) / buyPrice) * 100;
  if (pct < -1) return "loss";
  if (pct < 5) return "small_gain";
  return "significant_gain";
}

function classifyIntent(question: string): string {
  const lower = (question || "").toLowerCase();
  if (/\b(crypto|bitcoin|us stock|nasdaq|real estate|property)\b/.test(lower)) return "out_of_scope";
  if (/\b(should i (buy|enter)|fresh entry|entry point|invest in)\b/.test(lower)) return "buy_decision";
  if (/\b(average|averaging|buy more|double down)\b/.test(lower)) return "should_average";
  if (/\b(sell|exit|book profit|hold|stuck|loss)\b/.test(lower)) return "stuck_position";
  if (/\b(explain|what is|how does|teach|learn)\b/.test(lower)) return "educational";
  if (/\b(sector|industry|best stocks in)\b/.test(lower)) return "sector_view";
  return "stuck_position";
}

async function fetchStockData(symbol: string) {
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
          source: "Twelve Data",
          exchange: "NSE",
        };
      }
      console.log("STEP 4a: Twelve Data returned no usable data", { symbol, code: j?.code, status: j?.status });
    }
  } catch (e) { console.error("twelvedata error", e); }
  if (GEMINI_API_KEY) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Return ONLY raw JSON. Realistic current NSE price in INR for ${symbol}. Format: {"price": 1234.56}` }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 200 },
          }),
        },
      );
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        if (parsed?.price) {
          return {
            ltp: Number(parsed.price),
            ltp_timestamp: new Date().toISOString(),
            source: "Gemini estimate",
            exchange: "NSE",
          };
        }
      }
    } catch (e) { console.error("gemini ltp fallback err", e); }
  }
  return { ltp: null, ltp_timestamp: null, source: "unavailable", exchange: "NSE" };
}

async function callLLM(userPrompt: string) {
  if (GEMINI_API_KEY) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + userPrompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 8192 },
          }),
        }
      );
      const j = await r.json();
      const finishReason = j?.candidates?.[0]?.finishReason;
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log("STEP 5a: Gemini direct", { ok: r.ok, finishReason, len: text?.length ?? 0 });
      if (r.ok && text) return { json: JSON.parse(text), provider: "gemini-direct", model: "gemini-2.0-flash" };
      console.error("Gemini direct failed:", r.status, JSON.stringify(j).slice(0, 500));
    } catch (e) { console.error("gemini direct err", e); }
  }
  if (LOVABLE_API_KEY) {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    const j = await r.json().catch(() => null);
    const content = j?.choices?.[0]?.message?.content;
    console.log("STEP 5b: Lovable Gemini fallback", { ok: r.ok, len: content?.length ?? 0 });
    if (r.ok && content) return { json: JSON.parse(content), provider: "lovable-gemini-fallback", model: "google/gemini-2.5-pro" };
    throw new Error(`Lovable Gemini fallback failed (${r.status}): ${JSON.stringify(j).slice(0, 300)}`);
  }
  throw new Error("No LLM provider available (missing LOVABLE_API_KEY and GEMINI_API_KEY)");
}

function guardrailCheck(report) {
  const flat = JSON.stringify(report).toLowerCase();
  for (const p of PROHIBITED) if (flat.includes(p)) return { ok: false, reason: `prohibited phrase: ${p}` };
  for (const v of PROHIBITED_VERDICTS) if (flat.includes(v)) return { ok: false, reason: `verdict phrase: ${v}` };
  for (const f of PROHIBITED_FIELDS) {
    if (report[f] !== undefined && report[f] !== null && report[f] !== "") {
      return { ok: false, reason: `prohibited field "${f}" present` };
    }
  }
  if (!report.position_snapshot?.summary_line) return { ok: false, reason: "missing position_snapshot.summary_line" };
  if (!Array.isArray(report.what_ai_can_observe) || report.what_ai_can_observe.length < 1) {
    return { ok: false, reason: "missing what_ai_can_observe" };
  }
  if (!report.context_relevant_to_user_question) return { ok: false, reason: "missing context_relevant_to_user_question" };
  if (!Array.isArray(report.what_only_analyst_can_decide)) return { ok: false, reason: "missing what_only_analyst_can_decide" };
  if (!report.data_confidence?.overall_label) return { ok: false, reason: "missing data_confidence.overall_label" };
  if (report.requires_analyst_review !== true) return { ok: false, reason: "requires_analyst_review must be true" };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET = health check
  if (req.method === "GET") {
    const checks = {
      gemini_key_set: !!GEMINI_API_KEY,
      lovable_key_set: !!LOVABLE_API_KEY,
      db_url_set: !!SUPABASE_URL,
      service_key_set: !!SERVICE_KEY,
      twelve_data_set: !!TWELVE_DATA_API_KEY,
    };
    const tables = { ai_reports_exists: false, audit_events_exists: false };
    try {
      if (SUPABASE_URL && SERVICE_KEY) {
        const sb = createClient(SUPABASE_URL, SERVICE_KEY);
        const a = await sb.from("ai_reports").select("id", { count: "exact", head: true });
        tables.ai_reports_exists = !a.error;
        const b = await sb.from("audit_events").select("id", { count: "exact", head: true });
        tables.audit_events_exists = !b.error;
      }
    } catch (e) { console.error("health-check tables err", e); }
    return jsonResponse({ status: "ok", env_check: checks, tables_check: tables });
  }

  let stage = "init";
  let query_id: string | undefined;
  try {
    stage = "parse_body";
    const body = await req.json().catch(() => ({}));
    query_id = body?.query_id;
    console.log("STEP 1: Function invoked", { query_id, method: req.method });

    stage = "env_check";
    console.log("STEP 2: Env vars", {
      has_gemini_key: !!GEMINI_API_KEY,
      has_lovable_key: !!LOVABLE_API_KEY,
      has_supabase_url: !!SUPABASE_URL,
      has_service_role: !!SERVICE_KEY,
    });
    if (!query_id) throw new Error("query_id required in request body");
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY && !GEMINI_API_KEY) throw new Error("Missing LOVABLE_API_KEY and GEMINI_API_KEY — at least one is required");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    stage = "fetch_query";
    console.log("STEP 3: Fetching query from DB", { query_id });
    const { data: query, error: qErr } = await supabase
      .from("queries").select("*").eq("id", query_id).single();
    if (qErr) throw new Error(`DB fetch_query: ${qErr.code ?? ""} ${qErr.message}`);
    if (!query) throw new Error("Query not found: " + query_id);
    console.log("STEP 4: Query fetched", { stock: query.stock_symbol, intent_text: query.query_text?.slice(0, 60) });

    const intent = classifyIntent(query.query_text);

    stage = "fetch_ltp";
    const stockData = ["buy_decision", "stuck_position", "should_average"].includes(intent) && query.stock_symbol
      ? await fetchStockData(query.stock_symbol)
      : null;
    const ltp = stockData?.ltp ?? query.current_price ?? null;
    const pnl_state = computePnlState(query.buy_price, ltp);
    console.log("STEP 4b: LTP resolved", { ltp, source: stockData?.source, pnl_state });

    const pnl_pct = (query.buy_price && ltp)
      ? Number((((ltp - query.buy_price) / query.buy_price) * 100).toFixed(2))
      : null;

    const contextObj = {
      intent,
      user_question: query.query_text,
      stock: {
        symbol: query.stock_symbol ?? null,
        name: query.stock_name ?? null,
        exchange: stockData?.exchange ?? null,
        ltp,
        ltp_timestamp: stockData?.ltp_timestamp ?? null,
        ltp_source: stockData?.source ?? (query.current_price ? "user-provided" : null),
      },
      user_position: {
        buy_price: query.buy_price ?? null,
        holding_duration: query.query_type ?? null,
        pnl_pct,
        pnl_state,
      },
      fundamentals: null,
      recent_news: [],
      recent_corporate_actions: [],
    };
    const userPrompt = "CONTEXT:\n" + JSON.stringify(contextObj, null, 2)
      + "\n\nReturn ONLY the JSON output matching the OUTPUT SCHEMA. No markdown.";

    stage = "llm";
    console.log("STEP 5: Calling LLM");
    const llm = await callLLM(userPrompt);
    console.log("STEP 6: LLM response received", { provider: llm.provider, len: JSON.stringify(llm.json).length });

    stage = "guardrail";
    console.log("STEP 7: Guardrail validation");
    const guard = guardrailCheck(llm.json);
    if (!guard.ok) throw new Error(`Guardrail rejected: ${guard.reason}`);

    const renderedSections = {
      ...llm.json,
      stock_symbol: query.stock_symbol,
      stock_name: query.stock_name,
      ltp_value: ltp,
      ltp_timestamp: stockData?.ltp_timestamp ?? null,
      ltp_source: stockData?.source ?? (query.current_price ? "user-provided" : null),
      ltp_exchange: stockData?.exchange ?? null,
      pnl_state,
      intent,
      report_id: crypto.randomUUID(),
      generated_at: new Date().toISOString(),
    };

    stage = "insert_ai_reports";
    console.log("STEP 8: Inserting into ai_reports");
    const { data: aiRow, error: arErr } = await supabase.from("ai_reports").insert({
      query_id,
      user_id: query.user_id,
      intent,
      stock_symbol: query.stock_symbol,
      stock_exchange: stockData?.exchange ?? null,
      ltp_value: ltp,
      ltp_timestamp: stockData?.ltp_timestamp ?? null,
      ltp_source: stockData?.source ?? (query.current_price ? "user-provided" : null),
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
    if (arErr) throw new Error(`DB insert ai_reports: ${arErr.code ?? ""} ${arErr.message}`);

    stage = "update_queries";
    const { error: upErr } = await supabase.from("queries").update({
      ai_report: renderedSections,
      intent,
      pnl_state,
      status: "ai_answered",
    }).eq("id", query_id);
    if (upErr) throw new Error(`DB update queries: ${upErr.code ?? ""} ${upErr.message}`);

    stage = "audit";
    try {
      await supabase.from("audit_events").insert({
        event_type: "ai_report_generated", actor_id: query.user_id,
        resource_type: "query", resource_id: query_id,
        payload: { ai_report_id: aiRow?.id, intent, pnl_state, provider: llm.provider },
      });
    } catch (e) { console.error("audit log non-fatal:", e); }

    console.log("STEP 9: Returning response", { ai_report_id: aiRow?.id });
    return jsonResponse({ ok: true, report: renderedSections, ai_report_id: aiRow?.id });
  } catch (e) {
    return errorResponse(stage, e, "REPORT_GEN_FAILED");
  }
});
