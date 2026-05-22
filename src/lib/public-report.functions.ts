import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PREVIEW_LEN = 280;

export const getPublicReport = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ queryId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: query, error: qErr } = await supabaseAdmin
      .from("queries")
      .select("id, stock_name, stock_symbol, query_text, created_at, assigned_analyst_id")
      .eq("id", data.queryId)
      .maybeSingle();
    if (qErr || !query) return { found: false as const };

    const { data: ans } = await supabaseAdmin
      .from("answers")
      .select("body, verdict, key_level, time_horizon, risk_note, created_at, expert_id, answer_type")
      .eq("query_id", data.queryId)
      .eq("is_published", true)
      .eq("answer_type", "text")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const analystId = ans?.expert_id ?? query.assigned_analyst_id;
    let analyst: { display_name: string; sebi_reg_number: string; sebi_type: string; avatar_url: string | null } | null = null;
    if (analystId) {
      const { data: a } = await supabaseAdmin
        .from("analyst_profiles")
        .select("display_name, sebi_reg_number, sebi_type, avatar_url")
        .eq("id", analystId)
        .maybeSingle();
      analyst = a;
    }

    const bodyFull = ans?.body ?? "";
    const truncated = bodyFull.length > PREVIEW_LEN;
    const preview = truncated ? bodyFull.slice(0, PREVIEW_LEN).trim() + "…" : bodyFull;

    return {
      found: true as const,
      query: {
        id: query.id,
        stock_name: query.stock_name,
        stock_symbol: query.stock_symbol,
        question_preview: (query.query_text ?? "").slice(0, 160),
        created_at: query.created_at,
      },
      answer: ans
        ? {
            preview,
            truncated,
            verdict: ans.verdict,
            key_level: ans.key_level,
            time_horizon: ans.time_horizon,
            risk_note: ans.risk_note,
            created_at: ans.created_at,
          }
        : null,
      analyst,
      analystId,
    };
  });
