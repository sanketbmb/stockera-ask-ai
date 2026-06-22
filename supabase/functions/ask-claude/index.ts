// @ts-nocheck
// Stockera ask-claude — Stage 1 backend foundation for shared chat system.
// Modes: 'report_followup' (bound to ai_reports row) and 'homepage_assistant'.
// Fallback chain: Claude → Gemini-direct → Lovable-Gemini.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { routeMessage } from "../_shared/deterministic_router.ts";
import { callMarketauxForClaude, sanitizeTitle } from "../_shared/marketaux-claude-tool.ts";

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

// Stage 2.3 — tool caps
const WEB_SEARCH_DAILY_CAP_PER_USER = 5;
const MARKETAUX_DAILY_CAP_PER_USER = 20;
const TOOL_LOOP_MAX_ITERATIONS = 2;
const TURN_COST_CAP_USD = 0.05;
const WEB_SEARCH_PRICE_USD_PER_1000 = 10; // Anthropic web_search_20250305 ref

// Stage 2.3.2: shared news-keyword detector. Used by Step 6b (predictive
// tool-plan), Step 7 (context shape), and Step 8 (actual tool enable).
const NEWS_KEYWORD_RE = /(news|latest|today|this week|recent|headline|announcement|what(?:'s| is) happening|update on|developments?)/i;



type Citation = {
  title: string;
  url: string;
  source: string;
  published_at?: string;
  tool: "web_search" | "marketaux";
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

async function callClaudeWithTools(opts: {
  system: string;
  userMessage: string;
  history: Array<{ role: string; content: any }>;
  tools: any[];
  model: string;
  max_tokens: number;
  temperature: number;
}) {
  const { system, userMessage, history, tools, model, max_tokens, temperature } = opts;
  let messages: any[] = [...history, { role: "user", content: userMessage }];
  const citations: Citation[] = [];
  let inputTokensTotal = 0;
  let outputTokensTotal = 0;
  let webSearchInvocations = 0;
  let finalText = "";

  for (let iter = 0; iter < TOOL_LOOP_MAX_ITERATIONS; iter++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model, max_tokens, temperature, system, messages,
        tools: tools.length ? tools : undefined,
      }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Claude HTTP ${r.status}: ${j?.error?.message ?? "unknown"}`);
    inputTokensTotal += j?.usage?.input_tokens ?? 0;
    outputTokensTotal += j?.usage?.output_tokens ?? 0;

    const blocks: any[] = Array.isArray(j?.content) ? j.content : [];
    for (const blk of blocks) {
      if (blk?.type === "server_tool_use" && blk?.name === "web_search") {
        webSearchInvocations++;
      }
      if (blk?.type === "web_search_tool_result" && Array.isArray(blk.content)) {
        for (const wr of blk.content) {
          if (wr?.type === "web_search_result" && wr.url) {
            const cleanTitle = sanitizeTitle(wr.title ?? "");
            const desc = String(wr.description ?? wr.snippet ?? "").trim();
            // Bug 3: drop junk citations with no usable title AND no description
            if (!cleanTitle && !desc) continue;
            citations.push({
              title: cleanTitle || (wr.source ? `${wr.source} article` : wr.url),
              url: wr.url,
              source: wr.source ?? "web",
              published_at: wr.page_age ?? wr.published_at ?? "",
              tool: "web_search",
            });
          }
        }
      }

    }

    const toolUseBlocks = blocks.filter((b: any) => b.type === "tool_use");
    if (toolUseBlocks.length === 0) {
      finalText = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      break;
    }
    if (iter >= TOOL_LOOP_MAX_ITERATIONS - 1) {
      const partial = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      finalText = partial || "I've gathered what I can from the tools available. Please refine your question if you need more detail.";
      break;
    }

    const toolResults: any[] = [];
    for (const tb of toolUseBlocks) {
      if (tb.name === "marketaux_news_search") {
        const mr = await callMarketauxForClaude(tb.input ?? {}, "");
        if (mr.ok) {
          for (const a of mr.articles) {
            citations.push({
              title: a.title, url: a.url, source: a.source,
              published_at: a.published_at, tool: "marketaux",
            });
          }
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: tb.id,
          content: JSON.stringify({ ok: mr.ok, articles: mr.articles, error_code: mr.error_code ?? null }),
        });
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tb.id,
          content: JSON.stringify({ ok: false, error: "unknown_tool" }),
        });
      }
    }
    messages = messages.concat(
      { role: "assistant", content: blocks },
      { role: "user", content: toolResults },
    );
  }

  // dedupe citations
  const seen = new Set<string>();
  const dedup = citations.filter((c) => {
    if (!c.url || seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  }).slice(0, 12);

  const baseCost = (inputTokensTotal / 1_000_000) * 3 + (outputTokensTotal / 1_000_000) * 15;
  const toolCost = webSearchInvocations * (WEB_SEARCH_PRICE_USD_PER_1000 / 1000);
  return {
    text: finalText,
    citations: dedup,
    provider: "claude",
    model,
    input_tokens: inputTokensTotal,
    output_tokens: outputTokensTotal,
    cost_usd: baseCost + toolCost,
    web_search_count: webSearchInvocations,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const REPORT_FOLLOWUP_EXPLAIN_SYSTEM = `You are Stockera's professional report explainer. A deterministic research report has already been generated for this query. Your job is to make that report easy to understand for a retail investor in plain English.

ABSOLUTE RULES (non-negotiable):
- Do NOT generate new verdicts, new prices, new targets, new stop-losses, or new entry zones.
- Do NOT recommend buy / sell / hold. Always defer to: 'the final judgment rests with a SEBI-registered analyst.'
- Refuse insider tips, guaranteed returns, pump-and-dump narratives.
- Never reveal internal JSON field paths like 'final_verdict.confidence_pct' to the user. Internal field names are for your reasoning only. Translate every number into plain English.

ANSWER FORMATTING (mandatory):
- Start with a bold 1-line heading summarising the answer.
- Use short paragraphs separated by blank lines.
- Use bullet lists or numbered lists when listing 3+ items.
- Use a markdown table only when comparing 3+ rows × 2+ columns of numbers.
- Plain English everywhere. No JSON path leaks.
- Maximum 350 words unless a table is essential.
- Always end with this exact line:

  ---

  _Educational explainer only. Investment decisions rest with you and your SEBI-registered analyst._

WHEN A FIELD IS MISSING:
Reply with: 'The engine has not produced [the metric the user asked about] for this query. The available analysis covers [list 3-5 plain-English topics from the report].'`;

const REPORT_FOLLOWUP_OPEN_SYSTEM = `You are Stockera's open research assistant. A deterministic research report has been generated and is provided as context. Use it as priming knowledge, but you may also draw on your general knowledge of Indian and global markets, sectors, companies, fundamentals, technicals, news patterns, and investing education.

ABSOLUTE RULES (non-negotiable):
- Do NOT recommend buy / sell / hold. Do NOT give new price targets, stop-losses, or entry zones.
- Do NOT speculate on tomorrow's / next week's price movement.
- Refuse insider tips, guaranteed returns, pump-and-dump narratives.
- If the user asks 'should I buy?' — explain the engine's verdict and remind them the final call rests with a SEBI-registered analyst.
- Never reveal internal JSON field paths to the user. Translate everything into plain English.
- If you don't know something current (e.g. today's news, live price), say so honestly — never fabricate.

ANSWER FORMATTING (mandatory):
- Start with a bold 1-line heading.
- Short paragraphs separated by blank lines.
- Bullet / numbered lists when listing 3+ items.
- Markdown tables when comparing 3+ rows × 2+ columns.
- Plain English. No JSON path leaks.
- Maximum 400 words.
- Always end with this exact line:

  ---

  _Educational explainer only. Investment decisions rest with you and your SEBI-registered analyst._`;

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
  const followup_mode: "explain" | "open" = body?.followup_mode === "open" ? "open" : "explain";


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
    const since = new Date(Date.now() - 86_400_000).toISOString();
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

  // Stage 3A: Open-mode wallet preflight (20 pts) — founder_beta bypass.
  // INVARIANT: Explain mode is FREE. Never preflight, never debit.
  const OPEN_FOLLOWUP_COST_PTS = 20;
  const isExplainFollowup = mode === "report_followup" && followup_mode === "explain";
  let isBeta = false;
  if (!isExplainFollowup && mode === "report_followup" && followup_mode === "open") {
    const { data: prof } = await supabase
      .from("profiles").select("founder_beta").eq("id", user_id).maybeSingle();
    isBeta = (prof as any)?.founder_beta === true;
    if (!isBeta) {
      const { data: wb } = await supabase
        .from("wallet_balances").select("balance").eq("user_id", user_id).maybeSingle();
      const bal = Number((wb as any)?.balance ?? 0);
      if (bal < OPEN_FOLLOWUP_COST_PTS) {
        return json({
          error: "insufficient_points",
          points_required: OPEN_FOLLOWUP_COST_PTS,
          points_available: bal,
          paywall: true,
        }, 402);
      }
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

  // Stage 2.3 — CTA deep-link routes (report_followup only)

  const ctaPlan: { cta_action: "stock_picker" | "educational_report" | "sector_report"; text: string; url: string; label: string } | null =
    mode === "report_followup"
      ? route.action === "routed_to_stock_picker"
        ? {
            cta_action: "stock_picker",
            text: "I can't recommend a specific stock to buy. Stockera's Stock Picker runs a rules-based sweep across our universe and shows you the strongest candidates right now — it only takes a moment.",
            url: "/stock-picker",
            label: "Open Stockera Stock Picker",
          }
        : route.action === "routed_to_educational_report"
          ? {
              cta_action: "educational_report",
              text: "This sounds like a concept question. Stockera can run a structured explainer for it — open it with one click.",
              url: `/post-query?type=educational&q=${encodeURIComponent(user_message)}`,
              label: "Open Stockera Explain this",
            }
          : route.action === "routed_to_sector_report"
            ? {
                cta_action: "sector_report",
                text: "This looks like a sector-level question. Stockera can generate a Sector View report — here's the deep-link, ready to use.",
                url: `/post-query?type=sector_view&q=${encodeURIComponent(user_message)}`,
                label: "Open Stockera Sector View",
              }
            : null
      : null;

  if (ctaPlan) {
    const sourcesUsedForCta = [
      { tool: "router" },
      { cta_action: ctaPlan.cta_action },
      { kind: "citation", url: ctaPlan.url, title: ctaPlan.label, source: "internal", tool: "router" },
    ];
    const { data: row, error } = await supabase.from("ai_followups").insert({
      conversation_mode: mode,
      thread_id,
      query_id,
      user_id,
      role: "assistant",
      content: ctaPlan.text,
      route_decision: "routed_to_ask_anything", // CHECK whitelist
      sources_used: sourcesUsedForCta,
      llm_provider: "router",
      llm_model: "deterministic-router",
      llm_input_tokens: 0,
      llm_output_tokens: 0,
      llm_cost_usd: 0,
      ip_address: ip,
    }).select("id").single();
    if (error) return json({ error: "persist_failed", detail: error.message }, 500);
    return json({
      ok: true,
      thread_id,
      followup_id: row.id,
      content: ctaPlan.text,
      sources_used: sourcesUsedForCta,
      sources: [{ title: ctaPlan.label, url: ctaPlan.url, source: "internal" }],
      cta_action: ctaPlan.cta_action,
      llm_provider: "router",
      llm_model: "deterministic-router",
      route_decision: "routed_to_ask_anything",
      routed_query_id: null,
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

  // Step 6b (Stage 2.3.2): predictive web_search plan.
  // Single DB read for the daily cap; reused by Step 7 (context shape) and
  // Step 8 (actual tool enable) — no duplicate query.
  let webSearchUsesToday = 0;
  if (mode === "report_followup" && followup_mode === "open" && !skipClaude && ANTHROPIC_API_KEY) {
    const { count } = await supabase
      .from("ai_followups")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .gte("created_at", since)
      .contains("sources_used", [{ tool: "web_search" }]);
    webSearchUsesToday = count ?? 0;
  }
  const plannedUseWebSearch =
    mode === "report_followup" &&
    followup_mode === "open" &&
    !skipClaude &&
    !!ANTHROPIC_API_KEY &&
    NEWS_KEYWORD_RE.test(user_message) &&
    webSearchUsesToday < WEB_SEARCH_DAILY_CAP_PER_USER;

  // Step 7: Build context
  const baseSystem = mode === "report_followup"
    ? (followup_mode === "open" ? REPORT_FOLLOWUP_OPEN_SYSTEM : REPORT_FOLLOWUP_EXPLAIN_SYSTEM)
    : HOMEPAGE_ASSISTANT_SYSTEM;
  let system = baseSystem;

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
    const { data: qrow, error: qErr } = await supabase
      .from("queries")
      .select("ai_report, stock_symbol, stock_name, horizon")
      .eq("id", query_id)
      .maybeSingle();
    if (qErr || !qrow || !qrow.ai_report) return json({ error: "report_not_found" }, 404);
    const ai: any = qrow.ai_report;
    const pick = (obj: any, keys: string[]) =>
      keys.reduce((acc: any, k) => { acc[k] = obj?.[k] ?? null; return acc; }, {});

    // Stage 2.3.2: minimal identity-only context when web_search is in play.
    // Input tokens drop from ~14000 to ~400, cutting per-turn cost from $0.062 → ~$0.021.
    const projectedMinimal = {
      stock: {
        symbol: qrow.stock_symbol ?? null,
        name: qrow.stock_name ?? null,
        horizon: qrow.horizon ?? null,
      },
      final_verdict: {
        action: ai.final_verdict?.action ?? null,
        summary_reason: ai.final_verdict?.summary_reason ?? null,
      },
    };

    const projectedFull = {
      stock: { symbol: qrow.stock_symbol ?? null, name: qrow.stock_name ?? null, horizon: qrow.horizon ?? null },
      price_context: pick(ai.price_context, ["current_price", "price_source", "as_of"]),
      final_verdict: pick(ai.final_verdict, ["action", "confidence_pct", "overall_score", "risk_label", "summary_reason"]),
      audit_meta: {
        regime: ai.audit_meta?.regime ?? null,
        verdict_suppressed: ai.audit_meta?.verdict_suppressed ?? null,
        suppressed_reason: ai.audit_meta?.suppressed_reason ?? null,
        suppressed_rule_id: ai.audit_meta?.suppressed_rule_id ?? null,
        entry_strategy: { reasoning_text: ai.audit_meta?.entry_strategy?.reasoning_text ?? ai.levels?.entry_strategy?.reasoning_text ?? null },
      },
      score_breakdown: pick(ai.score_breakdown, ["fundamental_score", "technical_score", "risk_score", "momentum_score", "sentiment_score"]),
      risk_snapshot: pick(ai.risk_snapshot, ["beta", "var_95", "max_drawdown", "sharpe_ratio", "volatility_1y", "liquidity_label"]),
      technical_snapshot: pick(ai.technical_snapshot, ["rsi", "adx", "macd_signal", "trend_label", "ema_stack"]),
      fundamental_snapshot: pick(ai.fundamental_snapshot, ["pe_ratio", "roe", "altman_z_score", "piotroski_f_score", "valuation_label"]),
      returns_snapshot: pick(ai.returns_snapshot, ["one_week", "one_month", "three_month", "one_year", "vs_nifty_one_month", "vs_nifty_three_month"]),
      momentum_snapshot: pick(ai.momentum_snapshot, ["momentum_label", "trend_strength", "volume_confirmation"]),
      sentiment_snapshot: pick(ai.sentiment_snapshot, ["sentiment_label", "news_sentiment_score", "top_news_driver"]),
      long_term_quality_snapshot: pick(ai.long_term_quality_snapshot, ["quality_label", "roe_5y_avg", "eps_cagr_5y", "roce_5y_avg"]),
    };

    const projected = plannedUseWebSearch ? projectedMinimal : projectedFull;
    const projectedJson = JSON.stringify(projected);

    console.log("CONTEXT_PLAN", {
      followup_mode,
      plannedUseWebSearch,
      web_search_uses_today: webSearchUsesToday,
      web_search_daily_cap: WEB_SEARCH_DAILY_CAP_PER_USER,
      projected_chars: projectedJson.length,
      projected_shape: plannedUseWebSearch ? "minimal" : "full",
    });

    // Deterministic char-count heuristic: ~4 chars/token, 3500-token input cap = 14000 chars ceiling.
    if (projectedJson.length > 14000) {
      return json({ error: "context_too_large", chars: projectedJson.length, ceiling_chars: 14000 }, 413);
    }
    const reportContext = `\n\n=== PROJECTED REPORT CONTEXT (read-only, sanitized) ===\n${projectedJson}\n=== END PROJECTED REPORT CONTEXT ===`;
    system = system + reportContext;
    if (followup_mode === "open") {
      system = system + "\n\nYou MAY answer using general knowledge beyond this report, subject to the absolute rules above.";
    }
  }



  // Step 8: Build tool plan (report_followup only)
  let toolCitations: Citation[] = [];
  const anthropicTools: any[] = [];
  let toolPlanUsedWeb = false;
  let toolPlanUsedMx = false;

  if (mode === "report_followup" && !skipClaude && ANTHROPIC_API_KEY) {
    const lowerMsg = user_message.toLowerCase();
    let useWeb = false;
    let useMx = false;
    if (followup_mode === "open") {
      if (NEWS_KEYWORD_RE.test(user_message)) {
        useWeb = true;
      }
      if (/(tcs|reliance|hdfcbank|infy|nifty|sensex|bank|\bit\b|pharma|auto|metal|energy|fmcg)/i.test(user_message)) {
        useMx = true;
      }
    } else {
      // explain mode: marketaux only if a ticker is explicitly mentioned (uppercase token)
      if (/\b[A-Z][A-Z0-9&-]{1,11}\b/.test(user_message)) useMx = true;
    }

    // Per-user daily caps — web_search count was hoisted to Step 6b; reuse it.
    if (useWeb) {
      if (webSearchUsesToday >= WEB_SEARCH_DAILY_CAP_PER_USER) useWeb = false;
    }

    if (useMx) {
      const { count: mxCount } = await supabase
        .from("ai_followups")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .gte("created_at", since)
        .contains("sources_used", [{ tool: "marketaux" }]);
      if ((mxCount ?? 0) >= MARKETAUX_DAILY_CAP_PER_USER) useMx = false;
    }

    if (useWeb) {
      // Bug 2: lower max_uses 3→2 to keep per-turn cost under TURN_COST_CAP_USD.
      anthropicTools.push({ type: "web_search_20250305", name: "web_search", max_uses: 2 });
      toolPlanUsedWeb = true;
    }

    if (useMx) {
      anthropicTools.push({
        name: "marketaux_news_search",
        description: "Fetch recent company/sector news from Marketaux. Use when the user asks for latest news, announcements, or sector developments relevant to the report.",
        input_schema: {
          type: "object",
          properties: {
            symbols: { type: "array", items: { type: "string" } },
            industry_tags: { type: "array", items: { type: "string" } },
            days_back: { type: "integer", minimum: 1, maximum: 30, default: 7 },
            limit: { type: "integer", minimum: 1, maximum: 12, default: 12 },
            language: { type: "string", default: "en" },
          },
        },
      });
      toolPlanUsedMx = true;
    }
  }

  // Step 9: Call LLM — tool-loop path if tools enabled, else legacy fallback chain
  let llm: any;
  let claudeUsed = !skipClaude;

  if (mode === "report_followup" && anthropicTools.length > 0) {
    try {
      const out = await callClaudeWithTools({
        system,
        userMessage: user_message,
        history,
        tools: anthropicTools,
        model: "claude-sonnet-4-6",
        // Bug 2: 1500 → 1100 keeps projected per-turn cost within TURN_COST_CAP_USD.
        max_tokens: 1100,
        temperature: followup_mode === "open" ? 0.25 : 0.05,
      });
      llm = { ...out, claudeUsed: true };
      toolCitations = out.citations;
    } catch (e) {
      console.warn("CLAUDE_TOOLS_FAIL_FALLBACK", (e as Error).message);
      try {
        llm = await runFallbackChain({
          system, userMessage: user_message, history, skipClaude: true,
        });
      } catch (e2) {
        console.error("LLM_UNAVAILABLE", (e2 as Error).message);
        return json({ error: "llm_unavailable" }, 503);
      }
    }
  } else {
    const claudeOverrides = mode === "report_followup"
      ? { model: "claude-sonnet-4-6", max_tokens: 1100, temperature: followup_mode === "open" ? 0.25 : 0.05 }
      : undefined;
    try {
      llm = await runFallbackChain({ system, userMessage: user_message, history, skipClaude, claudeOverrides });
    } catch (e) {
      console.error("LLM_UNAVAILABLE", (e as Error).message);
      return json({ error: "llm_unavailable" }, 503);
    }
  }

  let finalText: string = llm.text ?? "";
  // Bug 2: recompute exact cost (sonnet-4-6 $3/M in, $15/M out; web_search $10/1k uses).
  const inTok = Number(llm.input_tokens ?? 0);
  const outTok = Number(llm.output_tokens ?? 0);
  const webCount = Number(llm.web_search_count ?? 0);
  let costUsd = (inTok / 1_000_000) * 3 + (outTok / 1_000_000) * 15 + webCount * 0.01;
  if (!Number.isFinite(costUsd) || costUsd < 0) costUsd = Number(llm.cost_usd ?? 0);
  if (costUsd > TURN_COST_CAP_USD * 1.5) {
    console.error("COST_OVERRUN", {
      user_id, cost_usd: costUsd, web_search_count: webCount,
      input_tokens: inTok, output_tokens: outTok, followup_mode,
    });
  }
  if (costUsd > TURN_COST_CAP_USD && finalText.length > 800) {
    finalText = finalText.slice(0, 800);
  }


  const routeDecision = !llm.claudeUsed ? "fallback_used" : "answered_direct";

  // Stage 2.3 sources_used array
  const sourcesUsedArray: any[] =
    mode === "report_followup"
      ? [
          ...(toolPlanUsedWeb ? [{ tool: "web_search" }] : []),
          ...(toolPlanUsedMx ? [{ tool: "marketaux" }] : []),
          { followup_mode },
          ...toolCitations.map((c) => ({
            kind: "citation",
            url: c.url,
            title: c.title,
            source: c.source,
            published_at: c.published_at ?? null,
            tool: c.tool,
          })),
        ]
      : [];

  // Step 10: Persist assistant
  const { data: arow, error: aerr } = await supabase.from("ai_followups").insert({
    conversation_mode: mode,
    thread_id,
    query_id: mode === "report_followup" ? query_id : null,
    user_id,
    role: "assistant",
    content: finalText,
    sources_used: sourcesUsedArray,
    route_decision: routeDecision,
    llm_provider: llm.provider,
    llm_model: llm.model,
    llm_input_tokens: llm.input_tokens,
    llm_output_tokens: llm.output_tokens,
    llm_cost_usd: costUsd,
    ip_address: ip,
  }).select("id").single();
  if (aerr) return json({ error: "persist_failed", detail: aerr.message }, 500);

  // Stage 3A: Open-mode post-success debit. Founder_beta bypassed in preflight.
  if (!isExplainFollowup && mode === "report_followup" && followup_mode === "open" && !isBeta && arow?.id) {
    try {
      const idem = `followup_open:${arow.id}`;
      const { data: dr } = await supabase.rpc("wallet_apply_debit", {
        p_user_id: user_id,
        p_action_key: "followup_open",
        p_points: OPEN_FOLLOWUP_COST_PTS,
        p_query_id: query_id ?? null,
        p_idempotency_key: idem,
      });
      const st = (dr as any)?.status;
      if (st !== "ok" && st !== "idempotent_replay") {
        await supabase.from("wallet_debit_failures").insert({
          user_id, assistant_row_id: arow.id, query_id: query_id ?? null,
          action_key: "followup_open", points_attempted: OPEN_FOLLOWUP_COST_PTS,
          rpc_status: st ?? "null", rpc_payload: dr ?? null, idempotency_key: idem,
        });
        console.error("WALLET_DEBIT_FAIL", { user_id, assistant_row_id: arow.id, status: st });
      }
    } catch (e) {
      console.error("WALLET_DEBIT_THROW", (e as Error).message);
      await supabase.from("wallet_debit_failures").insert({
        user_id, assistant_row_id: arow.id, query_id: query_id ?? null,
        action_key: "followup_open", points_attempted: OPEN_FOLLOWUP_COST_PTS,
        rpc_status: "exception", rpc_payload: { message: (e as Error).message },
        idempotency_key: `followup_open:${arow.id}`,
      });
    }
  }

  // Step 11: Return
  return json({
    ok: true,
    thread_id,
    followup_id: arow.id,
    content: finalText,
    sources_used: sourcesUsedArray,
    sources: toolCitations.map((c) => ({
      title: c.title, url: c.url, source: c.source,
      published_at: c.published_at ?? null, tool: c.tool,
    })),
    llm_provider: llm.provider,
    llm_model: llm.model,
    route_decision: routeDecision,
    routed_query_id: null,
  });
});

