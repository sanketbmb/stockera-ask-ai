// Phase 3D — General / "Ask Anything" report freeze/read server fn.
// Used by query_type === "other": when the question doesn't map cleanly
// onto a stock-tier, sector, or educational path, we still want to give
// the user a SEBI-aligned analyst-style answer. Mirrors the freeze/read
// pattern used by sector + educational reports.
//
// Flow:
//  1. Load the queries row, verify ownership.
//  2. If ai_report is already frozen with schema_version === "v1_general",
//     return it.
//  3. Otherwise call Lovable AI Gateway (Gemini Flash) with a strict
//     research-analyst system prompt that returns a JSON object, freeze
//     the payload into queries.ai_report, and return it.
//
// Hard guardrails: never invents buy/sell/target/stoploss/price levels;
// always returns a "general_view" disclaimer banner.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Input = z.object({
  queryId: z.string().uuid(),
  forceRefresh: z.boolean().optional(),
});

export interface GeneralReportPayload {
  schema_version: "v1_general";
  question: string;
  summary: string;
  key_points: string[];
  risks: string[];
  what_to_watch: string[];
  disclaimer: string;
  generated_at: string;
  model: string;
  fallback: boolean;
}

export type GeneralFreezeResult = {
  ok: true;
  payload: GeneralReportPayload;
  served_from_cache: boolean;
  frozen_at: string;
};

const SYSTEM_PROMPT = `You are a SEBI-registered research-analyst-style assistant for an Indian stock-market Q&A app.

The user has asked a free-form question that did not map onto a single-stock, sector, or pure educational lane. Write them a clear, helpful, balanced response.

STRICT RULES (non-negotiable):
- NEVER give buy/sell/hold recommendations on any specific stock.
- NEVER invent price targets, stop-losses, entry levels, or specific numeric forecasts.
- NEVER claim certainty about future market direction.
- If the question is about a specific stock, redirect: tell the user to use the "Fresh Entry" / "Sell or Hold" flow.
- If the question is off-topic (politics, gossip, jokes), set summary to a polite redirect to ask a market-related question and leave the other arrays empty.
- Keep all text in clear English, no Hindi/Hinglish mixing unless the user wrote in Hinglish.
- Be concrete, avoid filler. Cite well-known structural facts (RBI rate cycle, monsoon, GST, sector composition) but DO NOT cite specific prices, dates, or numbers you can't verify.

OUTPUT — return ONLY a JSON object matching this shape:
{
  "summary": "<2-4 sentence overview, plain English>",
  "key_points": ["<point 1>", "<point 2>", "<point 3>"],   // 3-5 items
  "risks": ["<risk 1>", "<risk 2>"],                         // 2-3 items
  "what_to_watch": ["<signal 1>", "<signal 2>"]              // 2-3 items
}

Each bullet must be <= 200 chars. Do not output markdown, code fences, or any text outside the JSON object.`;

const FALLBACK_PAYLOAD = (question: string): GeneralReportPayload => ({
  schema_version: "v1_general",
  question,
  summary:
    "We couldn't generate a structured AI answer for this question right now. A SEBI Research Analyst will review and respond shortly.",
  key_points: [],
  risks: [],
  what_to_watch: [],
  disclaimer:
    "This is a general market commentary, not personalised investment advice. Markets carry risk; consult a SEBI Registered Investment Adviser before acting.",
  generated_at: new Date().toISOString(),
  model: "fallback",
  fallback: true,
});

function safeParseJson(s: string): Record<string, unknown> | null {
  const cleaned = s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function clampStrArray(input: unknown, max: number): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .slice(0, max)
    .map((s) => s.slice(0, 240));
}

async function callGateway(
  question: string,
  signal: AbortSignal,
): Promise<GeneralReportPayload> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const model = "google/gemini-3-flash-preview";

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gateway HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = safeParseJson(content);
  if (!parsed) throw new Error("Failed to parse JSON from gateway");

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim().length > 0
      ? parsed.summary.slice(0, 1200)
      : "";
  if (!summary) throw new Error("Empty summary from gateway");

  return {
    schema_version: "v1_general",
    question,
    summary,
    key_points: clampStrArray(parsed.key_points, 5),
    risks: clampStrArray(parsed.risks, 3),
    what_to_watch: clampStrArray(parsed.what_to_watch, 3),
    disclaimer:
      "This is a general market commentary, not personalised investment advice. Markets carry risk; consult a SEBI Registered Investment Adviser before acting.",
    generated_at: new Date().toISOString(),
    model,
    fallback: false,
  };
}

export const freezeOrReadGeneralReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }): Promise<GeneralFreezeResult> => {
    const { userId } = context;

    const { data: row, error: readErr } = await supabaseAdmin
      .from("queries")
      .select(
        "id, user_id, query_type, ai_report, frozen_at, query_text, custom_question",
      )
      .eq("id", data.queryId)
      .single();
    if (readErr || !row)
      throw new Error(`Query not found: ${readErr?.message ?? data.queryId}`);
    if (row.user_id !== userId) throw new Error("Not authorized to read this report");
    if (row.query_type !== "other") {
      throw new Error("freezeOrReadGeneralReport only handles 'other' records");
    }

    const question =
      (row.query_text as string | null)?.trim() ||
      (row.custom_question as string | null)?.trim() ||
      "";
    if (!question) throw new Error("Query has no question text");

    // Cache hit.
    if (!data.forceRefresh && row.ai_report && row.frozen_at) {
      const cached = row.ai_report as unknown as GeneralReportPayload;
      if (cached?.schema_version === "v1_general") {
        return {
          ok: true,
          payload: cached,
          served_from_cache: true,
          frozen_at: row.frozen_at as string,
        };
      }
    }

    // Generate.
    let payload: GeneralReportPayload;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      payload = await callGateway(question, controller.signal);
    } catch (err) {
      console.warn("[general-report] fallback:", (err as Error).message);
      payload = FALLBACK_PAYLOAD(question);
    } finally {
      clearTimeout(timeout);
    }

    const frozenAt = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from("queries")
      .update({
        ai_report: JSON.parse(JSON.stringify(payload)),
        frozen_at: frozenAt,
        report_artifact_status: "frozen",
        engine_version: "v1_general",
        engine_source: "lovable_ai_gateway",
        status: "ai_answered",
      } as never)
      .eq("id", row.id);
    if (updErr)
      console.warn("[freezeOrReadGeneralReport] persist failed (non-fatal):", updErr);

    return { ok: true, payload, served_from_cache: false, frozen_at: frozenAt };
  });
