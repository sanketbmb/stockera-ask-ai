// Phase 3B — Sector View report freeze/read server fn.
// Mirrors freeze-report.functions.ts but for sector_view queries.
// On first call: resolves canonical sector, loads sector_aggregates row,
// composes deterministic payload, freezes into queries.ai_report.
// On subsequent calls: reads the frozen artifact directly.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  composeSectorReport,
  type SectorReportPayload,
  type SectorAggregateRow,
} from "@/lib/sector-context";
import { resolveSector } from "@/lib/sector-alias-map";
import { meteringFor } from "@/lib/credit-metering";
import type { QueryType } from "@/types/stock-analysis";
import { ensureSecondaryAnswers, type SecondaryAnswer } from "@/lib/mixed-query.server";

const HORIZONS = ["intraday", "medium-term", "long-term"] as const;

const Input = z.object({
  queryId: z.string().uuid(),
  forceRefresh: z.boolean().optional(),
});

export type SectorFreezeResult =
  | { ok: true; payload: SectorReportPayload; served_from_cache: boolean; frozen_at: string; secondary_answers: SecondaryAnswer[] }
  | { ok: false; code: "SECTOR_NOT_RESOLVED"; raw_sector: string | null }
  | { ok: false; code: "SECTOR_NOT_COVERED"; canonical: string; display: string };

export const freezeOrReadSectorReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }): Promise<SectorFreezeResult> => {
    const { userId } = context;

    const { data: row, error: readErr } = await supabaseAdmin
      .from("queries")
      .select(
        "id, user_id, query_type, engine_version, ai_report, frozen_at, horizon, query_text, custom_question, sector_canonical, router_meta"
      )
      .eq("id", data.queryId)
      .single();
    if (readErr || !row) throw new Error(`Query not found: ${readErr?.message ?? data.queryId}`);
    if (row.user_id !== userId) throw new Error("Not authorized to read this report");
    if (row.query_type !== "sector_view") {
      throw new Error("freezeOrReadSectorReport only handles sector_view records");
    }

    const horizonRaw = (row.horizon ?? "medium-term") as string;
    const horizon: QueryType = (HORIZONS as readonly string[]).includes(horizonRaw)
      ? (horizonRaw as QueryType)
      : "medium-term";

    // ── Cache hit ──
    if (!data.forceRefresh && row.ai_report && row.frozen_at) {
      const cached = row.ai_report as unknown as SectorReportPayload;
      if (cached?.schema_version === "v1_sector_view") {
        return {
          ok: true,
          payload: cached,
          served_from_cache: true,
          frozen_at: row.frozen_at as string,
        };
      }
    }

    // ── Resolve sector ──
    // Priority: persisted sector_canonical -> router_meta.sector -> query_text -> custom_question.
    const candidates: string[] = [];
    if (row.sector_canonical) candidates.push(row.sector_canonical as string);
    const routerMeta = (row.router_meta ?? null) as { sector?: string | null } | null;
    if (routerMeta?.sector) candidates.push(routerMeta.sector);
    if (row.query_text) candidates.push(row.query_text as string);
    if (row.custom_question) candidates.push(row.custom_question as string);

    let resolved: { canonical: string; display: string } | null = null;
    for (const c of candidates) {
      const r = resolveSector(c);
      if (r) { resolved = r; break; }
    }
    if (!resolved) {
      return { ok: false, code: "SECTOR_NOT_RESOLVED", raw_sector: candidates[0] ?? null };
    }

    // ── Load sector_aggregates row ──
    const { data: agg, error: aggErr } = await supabaseAdmin
      .from("sector_aggregates")
      .select(
        "sector_canonical, sector_display, pe_median, pb_median, pe_p25, pe_p75, pe_avg_5y, pe_low_5y, pe_high_5y, roe_median, return_12m_median_pct, sample_size, source, method_version, bootstrap_source_reference, as_of_timestamp, updated_at"
      )
      .eq("sector_canonical", resolved.canonical)
      .maybeSingle();
    if (aggErr) throw new Error(`Sector lookup failed: ${aggErr.message}`);
    if (!agg) {
      return { ok: false, code: "SECTOR_NOT_COVERED", canonical: resolved.canonical, display: resolved.display };
    }

    // ── Compose + freeze ──
    const payload = composeSectorReport(agg as SectorAggregateRow, horizon);
    const frozenAt = new Date().toISOString();
    const decision = meteringFor("post_query_sector_view");

    const { error: updErr } = await supabaseAdmin
      .from("queries")
      .update({
        ai_report: JSON.parse(JSON.stringify(payload)),
        frozen_at: frozenAt,
        report_artifact_status: "frozen",
        engine_version: "v1_sector_view",
        engine_source: "sector_aggregates",
        sector_canonical: payload.sector_canonical,
        sector_macro_state: payload.macro_state,
        status: "ai_answered",
      } as never)
      .eq("id", row.id);
    if (updErr) console.warn("[freezeOrReadSectorReport] persist failed (non-fatal):", updErr);

    await supabaseAdmin.from("audit_events").insert({
      event_type: "sector_report_frozen",
      actor_id: userId,
      resource_type: "query",
      resource_id: row.id,
      payload: {
        sector_canonical: payload.sector_canonical,
        macro_state: payload.macro_state,
        horizon,
        frozen_at: frozenAt,
        metering_mode: decision.metering_mode,
        credit_action: decision.credit_action,
        engine_version: "v1_sector_view",
        engine_source: "sector_aggregates",
        macro_state_inputs: payload.macro_state_inputs,
      },
    }).then(({ error }) => { if (error) console.warn("[freezeOrReadSectorReport] audit failed:", error); });

    return { ok: true, payload, served_from_cache: false, frozen_at: frozenAt };
  });
