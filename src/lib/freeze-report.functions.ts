// Phase 1.1 — Immutable report artifact server fn.
//
// On first call for a v1 queries row: invoke the orchestrator once, persist the
// full payload into queries.ai_report, stamp queries.frozen_at, and return a
// cached payload with audit_meta enriched with freezing + metering metadata.
//
// On subsequent calls: read queries.ai_report directly. No orchestrator call.
//
// /analysis/SYMBOL does NOT use this path — it remains a live re-compute via
// the supabase.functions.invoke path in the component.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { StockAnalysisPayload, QueryType } from "@/types/stock-analysis";
import { meteringFor, METERING_MODE, type ReportPath } from "@/lib/credit-metering";

const HORIZONS = ["intraday", "medium-term", "long-term"] as const;

const Input = z.object({
  queryId: z.string().uuid(),
  // Allow caller to force re-generate ("Refresh report"). Hidden in UI for now.
  forceRefresh: z.boolean().optional(),
});

async function callOrchestrator(
  symbol: string,
  horizon: QueryType,
  includeNews: boolean,
): Promise<StockAnalysisPayload> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase server env");
  const res = await fetch(`${url}/functions/v1/generate-stock-analysis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ symbol, query_type: horizon, include_news: includeNews }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Orchestrator HTTP ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  if (!json?.success) throw new Error(`Orchestrator returned error: ${json?.error ?? "unknown"}`);
  return json as StockAnalysisPayload;
}

function enrichAuditMeta(
  payload: StockAnalysisPayload,
  args: {
    frozenAt: string;
    servedFromCache: boolean;
    reportPath: ReportPath;
    orchestratorResponseId: string | null;
    artifactStatus: "frozen" | "regenerated";
  },
): StockAnalysisPayload {
  const decision = meteringFor(args.reportPath);
  const extended = {
    ...payload.audit_meta,
    report_artifact_status: args.artifactStatus,
    frozen_at: args.frozenAt,
    served_from_cache: args.servedFromCache,
    orchestrator_response_id: args.orchestratorResponseId,
    metering_mode: decision.metering_mode,
    credit_action: decision.credit_action,
  } as typeof payload.audit_meta & Record<string, unknown>;
  return { ...payload, audit_meta: extended };
}

export const freezeOrReadReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: row, error: readErr } = await supabaseAdmin
      .from("queries")
      .select("id, user_id, stock_symbol, stock_name, horizon, engine_version, engine_source, ai_report, frozen_at, report_artifact_status, orchestrator_response_id")
      .eq("id", data.queryId)
      .single();
    if (readErr || !row) throw new Error(`Query not found: ${readErr?.message ?? data.queryId}`);
    if (row.user_id !== userId) throw new Error("Not authorized to read this report");
    if (row.engine_version !== "v1_tier_shaped") {
      throw new Error("freezeOrReadReport only handles v1_tier_shaped records");
    }

    const symbol = (row.stock_symbol ?? row.stock_name ?? "").toString().toUpperCase();
    if (!symbol) throw new Error("Query row has no stock symbol");
    const horizonRaw = (row.horizon ?? "medium-term") as string;
    const horizon: QueryType = (HORIZONS as readonly string[]).includes(horizonRaw)
      ? (horizonRaw as QueryType)
      : "medium-term";

    const reportPath: ReportPath =
      row.engine_source === "regenerated_from_legacy"
        ? "legacy_regenerate"
        : "post_query_fresh_entry";

    // ─── Cache hit ───
    if (!data.forceRefresh && row.ai_report && row.frozen_at) {
      const cached = row.ai_report as unknown as StockAnalysisPayload;
      return enrichAuditMeta(cached, {
        frozenAt: row.frozen_at as string,
        servedFromCache: true,
        reportPath,
        orchestratorResponseId: (row.orchestrator_response_id as string | null) ?? null,
        artifactStatus: (row.report_artifact_status as "frozen" | "regenerated") ?? "frozen",
      });
    }

    // ─── First generation (or forced refresh) ───
    const fresh = await callOrchestrator(symbol, horizon, true);
    const frozenAt = new Date().toISOString();
    const artifactStatus: "frozen" | "regenerated" = data.forceRefresh ? "regenerated" : "frozen";

    const decision = meteringFor(reportPath);
    const persistPayload = enrichAuditMeta(fresh, {
      frozenAt,
      servedFromCache: false,
      reportPath,
      orchestratorResponseId: null,
      artifactStatus,
    });

    const { error: updErr } = await supabaseAdmin
      .from("queries")
      .update({
        ai_report: persistPayload as unknown as Record<string, unknown>,
        frozen_at: frozenAt,
        report_artifact_status: artifactStatus,
      })
      .eq("id", row.id);
    if (updErr) console.warn("[freezeOrReadReport] persist failed (non-fatal):", updErr);

    // Audit (best-effort)
    await supabaseAdmin.from("audit_events").insert({
      event_type: data.forceRefresh ? "report_refreshed" : "report_frozen",
      actor_id: userId,
      resource_type: "query",
      resource_id: row.id,
      payload: {
        symbol,
        horizon,
        report_artifact_status: artifactStatus,
        frozen_at: frozenAt,
        metering_mode: decision.metering_mode,
        credit_action: decision.credit_action,
        report_path: reportPath,
      },
    }).then(({ error }) => { if (error) console.warn("[freezeOrReadReport] audit failed:", error); });

    return persistPayload;
  });

/**
 * Discoverable constant for documentation tests — guarantees `analysis_direct`
 * never participates in the freeze flow.
 */
export const FREEZE_FLOW_EXCLUDES_DIRECT_ANALYSIS = {
  metering_mode: METERING_MODE,
  excluded_paths: ["analysis_direct"] as const,
};
