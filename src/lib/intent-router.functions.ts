// Phase 3A — Free-text intent router server fn.
// Calls Lovable AI Gateway (google/gemini-3-flash-preview) via tool calling
// for strict structured output. Classification-only — never fabricates
// symbol/price; degrades gracefully to "other" on any failure.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  RouterOutputSchema,
  ROUTER_VERSION,
  buildRouterFallback,
  type RouterOutput,
} from "@/lib/intent-router-schema";

const Input = z.object({
  text: z.string().trim().min(15).max(500),
});

const SYSTEM_PROMPT = `You are a strict intent classifier for an Indian stock-market Q&A app. You ONLY classify — you never give investment advice and never invent facts.

Map each user question to exactly one canonical type:
- "fresh_entry": user is considering buying a stock they don't yet own.
- "existing_position": user already owns the stock and is asking whether to sell, hold, or exit.
- "averaging_decision": user already owns the stock at a loss/discount and is asking whether to average down / buy more.
- "sector_view": user is asking about a sector or group of stocks, not a single ticker.
- "educational": user is asking a concept / definition / how-it-works question.
- "other": ambiguous, off-topic, mutual-fund / portfolio, or anything not covered above.

Extraction rules (CRITICAL — when in doubt, return null):
- symbol: only set if the user names a clearly identifiable Indian-listed company or ticker. Return the NSE-style ticker in UPPERCASE (e.g. ICICIBANK, HDFCBANK, TCS, RELIANCE). If only a sector is mentioned, leave symbol null.
- sector: short English sector label (e.g. "Private Banks", "IT Services") only when the question is sector-level.
- horizon: intraday | short (<3mo) | medium (3-12mo) | long (1y+). null if not stated or implied.
- entry_price: numeric INR per-share only if the user explicitly states a buy/entry price.
- qty: integer share count only if explicitly stated.
- custom_question: brief verbatim-style summary (<=200 chars) capturing any extra constraint the user mentioned.
- language_hint: english | hindi | hinglish | other (based on the user's input).
- confidence_score: 0..1 — how confident you are that interpreted_type is correct AND that extracted fields are not fabricated.
- clarification_needed: true if you'd want a follow-up question before acting (e.g. missing symbol, ambiguous intent).

NEVER fabricate symbols, prices, sectors, or horizons. NEVER answer the question. Output English only.`;

type GatewayChoice = {
  message?: {
    tool_calls?: Array<{
      function?: { name?: string; arguments?: string };
    }>;
  };
};

async function callGateway(text: string, signal: AbortSignal): Promise<RouterOutput> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "classify_intent",
            description: "Return the strict classification for the user's question.",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                interpreted_type: {
                  type: "string",
                  enum: [
                    "fresh_entry",
                    "existing_position",
                    "averaging_decision",
                    "sector_view",
                    "educational",
                    "other",
                  ],
                },
                symbol: { type: ["string", "null"] },
                sector: { type: ["string", "null"] },
                horizon: {
                  type: ["string", "null"],
                  enum: ["intraday", "short", "medium", "long", null],
                },
                entry_price: { type: ["number", "null"] },
                qty: { type: ["integer", "null"] },
                custom_question: { type: ["string", "null"] },
                language_hint: {
                  type: "string",
                  enum: ["english", "hindi", "hinglish", "other"],
                },
                confidence_score: { type: "number", minimum: 0, maximum: 1 },
                clarification_needed: { type: "boolean" },
              },
              required: [
                "interpreted_type",
                "symbol",
                "sector",
                "horizon",
                "entry_price",
                "qty",
                "custom_question",
                "language_hint",
                "confidence_score",
                "clarification_needed",
              ],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "classify_intent" } },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gateway HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: GatewayChoice[] };
  const argsStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsStr) throw new Error("No tool_call arguments in gateway response");

  const parsed = JSON.parse(argsStr) as Record<string, unknown>;
  // Normalise symbol casing before zod validation.
  if (typeof parsed.symbol === "string") {
    parsed.symbol = parsed.symbol.trim().toUpperCase() || null;
  }
  return RouterOutputSchema.parse({ ...parsed, router_version: ROUTER_VERSION });
}

export const classifyIntentRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data }): Promise<RouterOutput> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      return await callGateway(data.text, controller.signal);
    } catch (err) {
      console.warn("[intent-router] fallback:", (err as Error).message);
      return buildRouterFallback(data.text);
    } finally {
      clearTimeout(timeout);
    }
  });
