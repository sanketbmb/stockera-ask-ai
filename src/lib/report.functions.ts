import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GenerateReportInput = z.object({
  queryId: z.string().uuid(),
});

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

    const { data: payload, error } = await context.supabase.functions.invoke("generate-ai-report", {
      body: { query_id: data.queryId },
    });

    // Try to read structured error body from the FunctionsHttpError response
    let bodyDetail: { message?: string; details?: string; code?: string; stage?: string; error?: string } | null = null;
    const fnRes = (error as { context?: Response } | null)?.context;
    if (fnRes) {
      try { bodyDetail = await fnRes.clone().json(); } catch { /* ignore */ }
    }
    if (!bodyDetail && payload && typeof payload === "object") {
      bodyDetail = payload as typeof bodyDetail;
    }

    if (error || !(payload as { ok?: boolean } | null)?.ok) {
      const msg =
        bodyDetail?.message ??
        bodyDetail?.details ??
        bodyDetail?.error ??
        error?.message ??
        "Report generation failed";
      const stage = bodyDetail?.stage ? ` [stage: ${bodyDetail.stage}]` : "";
      const code = bodyDetail?.code ? ` (${bodyDetail.code})` : "";
      console.error("generateAiReport failure", { msg, stage, code, bodyDetail, error });
      throw new Error(`${msg}${code}${stage}`);
    }

    return {
      ok: true,
      ai_report_id: typeof (payload as { ai_report_id?: unknown }).ai_report_id === "string"
        ? (payload as { ai_report_id: string }).ai_report_id
        : null,
    };
  });
