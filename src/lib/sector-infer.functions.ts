// Mission 1.6 Phase 2 — LLM sector inference fallback.
// Fires only when the deterministic regex detector (sector-keyword-detector.ts)
// returns null AND the user's text is long enough to be worth a model call.
// Uses Lovable AI Gateway with Gemini Flash for cheap, fast classification.
// Returns null when the model is not confident or no sector is plausible.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  text: z.string().trim().min(8).max(800),
});

// Canonicals that exist in public.sector_aggregates as of audit.
// Keep in sync with SECTOR_DISPLAY in sector-alias-map.ts.
const ALLOWED = [
  "private_sector_bank",
  "public_sector_bank",
  "banks",
  "financial_services",
  "it_services",
  "information_technology",
  "it_software",
  "software_services",
  "pharmaceuticals",
  "healthcare",
  "automobile",
  "auto_components",
  "fmcg",
  "consumer_staples",
  "consumer_discretionary",
  "capital_goods",
  "engineering",
  "cement",
  "metals_mining",
  "oil_gas",
  "petroleum_products",
  "energy",
  "power",
  "utilities",
  "telecom",
  "real_estate",
  "infrastructure",
  "construction",
  "chemicals",
  "textiles",
  "media",
  "agriculture",
  "services",
] as const;

const SYSTEM_PROMPT = `You are a strict sector classifier for Indian stock-market questions.
Read the user's question and pick the SINGLE best sector from this exact list (use the snake_case canonical):
${ALLOWED.join(", ")}

Rules:
- Output ONLY a JSON object: {"canonical": <one of the list or null>, "confidence": <0..1>, "reasoning": "<<= 12 words>"}.
- If the question is ambiguous, off-topic, about mutual funds, or doesn't clearly map to ONE sector, return {"canonical": null, "confidence": 0, "reasoning": "no clear sector"}.
- Prefer the most specific match: "PSU banks" -> public_sector_bank, not banks.
- Map "renewable / solar / wind / green energy" -> power.
- Map "logistics / shipping / courier" -> services.
- Map "EV / electric mobility / clean mobility" -> automobile.
- Map "fuel / crude oil / oil prices" -> oil_gas.
- NEVER invent canonicals outside the list. NEVER answer the question.`;

export interface InferredSector {
  canonical: string | null;
  confidence: number;
  reasoning: string;
  source: "llm" | "fallback_null";
}

function safeParseJson(s: string): Record<string, unknown> | null {
  // Strip ```json fences if present.
  const cleaned = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Best-effort: extract first {...} block.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

async function callGateway(text: string, signal: AbortSignal): Promise<InferredSector> {
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

  const rawCanonical = typeof parsed.canonical === "string" ? parsed.canonical : null;
  const canonical = rawCanonical && (ALLOWED as readonly string[]).includes(rawCanonical)
    ? rawCanonical
    : null;
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 80) : "";

  return {
    canonical,
    confidence,
    reasoning,
    source: "llm",
  };
}

export const inferSectorFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data }): Promise<InferredSector> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const result = await callGateway(data.text, controller.signal);
      // Soft-confidence gate: drop weak guesses.
      if (result.confidence < 0.45) {
        return { canonical: null, confidence: result.confidence, reasoning: result.reasoning, source: "fallback_null" };
      }
      return result;
    } catch (err) {
      console.warn("[sector-infer] fallback:", (err as Error).message);
      return { canonical: null, confidence: 0, reasoning: "inference unavailable", source: "fallback_null" };
    } finally {
      clearTimeout(timeout);
    }
  });
