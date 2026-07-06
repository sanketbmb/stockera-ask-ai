// Stage 4F.1 — Video Answers server contract.
// Thin wrappers over three SECURITY DEFINER RPCs. All privacy-sensitive
// decisions (locked vs unlocked; who may read youtube_video_id) live in
// the RPCs, not here.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const answerIdInput = z.object({ answerId: z.string().uuid() });
const symbolInput = z.object({ symbol: z.string().min(1).max(32) });

// ------- unlockVideoAnswer -------
export const unlockVideoAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => answerIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: res, error } = await supabase.rpc("unlock_video_answer", {
      p_answer_id: data.answerId,
    });
    if (error) throw new Error(error.message);
    return res as {
      status: string;
      entitlement_id?: string;
      credits_used?: number;
      new_balance?: number;
      balance?: number;
      required?: number;
    };
  });

// ------- getVideoAnswer -------
export const getVideoAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => answerIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: res, error } = await supabase.rpc("get_video_answer", {
      p_answer_id: data.answerId,
    });
    if (error) throw new Error(error.message);
    return res as
      | { status: "not_found" | "unauthenticated" }
      | {
          status: "ok";
          locked: true;
          answer_id: string;
          query_id: string | null;
          symbol: string | null;
          stock_name: string | null;
          verdict: string | null;
          analyst: { analyst_id: string; display_name: string; sebi_reg_number: string | null } | null;
          unlock_price_credits: number;
          video_duration_sec: number | null;
          poster_thumb: string;
          published_at: string;
          // 4F.3 APPLY-1 additive fields (types-only surface here; RPC already returns them).
          question_addressed: string | null;
          video_title: string | null;
          video_description: string | null;
        }
      | {
          status: "ok";
          locked: false;
          answer_id: string;
          query_id: string | null;
          symbol: string | null;
          stock_name: string | null;
          verdict: string | null;
          analyst: { analyst_id: string; display_name: string; sebi_reg_number: string | null } | null;
          youtube_video_id: string;
          video_duration_sec: number | null;
          published_at: string;
          question_addressed: string | null;
          video_title: string | null;
          video_description: string | null;
        };

  });

// ------- listVideoAnswersForSymbol -------
// Public (anon-safe). Uses the server publishable client — no session, no bearer.
// The underlying RPC never returns youtube_video_id.
export const listVideoAnswersForSymbol = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => symbolInput.parse(input))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const client = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: rows, error } = await client.rpc(
      "list_public_video_answers_for_symbol",
      { p_symbol: data.symbol },
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      answer_id: string;
      query_id: string | null;
      symbol: string | null;
      stock_name: string | null;
      verdict: string | null;
      unlock_price_credits: number;
      video_duration_sec: number | null;
      poster_thumb: string;
      analyst_id: string | null;
      analyst_name: string | null;
      analyst_sebi_reg_number: string | null;
      published_at: string;
    }>;
  });
