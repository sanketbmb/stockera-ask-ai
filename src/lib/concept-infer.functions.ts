// Phase 2B — LLM concept inference fallback for the Educational chip.
// Fires only when the deterministic alias map (concept-alias-map.ts) returns
// null AND the user's free-text is long enough to be worth a model call.
// Mirrors sector-infer.functions.ts patterns: Gemini Flash via Lovable AI
// Gateway, 8s timeout, JSON response_format, LRU(100), daily cap 500.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SUPPORTED_CONCEPTS } from "@/content/educational-glossary";

const Input = z.object({
  text: z.string().trim().min(4).max(500),
});

const DAILY_CAP = 500;

const SYSTEM_PROMPT = `You are a strict concept classifier for an Indian stock-market education feature.
Read the user's question and pick the SINGLE best concept name from this exact list (return the canonical string verbatim):
${SUPPORTED_CONCEPTS.join(", ")}

Rules:
- Output ONLY a JSON object: {"canonical": <one of the list or null>, "confidence": <0..1>, "reasoning": "<<= 12 words>"}.
- If the question doesn't clearly map to ONE concept on the list, return {"canonical": null, "confidence": 0, "reasoning": "no clear concept"}.
- Match common synonyms (e.g. "intrinsic value" -> "DCF", "f score" -> "Piotroski F-Score", "200 dma" -> "EMA", "drawdown" -> "Max Drawdown").
- NEVER invent canonicals outside the list. NEVER answer the question.`;

export interface InferredConcept {
  canonical: string | null;
  confidence: number;
  reasoning: string;
  source: "llm" | "fallback_null" | "cap_reached";
}

// In-module LRU(100) keyed on trimmed lowercased text.
const CACHE = new Map<string, InferredConcept>();
const CACHE_MAX = 100;
function cacheGet(k: string): InferredConcept | undefined {
  const v = CACHE.get(k);
  if (v) {
    CACHE.delete(k);
    CACHE.set(k, v);
  }
  return v;
}
function cacheSet(k: string, v: InferredConcept) {
  if (CACHE.has(k)) CACHE.delete(k);
  CACHE.set(k, v);
  if (CACHE.size > CACHE_MAX) {
    const first = CACHE.keys().next().value;
    if (first !== undefined) CACHE.delete(first);
  }
}

function safeParseJson(s: string): Record<string, unknown> | null {
  const cleaned = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
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

async function todayCallCount(): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabaseAdmin
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "concept_infer_call")
    .gte("created_at", since.toISOString());
  if (error) {
    console.warn("[concept-infer] count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

async function hashText(t: string): Promise<string> {
  const enc = new TextEncoder().encode(t);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

async function callGateway(text: string, signal: AbortSignal): Promise<InferredConcept> {
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
  const canonical = rawCanonical && SUPPORTED_CONCEPTS.includes(rawCanonical) ? rawCanonical : null;
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 80) : "";

  return { canonical, confidence, reasoning, source: "llm" };
}

export const inferConceptFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }): Promise<InferredConcept> => {
    const key = data.text.trim().toLowerCase();
    const cached = cacheGet(key);
    if (cached) return cached;

    // Daily cap gate.
    const count = await todayCallCount();
    if (count >= DAILY_CAP) {
      const capped: InferredConcept = {
        canonical: null,
        confidence: 0,
        reasoning: "daily cap reached",
        source: "cap_reached",
      };
      cacheSet(key, capped);
      return capped;
    }

    // Best-effort metering insert (non-fatal).
    const qhash = await hashText(key);
    void supabaseAdmin
      .from("audit_events")
      .insert({
        event_type: "concept_infer_call",
        actor_id: context.userId,
        resource_type: "concept_infer",
        resource_id: null,
        payload: { qhash, day_count_before: count },
      })
      .then(({ error }) => {
        if (error) console.warn("[concept-infer] meter insert failed:", error.message);
      });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let result: InferredConcept;
    try {
      const r = await callGateway(data.text, controller.signal);
      result = r.confidence < 0.45
        ? { canonical: null, confidence: r.confidence, reasoning: r.reasoning, source: "fallback_null" }
        : r;
    } catch (err) {
      console.warn("[concept-infer] fallback:", (err as Error).message);
      result = { canonical: null, confidence: 0, reasoning: "inference unavailable", source: "fallback_null" };
    } finally {
      clearTimeout(timeout);
    }

    cacheSet(key, result);

    // Audit telemetry on resolution (non-fatal).
    if (result.canonical) {
      void supabaseAdmin
        .from("audit_events")
        .insert({
          event_type: "concept_infer_resolved",
          actor_id: context.userId,
          resource_type: "concept_infer",
          resource_id: null,
          payload: { qhash, canonical: result.canonical, confidence: result.confidence },
        })
        .then(({ error }) => {
          if (error) console.warn("[concept-infer] resolved insert failed:", error.message);
        });
    }

    return result;
  });
