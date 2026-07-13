// SEO Stage 1 hotfix — anon-safe reader for public-library report rows.
// Uses supabaseAdmin (loaded inside the handler) but only returns rows where
// is_public_library = true AND library_tombstoned_at IS NULL AND ai_report
// IS NOT NULL. Matches the guarantee the anon RLS policy would give if it
// existed. Safe to call unauthenticated — no PII, no unlock, no wallet.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getPublicReportRow = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ queryId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("queries")
      .select(
        "id, stock_name, stock_symbol, buy_price, current_price, ai_report, created_at, status, assigned_analyst_id, engine_version, engine_source, horizon, custom_question, query_text, query_type, entry_price, qty, router_meta, is_public_library, library_tombstoned_at",
      )
      .eq("id", data.queryId)
      .maybeSingle();
    if (error || !row) return { found: false as const };
    if (
      row.is_public_library !== true ||
      row.library_tombstoned_at !== null ||
      row.ai_report === null
    ) {
      return { found: false as const };
    }
    let analyst: { display_name: string; sebi_reg_number: string; avatar_url: string | null } | null = null;
    if (row.assigned_analyst_id) {
      const { data: a } = await supabaseAdmin
        .from("analyst_profiles")
        .select("display_name, sebi_reg_number, avatar_url")
        .eq("id", row.assigned_analyst_id)
        .maybeSingle();
      analyst = a;
    }
    return { found: true as const, row: { ...row, analyst } };
  });
