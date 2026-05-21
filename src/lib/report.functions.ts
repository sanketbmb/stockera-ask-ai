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
      .select("id")
      .eq("id", data.queryId)
      .single();
    if (queryError || !query) {
      throw new Error(`Query not found for this user: ${queryError?.message ?? data.queryId}`);
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
      payload = { message: responseText || response.statusText, code: "NON_JSON_EDGE_RESPONSE" };
    }

    if (!response.ok || !payload?.ok) {
      const msg =
        payload?.message ??
        payload?.details ??
        (typeof payload?.error === "string" ? payload.error : undefined) ??
        `Report service returned HTTP ${response.status}`;
      const stage = payload?.stage ? ` [stage: ${payload.stage}]` : "";
      const code = payload?.code ? ` (${payload.code})` : "";
      console.error("generateAiReport failure", { status: response.status, msg, stage, code, payload, responseText });
      throw new Error(`${msg}${code}${stage}`);
    }

    return {
      ok: true,
      ai_report_id: typeof (payload as { ai_report_id?: unknown }).ai_report_id === "string"
        ? (payload as { ai_report_id: string }).ai_report_id
        : null,
    };
  });
