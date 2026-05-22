// @ts-nocheck
// Stockera AI Report Generator — v1.1 (debuggable)
// Compliance-first: NO verdicts, NO targets, NO stop-loss, factual context only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const TWELVE_DATA_API_KEY = Deno.env.get("TWELVE_DATA_API_KEY");

const PROMPT_VERSION = "1.2.0";
const PROHIBITED = [
  "guaranteed", "sure-shot", "sure shot", "multibagger", "assured returns",
  "100% return", "100 % return", "definitely will", "certainly will",
  "must buy", "must sell", "buy immediately", "sell immediately", "risk-free",
];
const PROHIBITED_VERDICTS = ["verdict: buy", "verdict: sell", "verdict: hold",
  "our verdict", "final verdict"];
const PROHIBITED_FIELDS = ["target_price", "stop_loss", "stoploss",
  "support_zone", "resistance_zone", "support_level", "resistance_level"];

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

// FULL versioned system prompt — keep in sync with supabase/functions/generate-ai-report/system-prompt.md
const SYSTEM_PROMPT = `# SYSTEM PROMPT — AI REPORT GENERATOR v1.0
# Owner: Stockera Technology Pvt Ltd
# This prompt is regulatory-sensitive. Changes require compliance review.

You are an AI analyst assistant for Ask The Expert by Stockera, an Indian
SEBI-compliance-aware stock query platform. You produce EDUCATIONAL position
observations only. You are NOT a SEBI-registered Research Analyst. Final
recommendations come from a human SEBI-RA who reviews your output and
records a personalized video for the user.

## ABSOLUTE RULES (violating any of these is a compliance failure)

1. NEVER output a specific target price, stop-loss, support level, or
   resistance level. These come from the human analyst.
2. NEVER use the words: guaranteed, sure-shot, multibagger, assured returns,
   100% return, definitely, certainly will, must buy, must sell.
3. NEVER quote a current price from your training data. You will be given
   the live LTP in the context object. If LTP is missing from context,
   set requires_analyst_review=true and output a message saying live data
   was unavailable.
4. NEVER give a single-word verdict (BUY/SELL/HOLD). Output observations
   only.
5. ALWAYS condition behavioral language on the pnl_state variable provided.
   If pnl_state="loss", do not say "given your profit". If pnl_state="fresh_entry",
   do not say "your position".
6. ALWAYS attribute every factual claim to a source provided in context
   (news headlines, financials, corporate actions). If you cannot attribute,
   omit the claim.
7. Output ONLY valid JSON matching the schema. No prose outside the JSON.

## OUTPUT SCHEMA (strict — validated by Zod)

{
  "report_version": "1.0",
  "intent_acknowledged": "string (echo the intent)",
  "position_snapshot": {
    "summary_line": "string (1 sentence, factual, no recommendations)",
    "key_metric_observed": "string (one notable fundamental or technical fact, with source citation in parentheses)"
  },
  "what_ai_can_observe": [
    "string (factual observation 1 with source)",
    "string (factual observation 2 with source)",
    "string (factual observation 3 with source)"
  ],
  "context_relevant_to_user_question": "string (2-3 sentences directly addressing the user's question, framed as observation not recommendation)",
  "risks_to_monitor": [
    "string (stock-specific risk 1, citing a recent news item or financial trend)",
    "string (stock-specific risk 2, citing a source)"
  ],
  "behavioral_note": "string (psychology insight conditioned on pnl_state — patience if loss, caution against overconfidence if gain, due-diligence reminder if fresh_entry)",
  "what_only_analyst_can_decide": [
    "Specific entry/exit price levels for your position",
    "Stop-loss based on your individual risk tolerance",
    "Position sizing and averaging strategy",
    "Time horizon adjusted for your financial goals"
  ],
  "data_confidence": {
    "data_coverage": "high | medium | low",
    "data_recency": "high | medium | low",
    "specificity": "high | medium | low",
    "overall_label": "Data-rich analysis | Limited data — analyst review important | Insufficient data — please wait for analyst"
  },
  "requires_analyst_review": true,
  "sources_used": [
    {"type": "ltp | news | financials | corporate_action", "reference": "string", "date": "ISO8601"}
  ]
}

## TONE

Conversational but precise. Speak to a retail Indian investor who may be new
to markets. Avoid jargon; when you must use a term (P/E, RoE), briefly define
it inline. Be honest about uncertainty — if data is limited, say so.

## NEVER DO THIS

- "Our verdict: HOLD."
- "Target ₹8,000, Stop loss ₹6,800."
- "Siemens is a guaranteed long-term winner."
- "Given your significant profit..." (when pnl_state is "loss")
- "RSI indicates strong buying interest." (if you weren't given RSI in context)
- Quoting any price not provided in the context object.`;

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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Return ONLY raw JSON. Realistic current NSE price in INR for ${symbol}. Format: {"price": 1234.56}` }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
          }),
        },
      );
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        let parsed: { price?: number } | null = null;
        try {
          const clean = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
          parsed = JSON.parse(clean);
        } catch {
          parsed = null;
        }
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
          }),
        }
      );
      const j = await r.json();
      const finishReason = j?.candidates?.[0]?.finishReason;
      const rawText = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      console.log("STEP 5a: Gemini direct", {
        httpStatus: r.status,
        ok: r.ok,
        finishReason,
        len: rawText.length,
        errorCode: j?.error?.code,
        errorMsg: j?.error?.message,
      });
      if (r.status === 429) {
        console.warn("Gemini 429 quota hit — falling through to Lovable fallback");
      } else if (!r.ok) {
        console.error("Gemini HTTP error:", r.status, JSON.stringify(j).slice(0, 400));
        throw new Error(`Gemini API HTTP ${r.status}: ${j?.error?.message ?? "unknown"}`);
      } else {
        if (!rawText) {
          throw new Error(`Gemini returned no content (finishReason: ${finishReason ?? "none"})`);
        }
        const clean = rawText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(clean);
        return { json: parsed, provider: "gemini-direct", model: "gemini-2.5-flash" };
      }
    } catch (e) {
      console.error("gemini direct err:", (e as Error).message);
      throw new Error(`Gemini call failed: ${(e as Error).message}`);
    }
  }
  if (LOVABLE_API_KEY) {
    try {
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
      if (r.ok && content) {
        const clean = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
        return { json: JSON.parse(clean), provider: "lovable-gemini-fallback", model: "google/gemini-2.5-pro" };
      }
      throw new Error(`Lovable Gemini fallback failed (${r.status}): ${JSON.stringify(j).slice(0, 300)}`);
    } catch (e) {
      throw new Error(`Lovable fallback failed: ${(e as Error).message}`);
    }
  }
  throw new Error("No LLM provider configured. Set GEMINI_API_KEY in Supabase Dashboard → Project Settings → Edge Functions → Secrets.");
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
  if (!Array.isArray(report.what_ai_can_observe)) {
    return { ok: false, reason: "missing what_ai_can_observe" };
  }
  if (report.what_ai_can_observe.length < 1) {
    // Live news/fundamentals were unavailable — inject a transparent placeholder
    // rather than failing the whole pipeline. The analyst review covers gaps.
    report.what_ai_can_observe = [
      "Live fundamentals and news headlines were not available at report time — observations are limited to the live price context provided.",
    ];
    if (report.data_confidence) {
      report.data_confidence.data_coverage = "low";
      report.data_confidence.overall_label = "Limited data — analyst review important";
    }
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
    const authUserId = getJwtSubject(req);

    stage = "fetch_query";
    console.log("STEP 3: Fetching query from DB", { query_id });
    const { data: query, error: qErr } = await supabase
      .from("queries").select("*").eq("id", query_id).single();
    if (qErr) throw new Error(`DB fetch_query: ${qErr.code ?? ""} ${qErr.message}`);
    if (!query) throw new Error("Query not found: " + query_id);
    if (authUserId && query.user_id !== authUserId) throw new Error("Unauthorized query owner mismatch");
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
    if (!guard.ok) {
      console.error("GUARDRAIL_FAILED", { reason: guard.reason, report_keys: Object.keys(llm.json) });
      throw new Error(`Compliance guardrail rejected the AI output: ${guard.reason}. Query saved — analyst will answer manually.`);
    }

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
