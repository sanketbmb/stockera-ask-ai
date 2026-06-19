// @ts-nocheck
// Stockera ask-claude — Stage 1 backend foundation for shared chat system.
// Modes: 'report_followup' (bound to ai_reports row) and 'homepage_assistant'.
// Fallback chain: Claude → Gemini-direct → Lovable-Gemini.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { routeMessage } from "../_shared/deterministic_router.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const LLM_PROVIDER = Deno.env.get("LLM_PROVIDER") ?? "claude";
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-3-5-sonnet-latest";

// ₹5,000 / day @ ~83 INR/USD ≈ USD 60.24
const CLAUDE_DAILY_CAP_USD = 60.24;

// Stage-1 flat per-user daily message cap (Plus/Pro tiers wired in Stage 2).
const DAILY_USER_MSG_CAP = 15;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const REPORT_FOLLOWUP_SYSTEM = `You are Stockera's read-only report explainer.
You are explaining a deterministic research report that has already been generated. You do NOT generate research. You do NOT generate new verdicts, new prices, new targets, new stop-losses, new entry zones, or new trade plans.
You may only explain, paraphrase, translate, or expand on fields already present in the provided projected report JSON.
If a field the user asks about is missing or null in the projected JSON, respond exactly: "Our engine has not produced [X] for this query, so I cannot speculate. The available analysis covers [Y]." — replacing [X] and [Y] with the relevant field names from the JSON.
If the user asks "Should I buy/sell/hold?" — do NOT answer directly. Instead explain final_verdict.action and final_verdict.summary_reason, and remind the user that the final judgment rests with a SEBI-registered analyst.
When quoting any number, cite the exact JSON field name in parentheses, e.g. "The engine reports an RSI of 43.21 (technical_snapshot.rsi)."
If audit_meta.verdict_suppressed = true, you must NOT unsuppress, override, or contradict the suppression — explain why suppression was applied using audit_meta.suppressed_reason and audit_meta.suppressed_rule_id.
Refuse insider tips, guaranteed returns, and pump-and-dump narratives. SEBI compliance is non-negotiable.`;

const HOMEPAGE_ASSISTANT_SYSTEM = `You are Stockera's homepage assistant. Help users understand market concepts, product features, and general investing education. You MUST NOT give personalized stock advice, targets, stop-losses, or live prices. If the user asks about a specific stock action, instruct them to use Ask Anything. No guaranteed returns. No insider claims. Keep replies under 200 words.`;

const REFUSAL_MSG =
  "I can't help with that — it looks like a request for insider tips, guaranteed returns, or unsafe trading patterns. Stockera is SEBI-compliance-aware; we don't provide such guidance.";

const HANDOFF_MSG =
  "This looks like a specific stock or market question. Please use **Ask Anything** so we can generate a full report (and route it to a SEBI-registered analyst if you'd like a human review).";

// ---------- LLM callers ----------

async function callClaude(
  system: string,
  userMessage: string,
  history: Array<{role: string; content: string}>,
  opts?: { model?: string; max_tokens?: number; temperature?: number },
) {
  const messages = [...history, { role: "user", content: userMessage }];
  const modelToUse = opts?.model ?? CLAUDE_MODEL;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelToUse,
      max_tokens: opts?.max_tokens ?? 800,
      temperature: opts?.temperature,
      system,
      messages,
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Claude HTTP ${r.status}: ${j?.error?.message ?? "unknown"}`);
  const text = j?.content?.[0]?.text ?? "";
  if (!text) throw new Error("Claude returned empty content");
  const inputTokens = j?.usage?.input_tokens ?? null;
  const outputTokens = j?.usage?.output_tokens ?? null;
  // Claude Sonnet 3.5 pricing: $3 / 1M input, $15 / 1M output
  const cost = inputTokens && outputTokens
    ? (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15
    : null;
  return {
    text,
    provider: "claude",
    model: modelToUse,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
  };
}

async function callGeminiDirect(system: string, userMessage: string, history: Array<{role: string; content: string}>) {
  const contents = [
    ...history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    { role: "user", parts: [{ text: userMessage }] },
  ];
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
      }),
    },
  );
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${j?.error?.message ?? "unknown"}`);
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Gemini returned no content");
  const usage = j?.usageMetadata ?? {};
  return {
    text,
    provider: "gemini-direct",
    model: "gemini-2.5-flash",
    input_tokens: usage.promptTokenCount ?? null,
    output_tokens: usage.candidatesTokenCount ?? null,
    cost_usd: null,
  };
}

async function callLovableGemini(system: string, userMessage: string, history: Array<{role: string; content: string}>) {
  const messages = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: userMessage },
  ];
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      temperature: 0.4,
      max_tokens: 800,
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Lovable Gemini HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const text = j?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Lovable Gemini returned no content");
  const usage = j?.usage ?? {};
  return {
    text,
    provider: "lovable-gemini",
    model: "google/gemini-2.5-flash",
    input_tokens: usage.prompt_tokens ?? null,
    output_tokens: usage.completion_tokens ?? null,
    cost_usd: null,
  };
}

async function runFallbackChain(opts: {
  system: string;
  userMessage: string;
  history: Array<{role: string; content: string}>;
  skipClaude: boolean;
  claudeOverrides?: { model?: string; max_tokens?: number; temperature?: number };
}) {
  const { system, userMessage, history, skipClaude, claudeOverrides } = opts;
  let claudeUsed = !skipClaude;

  if (!skipClaude && LLM_PROVIDER === "claude" && ANTHROPIC_API_KEY) {
    const resolvedModel = claudeOverrides?.model ?? CLAUDE_MODEL;
    console.log("CLAUDE_MODEL_RESOLVED", resolvedModel);
    try {
      const out = await callClaude(system, userMessage, history, claudeOverrides);
      return { ...out, claudeUsed: true };
    } catch (e) {
      console.warn("CLAUDE_FAIL_FALLBACK_TO_GEMINI_DIRECT", (e as Error).message);
      claudeUsed = false;
    }
  }
  if (GEMINI_API_KEY) {
    try {
      const out = await callGeminiDirect(system, userMessage, history);
      return { ...out, claudeUsed };
    } catch (e) {
      console.warn("GEMINI_DIRECT_FAIL_FALLBACK_TO_LOVABLE", (e as Error).message);
    }
  }
  if (LOVABLE_API_KEY) {
    const out = await callLovableGemini(system, userMessage, history);
    return { ...out, claudeUsed };
  }
  throw new Error("llm_unavailable");
}

// ---------- Handler ----------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Step 1: Auth
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user?.id) return json({ error: "unauthorized" }, 401);
  const user_id = userRes.user.id;

  // Step 2: Validate body
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const mode = body?.mode;
  if (mode !== "report_followup" && mode !== "homepage_assistant") {
    return json({ error: "invalid_mode" }, 400);
  }
  const user_message = String(body?.user_message ?? "").trim();
  if (user_message.length < 1 || user_message.length > 2000) {
    return json({ error: "invalid_user_message" }, 400);
  }
  const query_id = body?.query_id ?? null;
  if (mode === "report_followup" && !query_id) {
    return json({ error: "query_id_required_for_report_followup" }, 400);
  }
  const thread_id = body?.thread_id ?? crypto.randomUUID();
  const parent_followup_id = body?.parent_followup_id ?? null;

  // Step 3: Rate limit
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: userMsgCount } = await supabase
    .from("ai_followups")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user_id)
    .eq("role", "user")
    .gte("created_at", since);
  if ((userMsgCount ?? 0) >= DAILY_USER_MSG_CAP) {
    return json({ error: "daily_limit_reached", limit: DAILY_USER_MSG_CAP }, 429);
  }

  // Stage 2 — per-thread (10) and per-day (50) caps for report_followup only.
  // Option A: HTTP 429 with NO row insert to ai_followups.
  if (mode === "report_followup") {
    const { count: threadCount } = await supabase
      .from("ai_followups")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", thread_id)
      .eq("user_id", user_id)
      .eq("role", "user");
    if ((threadCount ?? 0) >= 10) {
      return json({ error: "thread_limit_reached", limit: 10 }, 429);
    }
    const { count: dayCount } = await supabase
      .from("ai_followups")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("role", "user")
      .eq("conversation_mode", "report_followup")
      .gte("created_at", since);
    if ((dayCount ?? 0) >= 50) {
      return json({ error: "daily_limit_reached", limit: 50 }, 429);
    }
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // Step 4: Insert user message
  const { error: insertUserErr } = await supabase.from("ai_followups").insert({
    conversation_mode: mode,
    thread_id,
    parent_followup_id,
    query_id: mode === "report_followup" ? query_id : null,
    user_id,
    role: "user",
    content: user_message,
    ip_address: ip,
  });
  if (insertUserErr) {
    console.error("INSERT_USER_ROW_FAIL", insertUserErr);
    return json({ error: "persist_failed", detail: insertUserErr.message }, 500);
  }

  // Step 5: Deterministic router
  const route = routeMessage(mode, user_message);
  console.warn("ASK_CLAUDE_ROUTING", {
    mode, user_id, route_action: route.action, reason: route.reason, thread_id,
  });

  if (route.action === "refused_unsafe") {
    const { data: row, error } = await supabase.from("ai_followups").insert({
      conversation_mode: mode,
      thread_id,
      query_id: mode === "report_followup" ? query_id : null,
      user_id,
      role: "assistant",
      content: REFUSAL_MSG,
      route_decision: "refused_unsafe",
      ip_address: ip,
    }).select("id").single();
    if (error) return json({ error: "persist_failed", detail: error.message }, 500);
    return json({
      ok: true, thread_id, followup_id: row.id, content: REFUSAL_MSG,
      sources_used: [], llm_provider: null, llm_model: null,
      route_decision: "refused_unsafe", routed_query_id: null,
    });
  }

  if (route.action === "routed_to_ask_anything") {
    const { data: row, error } = await supabase.from("ai_followups").insert({
      conversation_mode: mode,
      thread_id,
      query_id: mode === "report_followup" ? query_id : null,
      user_id,
      role: "assistant",
      content: HANDOFF_MSG,
      route_decision: "routed_to_ask_anything",
      ip_address: ip,
    }).select("id").single();
    if (error) return json({ error: "persist_failed", detail: error.message }, 500);
    return json({
      ok: true, thread_id, followup_id: row.id, content: HANDOFF_MSG,
      sources_used: [], llm_provider: null, llm_model: null,
      route_decision: "routed_to_ask_anything", routed_query_id: null,
    });
  }

  // Step 6: Daily Claude cap check
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();
  let claudeSpendToday = 0;
  const { data: rep } = await supabase
    .from("ai_reports")
    .select("llm_cost_usd")
    .eq("llm_provider", "claude")
    .gte("created_at", todayIso);
  if (Array.isArray(rep)) {
    for (const r of rep) claudeSpendToday += Number(r.llm_cost_usd ?? 0);
  }
  const { data: fu } = await supabase
    .from("ai_followups")
    .select("llm_cost_usd")
    .eq("llm_provider", "claude")
    .gte("created_at", todayIso);
  if (Array.isArray(fu)) {
    for (const r of fu) claudeSpendToday += Number(r.llm_cost_usd ?? 0);
  }
  const skipClaude = claudeSpendToday >= CLAUDE_DAILY_CAP_USD;
  if (skipClaude) console.warn("DAILY_CAP_HIT_SKIP_CLAUDE", { spend_usd: claudeSpendToday });

  // Step 7: Build context
  let system = mode === "report_followup" ? REPORT_FOLLOWUP_SYSTEM : HOMEPAGE_ASSISTANT_SYSTEM;
  const historyLimit = mode === "report_followup" ? 8 : 6;
  const { data: histRows } = await supabase
    .from("ai_followups")
    .select("role,content,created_at")
    .eq("thread_id", thread_id)
    .order("created_at", { ascending: false })
    .limit(historyLimit + 1); // includes the just-inserted user row
  const history = (histRows ?? [])
    .filter((r) => r.content !== user_message || r.role !== "user")
    .reverse()
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({ role: r.role, content: r.content }));

  if (mode === "report_followup") {
    const { data: report, error: repErr } = await supabase
      .from("ai_reports")
      .select("*")
      .eq("query_id", query_id)
      .maybeSingle();
    if (repErr || !report) return json({ error: "report_not_found" }, 404);
    const reportContext = `\n\n=== AI REPORT CONTEXT (read-only) ===\n${JSON.stringify(report).slice(0, 6000)}\n=== END REPORT CONTEXT ===`;
    system = system + reportContext;
  }

  // Step 8: Call LLM with fallback
  let llm;
  try {
    llm = await runFallbackChain({ system, userMessage: user_message, history, skipClaude });
  } catch (e) {
    console.error("LLM_UNAVAILABLE", (e as Error).message);
    return json({ error: "llm_unavailable" }, 503);
  }

  const routeDecision = !llm.claudeUsed ? "fallback_used" : "answered_direct";

  // Step 9: Persist assistant
  const { data: arow, error: aerr } = await supabase.from("ai_followups").insert({
    conversation_mode: mode,
    thread_id,
    query_id: mode === "report_followup" ? query_id : null,
    user_id,
    role: "assistant",
    content: llm.text,
    sources_used: [],
    route_decision: routeDecision,
    llm_provider: llm.provider,
    llm_model: llm.model,
    llm_input_tokens: llm.input_tokens,
    llm_output_tokens: llm.output_tokens,
    llm_cost_usd: llm.cost_usd,
    ip_address: ip,
  }).select("id").single();
  if (aerr) return json({ error: "persist_failed", detail: aerr.message }, 500);

  // Step 10: Return
  return json({
    ok: true,
    thread_id,
    followup_id: arow.id,
    content: llm.text,
    sources_used: [],
    llm_provider: llm.provider,
    llm_model: llm.model,
    route_decision: routeDecision,
    routed_query_id: null,
  });
});
