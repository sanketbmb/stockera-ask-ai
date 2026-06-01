import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GenerateReportInput = z.object({
  queryId: z.string().uuid(),
});

type EdgeReportPayload = {
  ok?: boolean;
  ai_report_id?: unknown;
  message?: string;
  details?: string;
  code?: string;
  stage?: string;
  error?: string | boolean;
};

export const generateAiReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GenerateReportInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: query, error: queryError } = await context.supabase
      .from("queries")
      .select("id, query_type")
      .eq("id", data.queryId)
      .single();
    if (queryError || !query) {
      throw new Error(`Query not found for this user: ${queryError?.message ?? data.queryId}`);
    }
    // Phase 2.1 — server-side allowlist. Reject any query whose intent is
    // not in the live set (Fresh Entry / Sell or Hold / Should I Average).
    // v1-engine intents persist as `fresh_entry` / `existing_position` /
    // `averaging`; legacy v0 path persists the raw intent id.
    const ALLOWED_QUERY_TYPES = new Set<string>([
      "fresh_entry",
      "existing_position",
      "averaging",
      "buy_decision",
      "stuck_position",
      "should_average",
    ]);
    const qt = (query as { query_type?: string | null }).query_type ?? "";
    // Phase 3A — "other" is intentionally NOT in the allowlist for the v0
    // legacy generator. We return a controlled "not yet available" instead
    // of throwing "Unsupported query type" so the UI can degrade gracefully.
    if (qt === "other" || qt === "sector_view" || qt === "educational") {
      return {
        ok: false,
        message: "AI report not yet available for this question type — a SEBI analyst will respond.",
        code: "ROUTED_TO_ANALYST",
      } as const;
    }
    if (qt && !ALLOWED_QUERY_TYPES.has(qt)) {
      throw new Error("Unsupported query type");
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    const authorization = getRequestHeader("authorization");
    if (!supabaseUrl || !publishableKey) throw new Error("Report service is missing Supabase server configuration");
    if (!authorization) throw new Error("Report service could not read your sign-in token. Please refresh and sign in again.");

    const response = await fetch(`${supabaseUrl}/functions/v1/generate-ai-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey,
        authorization,
      },
      body: JSON.stringify({ query_id: data.queryId }),
    });
    const responseText = await response.text();
    let payload: EdgeReportPayload | null = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      const fallbackMsg = responseText
        ? `Edge function returned non-JSON: ${responseText.slice(0, 200)}`
        : `Edge function failed with HTTP ${response.status}: ${response.statusText}`;
      payload = { message: fallbackMsg, code: "NON_JSON_EDGE_RESPONSE" };
    }

    if (!response.ok || !payload?.ok) {
      const msg =
        payload?.message ??
        payload?.details ??
        (typeof payload?.error === "string" ? payload.error : undefined) ??
        `Report service returned HTTP ${response.status}`;
      const code = payload?.code ?? "";
      const stage = payload?.stage ?? "";
      const fullMsg = [msg, code ? `(${code})` : "", stage ? `[stage: ${stage}]` : ""].filter(Boolean).join(" ");
      console.error("generateAiReport: throwing", fullMsg, { status: response.status, payload });
      const err = new Error(fullMsg);
      (err as Error & { cause?: unknown }).cause = { status: response.status, code, stage };
      throw err;
    }

    return {
      ok: true,
      ai_report_id: typeof (payload as { ai_report_id?: unknown }).ai_report_id === "string"
        ? (payload as { ai_report_id: string }).ai_report_id
        : null,
    };
  });
