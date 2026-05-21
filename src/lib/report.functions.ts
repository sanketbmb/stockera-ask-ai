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
    const { data: payload, error } = await context.supabase.functions.invoke("generate-ai-report", {
      body: { query_id: data.queryId },
    });

    const response = (error as { context?: Response } | null)?.context;
    if (error || !payload?.ok) {
      let detail = (payload as { details?: string; error?: string; message?: string } | null)?.details
        ?? (payload as { error?: string; message?: string } | null)?.error
        ?? error?.message
        ?? "Generation failed";
      if (response) {
        try {
          const body = await response.clone().json() as { details?: string; error?: string; message?: string };
          detail = body.details ?? body.error ?? body.message ?? detail;
        } catch {
          // Keep the best available message.
        }
      }
      throw new Error(detail);
    }

    return {
      ok: true,
      ai_report_id: typeof payload.ai_report_id === "string" ? payload.ai_report_id : null,
      report: payload.report && typeof payload.report === "object" ? payload.report as Record<string, unknown> : null,
    };
  });