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
import type { StockAnalysisPayload, QueryType, UnsupportedSymbolPayload } from "@/types/stock-analysis";
import { isUnsupportedSymbolPayload } from "@/types/stock-analysis";
import { meteringFor, METERING_MODE, type ReportPath } from "@/lib/credit-metering";
import { ensureSecondaryAnswers } from "@/lib/mixed-query.server";

const HORIZONS = ["intraday", "short-term", "medium-term", "long-term"] as const;

const Input = z.object({
  queryId: z.string().uuid(),
  // Allow caller to force re-generate ("Refresh report"). Hidden in UI for now.
  forceRefresh: z.boolean().optional(),
});

async function callOrchestrator(
  symbol: string,
  horizon: QueryType,
  includeNews: boolean,
): Promise<StockAnalysisPayload | UnsupportedSymbolPayload> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SB_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
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
  // Wave 5f — UNSUPPORTED_SYMBOL is a structured success payload, not an error.
  if (isUnsupportedSymbolPayload(json)) return json as UnsupportedSymbolPayload;
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

// Phase 3A — freeze-layer verdict suppression. No engine math touched.
// Maps engine reasoning_code → safer surfaced verdict + strips trade levels.
// Applied to both newly-frozen payloads AND cache reads, so older rows get
// hardened the next time the user opens them.
//
// Wave 1 fix: code-based rules are evaluated first; the trending-down branch
// runs independently on the trend label (previously it was gated by a regex
// rule's appliesTo("") call which always returned false, so the hook was
// effectively dead for the trending-down case).
type SuppressedVerdict = "WAIT_FOR_CLARITY" | "MONITOR";
type HorizonKey = "intraday" | "short-term" | "medium-term" | "long-term";
type RuleId = "ENTRY_ZONE_INVERTED" | "SHORT_CORRECTIVE_LOW_CONVICTION" | "TRENDING_DOWN_FRESH_ENTRY";

interface CodeRule {
  kind: "code";
  id: RuleId;
  surfaced: SuppressedVerdict;
  matches: (queryType: string, code: string) => boolean;
}
interface TrendRule {
  kind: "trend";
  id: RuleId;
  surfaced: SuppressedVerdict;
  matches: (queryType: string, trendLabel: string) => boolean;
}
type SuppressionRule = CodeRule | TrendRule;

const SUPPRESSION_RULES: SuppressionRule[] = [
  {
    kind: "code",
    id: "ENTRY_ZONE_INVERTED",
    surfaced: "MONITOR",
    matches: (_qt, code) => /_ZONE_INVERTED_FALLBACK/i.test(code),
  },
  {
    kind: "code",
    id: "SHORT_CORRECTIVE_LOW_CONVICTION",
    surfaced: "WAIT_FOR_CLARITY",
    matches: (_qt, code) => /SHORT_CORRECTIVE_LOW_CONVICTION/i.test(code),
  },
  {
    kind: "trend",
    id: "TRENDING_DOWN_FRESH_ENTRY",
    surfaced: "WAIT_FOR_CLARITY",
    matches: (qt, trendLabel) =>
      qt === "fresh_entry" &&
      (trendLabel.includes("TRENDING_DOWN") ||
        trendLabel.includes("DOWNTREND") ||
        trendLabel.includes("BEARISH")),
  },
];

// Wave 5a Step 2 — horizon-aware suppression prose. Same rule + verdict action
// across horizons, but the surfaced reason text branches by horizon so an
// intraday report no longer reads identically to a long-term one.
const SUPPRESSION_REASON_TEXT: Record<RuleId, Record<HorizonKey, string>> = {
  ENTRY_ZONE_INVERTED: {
    "intraday": "Intraday entry zone is inverted — monitor for a cleaner micro-structure before stepping in.",
    "short-term": "Short-term entry zone is inverted — wait for a cleaner swing setup before entering.",
    "medium-term": "Medium-term entry zone is inverted — monitor for a cleaner positional base to form.",
    "long-term": "Long-term entry zone is inverted — accumulate only after a cleaner base develops.",
  },
  SHORT_CORRECTIVE_LOW_CONVICTION: {
    "intraday": "Intraday tape is in a short corrective leg with low conviction — wait for direction to confirm.",
    "short-term": "Short-term swing is corrective with low conviction — wait for a clearer reversal signal.",
    "medium-term": "Medium-term setup is corrective with low conviction — wait for trend clarity before committing.",
    "long-term": "Long-term thesis intact but near-term setup is corrective — wait for a cleaner accumulation zone.",
  },
  TRENDING_DOWN_FRESH_ENTRY: {
    "intraday": "Intraday tape is bearish — avoid fresh entries until intraday structure flips.",
    "short-term": "Short-term trend is down — wait for a swing-low reversal before fresh entries.",
    "medium-term": "Medium-term trend is down — wait for structure to base out before fresh entries.",
    "long-term": "Long-term trend is weakening — defer fresh accumulation until a durable base forms.",
  },
};

function normalizeHorizon(h: string | null | undefined): HorizonKey {
  const v = (h ?? "").toLowerCase();
  if (v === "intraday" || v === "short-term" || v === "medium-term" || v === "long-term") return v;
  return "medium-term";
}

function applyVerdictSuppression(
  payload: StockAnalysisPayload,
  queryType: string,
  horizonInput: string,
): StockAnalysisPayload {
  const code = payload.levels?.entry_strategy?.reasoning_code ?? "";
  const trendLabel = (payload.technical_snapshot?.trend_label ?? "").toUpperCase();
  const horizon = normalizeHorizon(horizonInput);

  let matched: SuppressionRule | null = null;
  for (const rule of SUPPRESSION_RULES) {
    const ok = rule.kind === "code"
      ? rule.matches(queryType, code)
      : rule.matches(queryType, trendLabel);
    if (ok) { matched = rule; break; }
  }
  if (!matched) return payload;

  const reason = SUPPRESSION_REASON_TEXT[matched.id][horizon];

  const auditExt = payload.audit_meta as unknown as Record<string, unknown>;
  // Idempotent — skip only if previously suppressed with same surfaced verdict
  // AND same horizon + rule (so re-opens on a different horizon refresh prose).
  if (
    auditExt.verdict_suppressed === true &&
    auditExt.suppressed_surfaced === matched.surfaced &&
    auditExt.suppressed_horizon === horizon &&
    auditExt.suppressed_rule_id === matched.id
  ) {
    return payload;
  }

  return {
    ...payload,
    final_verdict: {
      ...payload.final_verdict,
      // Surface as WATCHLIST in the orchestrator enum (renderer-safe) and
      // record the richer label in audit_meta.
      action: "WATCHLIST",
      summary_reason: reason,
    },
    levels: {
      ...payload.levels,
      entry_zone: null,
      stop_loss: null,
      target_1: null,
      target_2: null,
      entry_strategy: payload.levels.entry_strategy
        ? { ...payload.levels.entry_strategy, preferred_entry: 0 }
        : null,
    },
    audit_meta: {
      ...payload.audit_meta,
      verdict_suppressed: true,
      suppressed_surfaced: matched.surfaced,
      suppressed_rule_id: matched.id,
      suppressed_horizon: horizon,
      suppressed_reason: reason,
      suppressed_reasoning_code: code || null,
      suppressed_trend_label: trendLabel || null,
      levels_suppressed: true,
    } as typeof payload.audit_meta & Record<string, unknown>,
  };
}

export const freezeOrReadReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: row, error: readErr } = await supabaseAdmin
      .from("queries")
      .select("id, user_id, stock_symbol, stock_name, horizon, engine_version, engine_source, ai_report, frozen_at, report_artifact_status, orchestrator_response_id, query_type, custom_question, query_text, secondary_asks, secondary_answers, mixed_query_meta")
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

    // Phase 2 — read user-supplied position context (additive columns).
    const rowExtra = row as unknown as {
      entry_price?: number | null;
      qty?: number | null;
      query_type?: string | null;
      custom_question?: string | null;
    };
    const queryType = rowExtra.query_type ?? "fresh_entry";

    const reportPath: ReportPath =
      row.engine_source === "regenerated_from_legacy"
        ? "legacy_regenerate"
        : queryType === "existing_position"
        ? "post_query_existing_position"
        : queryType === "averaging"
        ? "post_query_averaging"
        : "post_query_fresh_entry";

    // ─── Cache hit ───
    if (!data.forceRefresh && row.ai_report && row.frozen_at) {
      const cached = row.ai_report as unknown as StockAnalysisPayload;
      const suppressed = applyVerdictSuppression(cached, queryType, horizon);

      // Wave 1 fix: if suppression newly applies on a cache read, re-persist
      // the hardened payload so the DB reflects the safer verdict on subsequent
      // queries (admin tools, analytics, etc.). Best-effort, non-fatal.
      const cachedAudit = (cached.audit_meta ?? {}) as unknown as Record<string, unknown>;
      const suppressedAudit = (suppressed.audit_meta ?? {}) as unknown as Record<string, unknown>;
      const newlySuppressed =
        suppressedAudit.verdict_suppressed === true &&
        cachedAudit.verdict_suppressed !== true;
      if (newlySuppressed) {
        const { error: rePersistErr } = await supabaseAdmin
          .from("queries")
          .update({ ai_report: JSON.parse(JSON.stringify(suppressed)) } as never)
          .eq("id", row.id);
        if (rePersistErr) {
          console.warn("[freezeOrReadReport] cache-hit re-persist failed (non-fatal):", rePersistErr);
        } else {
          await supabaseAdmin.from("audit_events").insert({
            event_type: "verdict_suppression_applied_on_read",
            actor_id: userId,
            resource_type: "query",
            resource_id: row.id,
            payload: {
              suppressed_surfaced: String(suppressedAudit.suppressed_surfaced ?? ""),
              suppressed_reason: String(suppressedAudit.suppressed_reason ?? ""),
              trend_label: String(suppressedAudit.suppressed_trend_label ?? ""),
              reasoning_code: String(suppressedAudit.suppressed_reasoning_code ?? ""),
            },
          }).then(({ error }) => {
            if (error) console.warn("[freezeOrReadReport] suppress-audit failed:", error);
          });
        }
      }

      const enriched = enrichAuditMeta(suppressed, {
        frozenAt: row.frozen_at as string,
        servedFromCache: true,
        reportPath,
        orchestratorResponseId: (row.orchestrator_response_id as string | null) ?? null,
        artifactStatus: (row.report_artifact_status as "frozen" | "regenerated") ?? "frozen",
      });
      const { answers } = await ensureSecondaryAnswers({
        row: row as never,
        reportKind: "stock",
        primaryPayload: enriched as unknown as Record<string, unknown>,
        actorId: userId,
      });
      return { ...enriched, secondary_answers: answers } as StockAnalysisPayload & {
        secondary_answers: typeof answers;
      };
    }

    // ─── First generation (or forced refresh) ───
    const fresh = await callOrchestrator(symbol, horizon, true);
    const frozenAt = new Date().toISOString();
    const artifactStatus: "frozen" | "regenerated" = data.forceRefresh ? "regenerated" : "frozen";

    const decision = meteringFor(reportPath);
    const freshSuppressed = applyVerdictSuppression(fresh, queryType, horizon);
    const persistPayload = enrichAuditMeta(freshSuppressed, {
      frozenAt,
      servedFromCache: false,
      reportPath,
      orchestratorResponseId: null,
      artifactStatus,
    });

    // Phase 2 — compute profit_loss_pct + position_state additively.
    const entryPrice = rowExtra.entry_price != null ? Number(rowExtra.entry_price) : null;
    const currentPrice = fresh.price_context?.current_price ?? null;
    const plPct = entryPrice && entryPrice > 0 && currentPrice != null
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : null;
    const positionState =
      queryType === "averaging"
        ? "averaging"
        : plPct == null
        ? null
        : plPct >= 5
        ? "profit_review"
        : plPct <= -5
        ? "loss_review"
        : "neutral_review";

    const { error: updErr } = await supabaseAdmin
      .from("queries")
      .update({
        ai_report: JSON.parse(JSON.stringify(persistPayload)),
        frozen_at: frozenAt,
        report_artifact_status: artifactStatus,
        ...(plPct != null ? { profit_loss_pct: plPct } : {}),
        ...(positionState ? { position_state: positionState, addendum_used: positionState } : {}),
      } as never)
      .eq("id", row.id);
    if (updErr) console.warn("[freezeOrReadReport] persist failed (non-fatal):", updErr);

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
        query_type: queryType,
        position_state: positionState,
        profit_loss_pct: plPct,
        entry_price_input: entryPrice,
        qty_input: rowExtra.qty ?? null,
        custom_question_present: !!rowExtra.custom_question,
      },
    }).then(({ error }) => { if (error) console.warn("[freezeOrReadReport] audit failed:", error); });

    const { answers: secondaryAnswers } = await ensureSecondaryAnswers({
      row: row as never,
      reportKind: "stock",
      primaryPayload: persistPayload as unknown as Record<string, unknown>,
      actorId: userId,
    });

    return { ...persistPayload, secondary_answers: secondaryAnswers } as StockAnalysisPayload & {
      secondary_answers: typeof secondaryAnswers;
    };
  });

export const FREEZE_FLOW_EXCLUDES_DIRECT_ANALYSIS = {
  metering_mode: METERING_MODE,
  excluded_paths: ["analysis_direct"] as const,
};
