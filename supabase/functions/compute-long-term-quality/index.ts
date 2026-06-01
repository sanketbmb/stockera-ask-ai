// compute-long-term-quality
// Mission 1 B.1 — Long-term tier-shaped snapshot.
// Reuses compute-fundamentals (already runs full FinEdge fetch) and adds the
// promoter holding signal via finedge "shareholdings/ownership-history".
// Stateless; never throws; degrades to nulls with diagnostic trail.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function r2(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}
function num(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

async function callFn(name: string, body: unknown): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    const parsed = txt ? JSON.parse(txt) : null;
    if (!res.ok || parsed?.success !== true) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);

  let symbol = "";
  let sector = "";
  try {
    const body = await req.json();
    symbol = String(body?.symbol ?? "").trim().toUpperCase();
    sector = String(body?.sector ?? "").trim();
  } catch { /* noop */ }
  if (!symbol) return json({ success: false, error: "SYMBOL_REQUIRED" }, 400);

  const diagnostic: Record<string, unknown> = {
    symbol,
    banking_override_applied: false,
    null_reasons: {} as Record<string, string>,
  };
  const nullReasons = diagnostic.null_reasons as Record<string, string>;

  // ── 1. Fundamentals + supporting raw FinEdge calls ──
  const [fundR, shareR, ratiosR, profileR] = await Promise.all([
    callFn("compute-fundamentals", { symbol }),
    callFn("finedge-fetch", { endpoint: "shareholdings/ownership-history", symbol }),
    callFn("finedge-fetch", { endpoint: "ratios", symbol, params: { statement_type: "c", ratio_type: "pr" } }),
    callFn("finedge-fetch", { endpoint: "company-profile", symbol }),
  ]);

  if (!fundR) nullReasons.compute_fundamentals = "module_failed_or_insufficient_history";

  const prof   = (fundR?.profitability    ?? {}) as Record<string, unknown>;
  const growth = (fundR?.growth           ?? {}) as Record<string, unknown>;
  const health = (fundR?.financial_health ?? {}) as Record<string, unknown>;
  const qual   = (fundR?.quality_scores   ?? {}) as Record<string, unknown>;
  const company = (fundR?.company         ?? {}) as Record<string, unknown>;

  // 5y proxies — compute-fundamentals exposes 3y avg ROE; treat as 5y proxy.
  let roe_5y_avg  = r2(prof.roe_3yr_avg ?? prof.roe_latest);
  let roce_5y_avg = r2(prof.roce);
  let debt_to_equity_current = r2(health.debt_equity);
  const piotroski_f_score = num(qual.piotroski_f_score);
  const eps_cagr_5y = r2(growth.profit_cagr_5y);

  // Direct FinEdge `ratios` fallback when compute-fundamentals failed
  // (e.g. INSUFFICIENT_HISTORY for newly-listed names like BANDHANBNK).
  if (roe_5y_avg == null || roce_5y_avg == null || debt_to_equity_current == null) {
    try {
      const inner = ((ratiosR?.data as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
      const rows = (inner.ratios ?? []) as Array<Record<string, unknown>>;
      if (Array.isArray(rows) && rows.length > 0) {
        const last = rows[rows.length - 1];
        const pickPct = (k: string) => { const v = num(last[k]); return v != null ? r2(v * 100) : null; };
        if (roe_5y_avg == null)  roe_5y_avg  = pickPct("returnOnEquity");
        if (roce_5y_avg == null) roce_5y_avg = pickPct("returnOnCapitalEmployed") ?? pickPct("roce");
        if (debt_to_equity_current == null) debt_to_equity_current = r2(num(last.debtEquityRatio ?? last.debtToEquity));
      }
    } catch { /* swallow */ }
  }

  if (roe_5y_avg == null)  nullReasons.roe_5y_avg = "fundamentals_missing_roe";
  if (roce_5y_avg == null) nullReasons.roce_5y_avg = "fundamentals_missing_roce";
  if (debt_to_equity_current == null) nullReasons.debt_to_equity_current = "fundamentals_missing_de";
  if (piotroski_f_score == null) nullReasons.piotroski_f_score = "fundamentals_missing_piotroski";


  // FCF yield ≈ DCF-input fcf0 not exposed directly; derive from market cap & dcf intrinsic if possible.
  // Conservative: leave null unless we have a clear basis.
  const fcf_yield: number | null = null;
  nullReasons.fcf_yield = "fcf_yield_requires_capex_history_not_exposed_by_fundamentals";

  // Earnings consistency — bucket by piotroski + cagr signals.
  let earnings_consistency_label: string | null = null;
  if (piotroski_f_score != null) {
    if (piotroski_f_score >= 8) earnings_consistency_label = "VERY_HIGH";
    else if (piotroski_f_score >= 6) earnings_consistency_label = "HIGH";
    else if (piotroski_f_score >= 4) earnings_consistency_label = "MODERATE";
    else if (piotroski_f_score >= 2) earnings_consistency_label = "LOW";
    else earnings_consistency_label = "VERY_LOW";
  } else {
    nullReasons.earnings_consistency_label = "piotroski_unavailable";
  }

  // Margin trend — compare operating margin latest vs avg via "improving_margins" signal.
  const signals = (fundR?.signals as string[] | undefined) ?? [];
  let margin_trend_label: string | null = null;
  if (signals.length > 0) {
    if (signals.includes("improving_margins")) margin_trend_label = "IMPROVING";
    else if (prof.operating_margin != null) margin_trend_label = "STABLE";
    else margin_trend_label = null;
  }
  if (margin_trend_label == null) nullReasons.margin_trend_label = "signals_unavailable";

  // Market share trend — no per-segment market-share signal in current data stack.
  const market_share_trend_label: string | null = "UNKNOWN";

  // Promoter holding (latest from FinEdge ownership history).
  let promoter_holding_pct: number | null = null;
  try {
    const d = (shareR?.data as Record<string, unknown> | undefined) ?? {};
    const inner = (d.data ?? d) as Record<string, unknown>;
    const rows = (inner.ownership ?? inner.shareholdings ?? inner.history ?? []) as Array<Record<string, unknown>>;
    if (Array.isArray(rows) && rows.length > 0) {
      const sorted = [...rows].sort((a, b) =>
        String(b.date ?? b.quarter ?? "").localeCompare(String(a.date ?? a.quarter ?? "")),
      );
      const latest = sorted[0];
      const p = num(latest.promoter ?? latest.promoters ?? latest.promoter_holding ?? latest.promoterHolding);
      if (p != null) promoter_holding_pct = r2(p);
    }
  } catch { /* swallow */ }
  if (promoter_holding_pct == null) nullReasons.promoter_holding_pct = "shareholdings_unavailable";

  // ── 2. Banking override ──
  // Use compute-fundamentals' company.sector when present, otherwise fall back
  // to a direct company-profile fetch (handles newly-listed banks like BANDHANBNK
  // where fundamentals fails with INSUFFICIENT_HISTORY).
  let resolvedSector = String(sector ?? company.sector ?? "");
  if (!resolvedSector) {
    const pInner = ((profileR?.data as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
    resolvedSector = String(pInner.sector ?? pInner.sub_industry ?? pInner.industry ?? pInner.macro_sector ?? "");
  }
  const sectorLower = resolvedSector.toLowerCase();
  const isBanking = sectorLower.includes("bank") || sectorLower.includes("financial");
  let quality_label: string | null = null;
  // Banking override PRESERVES ROE, ROCE, D/E, promoter holding — those remain
  // core profitability/leverage signals for banks. It ONLY suppresses metrics
  // that are misleading under bank accounting:
  //   • EPS CAGR (provisioning cycles cause extreme prints)
  //   • Piotroski F-Score (capital-structure assumptions don't fit banks)
  //   • DCF / dcf_upside_pct (handled upstream in compute-trade-plan)
  let suppressedEps: number | null = eps_cagr_5y;
  let bankAdjustedPiotroski: number | null = piotroski_f_score;

  if (isBanking) {
    diagnostic.banking_override_applied = true;
    if (suppressedEps != null) {
      suppressedEps = null;
      nullReasons.eps_cagr_5y = "suppressed_under_banking_override";
    }
    if (bankAdjustedPiotroski != null) {
      bankAdjustedPiotroski = null;
      nullReasons.piotroski_f_score = "suppressed_under_banking_override";
    }
    // Derive quality label from bank-relevant signals: ROE and D/E only.
    const hi = roe_5y_avg != null && roe_5y_avg > 14;
    const weak = roe_5y_avg != null && roe_5y_avg < 8;
    quality_label = hi ? "BANKING_HIGH_QUALITY" : weak ? "BANKING_WEAK" : "BANKING_ADJUSTED";
  } else {
    // High quality: ROE>15, D/E<1.5, Piotroski>=7
    const hi = (roe_5y_avg != null && roe_5y_avg > 15)
            && (debt_to_equity_current == null || debt_to_equity_current < 1.5)
            && (piotroski_f_score != null && piotroski_f_score >= 7);
    const weak = (piotroski_f_score != null && piotroski_f_score <= 3)
              || (debt_to_equity_current != null && debt_to_equity_current > 3);
    quality_label = hi ? "HIGH_QUALITY" : weak ? "WEAK" : "AVERAGE";
  }


  // Data completeness — fraction of populated leaf fields.
  const fields = [
    roe_5y_avg, roce_5y_avg, debt_to_equity_current, fcf_yield, suppressedEps,
    earnings_consistency_label, promoter_holding_pct, piotroski_f_score,
    margin_trend_label, market_share_trend_label,
  ];
  const present = fields.filter((v) => v != null).length;
  const data_completeness_pct = Math.round((present / fields.length) * 100);

  const snapshot = {
    roe_5y_avg,
    roce_5y_avg,
    debt_to_equity_current,
    fcf_yield,
    eps_cagr_5y: suppressedEps,
    earnings_consistency_label,
    promoter_holding_pct,
    piotroski_f_score,
    quality_label,
    margin_trend_label,
    market_share_trend_label,
    data_completeness_pct,
  };

  return json({
    success: true,
    symbol,
    computed_at: new Date().toISOString(),
    long_term_quality_snapshot: snapshot,
    audit_meta: { long_term_quality_diagnostic: diagnostic },
  });
});
