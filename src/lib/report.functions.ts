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
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Report service is not configured");
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-ai-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${context.claims.session_id ? "" : ""}`,
      },
      body: JSON.stringify({ query_id: data.queryId }),
    });

    const payload = await response.json().catch(() => null) as { ok?: boolean; details?: string; error?: string; message?: string; report?: unknown; ai_report_id?: string } | null;
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.details ?? payload?.error ?? payload?.message ?? `Report generation failed (${response.status})`);
    }

    return payload;
  });