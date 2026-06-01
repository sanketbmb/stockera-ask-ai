// Server fn: clones a legacy query record into a fresh v1_tier_shaped row,
// preserving symbol/horizon/raw_text. NO wallet deduction — regeneration
// is explicitly free in Phase 1. Audit trail: writes an `audit_events`
// row with credit_action="skipped_free_regeneration".

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { meteringFor } from "@/lib/credit-metering";

const Input = z.object({ legacyQueryId: z.string().uuid() });

export const regenerateFromLegacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: legacy, error: readErr } = await supabase
      .from("queries")
      .select("id, user_id, stock_name, stock_symbol, query_text, query_type, horizon, engine_version, buy_price, current_price")
      .eq("id", data.legacyQueryId)
      .single();
    if (readErr || !legacy) {
      throw new Error(`Legacy record not found: ${readErr?.message ?? data.legacyQueryId}`);
    }
    if (legacy.user_id !== userId) {
      throw new Error("Not authorized to regenerate this report");
    }
    if (legacy.engine_version === "v1_tier_shaped") {
      throw new Error("This report is already on the latest engine");
    }

    const horizon = legacy.horizon ?? "medium-term";

    const { data: inserted, error: insErr } = await supabase
      .from("queries")
      .insert({
        user_id: userId,
        stock_name: legacy.stock_name,
        stock_symbol: legacy.stock_symbol,
        buy_price: legacy.buy_price,
        current_price: legacy.current_price,
        query_text: legacy.query_text,
        query_type: "fresh_entry",
        status: "ai_answered",
        engine_version: "v1_tier_shaped",
        engine_source: "regenerated_from_legacy",
        horizon,
        custom_question: legacy.query_text,
        regenerated_from_uuid: legacy.id,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      throw new Error(`Failed to create regenerated record: ${insErr?.message}`);
    }

    // Audit (best effort, non-fatal) — uses centralized credit-metering module.
    const decision = meteringFor("legacy_regenerate");
    await supabase.from("audit_events").insert({
      event_type: "report_regenerated_from_legacy",
      actor_id: userId,
      resource_type: "query",
      resource_id: inserted.id,
      payload: {
        legacy_query_id: legacy.id,
        symbol: legacy.stock_symbol,
        horizon,
        engine_version: "v1_tier_shaped",
        engine_source: "regenerated_from_legacy",
        metering_mode: decision.metering_mode,
        credit_action: decision.credit_action,
      },
    });

    return { queryId: inserted.id as string };
  });
