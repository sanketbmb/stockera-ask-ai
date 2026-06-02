// Phase 3B — Deterministic Sector View composer.
// Pure function. No LLM, no network. Mirrors the pattern of position-context.ts.
//
// Input: a sector_aggregates row + horizon framing.
// Output: a fully-typed payload that <SectorViewReport /> renders verbatim and
// that we freeze into queries.ai_report on first generation.

import type { QueryType } from "@/types/stock-analysis";

export type SectorMacroState = "Constructive" | "Balanced" | "Cautious" | "Coverage Limited";

export interface SectorAggregateRow {
  sector_canonical: string;
  sector_display: string | null;
  pe_median: number | null;
  pb_median: number | null;
  pe_p25: number | null;
  pe_p75: number | null;
  pe_avg_5y: number | null;
  pe_low_5y: number | null;
  pe_high_5y: number | null;
  roe_median: number | null;
  return_12m_median_pct: number | null;
  sample_size: number | null;
  source: string;
  method_version: string;
  bootstrap_source_reference: string | null;
  as_of_timestamp: string;
  updated_at: string;
}

export interface SectorReportPayload {
  schema_version: "v1_sector_view";
  sector_canonical: string;
  sector_display: string;
  horizon: QueryType;
  macro_state: SectorMacroState;
  macro_state_inputs: {
    pe_median: number | null;
    pb_median: number | null;
    roe_median: number | null;
    pe_avg_5y: number | null;
    return_12m_median_pct: number | null;
    sample_size: number | null;
    branch: "primary_5y_roe" | "fallback_pe_roe" | "fallback_roe_only" | "fallback_pe_only" | "coverage_limited";
  };
  hero: {
    headline: string;
    subtext: string;
    body_lines: string[];
  };
  valuation_card: {
    title: "Valuation Snapshot";
    pe_median: number | null;
    pb_median: number | null;
    pe_p25: number | null;
    pe_p75: number | null;
    return_12m_median_pct: number | null;
    note: string;
  };
  profitability_placeholder: {
    title: "Profitability & Quality";
    body: string;
    coming_in: "v1.1";
  };
  historical_placeholder: {
    title: "5Y Context";
    body: string;
    coming_in: "v1.1";
  };
  what_this_means: {
    title: "What This Means";
    interpretation: string;
    watch_for: string;
    conviction_boosters: string[];
    conviction_dampeners: string[];
  };
  action_buckets: {
    title: "Sector Next Steps";
    items: string[];
  };
  top_stocks_placeholder: {
    title: "Top names in this sector";
    body: string;
  };
  coverage_note: string;
  audit_footer: {
    engine_version: "v1_sector_view";
    engine_source: "sector_aggregates";
    sector_canonical: string;
    macro_state: SectorMacroState;
    as_of_timestamp: string;
    method_version: string;
    bootstrap_source_reference: string | null;
    source: string;
    inputs: SectorReportPayload["macro_state_inputs"];
  };
}

function round1(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 10) / 10;
}

function deriveMacroState(row: SectorAggregateRow): {
  state: SectorMacroState;
  branch: SectorReportPayload["macro_state_inputs"]["branch"];
} {
  const pe = row.pe_median;
  const roe = row.roe_median;
  const peAvg5 = row.pe_avg_5y;

  // Coverage limited if both core signals are absent.
  if (pe == null && roe == null) {
    return { state: "Coverage Limited", branch: "coverage_limited" };
  }

  // Primary: 5Y avg + ROE both present.
  if (pe != null && peAvg5 != null && peAvg5 > 0 && roe != null) {
    const premium = (pe - peAvg5) / peAvg5;
    if (premium <= 0.05 && roe >= 14) return { state: "Constructive", branch: "primary_5y_roe" };
    if (premium >= 0.20 || roe < 8) return { state: "Cautious", branch: "primary_5y_roe" };
    return { state: "Balanced", branch: "primary_5y_roe" };
  }

  // Fallback: PE + ROE both present, no 5Y avg.
  if (pe != null && roe != null) {
    if (roe >= 14 && pe <= 25) return { state: "Constructive", branch: "fallback_pe_roe" };
    if (roe < 8 || pe > 40) return { state: "Cautious", branch: "fallback_pe_roe" };
    return { state: "Balanced", branch: "fallback_pe_roe" };
  }

  // Extension A: ROE-only.
  if (roe != null) {
    if (roe >= 14) return { state: "Constructive", branch: "fallback_roe_only" };
    if (roe < 8) return { state: "Cautious", branch: "fallback_roe_only" };
    return { state: "Balanced", branch: "fallback_roe_only" };
  }

  // Extension B: PE-only (this is the branch every live row hits today).
  if (pe != null) {
    if (pe <= 20) return { state: "Constructive", branch: "fallback_pe_only" };
    if (pe > 40) return { state: "Cautious", branch: "fallback_pe_only" };
    return { state: "Balanced", branch: "fallback_pe_only" };
  }

  return { state: "Coverage Limited", branch: "coverage_limited" };
}

function heroCopy(state: SectorMacroState, display: string, pe: number | null): { headline: string; subtext: string; body_lines: string[] } {
  const peStr = pe != null ? `~${pe}x` : "n/a";
  switch (state) {
    case "Constructive":
      return {
        headline: `${display} currently looks constructive`,
        subtext: "Baseline sector profile · live constituent aggregation rolling out in v1.1.",
        body_lines: [
          `Headline valuation sits around ${peStr} earnings — at the lower end of the typical Indian-listed band.`,
          "This is a sector that tends to warrant a closer look rather than an automatic pass; individual stock quality still decides the outcome.",
        ],
      };
    case "Cautious":
      return {
        headline: `${display} currently warrants caution`,
        subtext: "Baseline sector profile · live constituent aggregation rolling out in v1.1.",
        body_lines: [
          `Headline valuation sits around ${peStr} earnings — at the upper end of the typical Indian-listed band.`,
          "Crowded sectors tend to leave less margin for execution slips. Sizing discipline and entry patience usually matter more here.",
        ],
      };
    case "Balanced":
      return {
        headline: `${display} looks broadly balanced`,
        subtext: "Baseline sector profile · live constituent aggregation rolling out in v1.1.",
        body_lines: [
          `Headline valuation around ${peStr} earnings sits in the middle of the typical Indian-listed band.`,
          "No strong macro tailwind or warning sign at the sector level — stock-specific work tends to do the heavy lifting from here.",
        ],
      };
    case "Coverage Limited":
      return {
        headline: `${display} — coverage limited`,
        subtext: "Sector-level data is still being populated.",
        body_lines: [
          "We don't yet have enough sector-level signals to render a confident view.",
          "A SEBI analyst can still help if you'd like a written take on this sector.",
        ],
      };
  }
}

function actionItems(state: SectorMacroState): string[] {
  switch (state) {
    case "Constructive":
      return [
        "Use this sector as a watchlist starting point, not a blind buy signal",
        "Dig into the strongest individual names before sizing in",
        "Track entry conditions over the next 1-2 weeks rather than chasing",
      ];
    case "Cautious":
      return [
        "Avoid rushing into broad sector exposure at current valuations",
        "Wait for sector-wide cooling or a stock-specific edge before acting",
        "Treat this sector as something to watch, not to add fresh capital to today",
      ];
    case "Balanced":
      return [
        "Treat this sector as neutral at the headline level",
        "Stock-level fundamentals will likely matter more than the sector framing",
        "Re-check sector breadth before adding fresh exposure",
      ];
    case "Coverage Limited":
      return [
        "Hold off on sector-level positioning until coverage improves",
        "Consider a written analyst follow-up for this sector",
      ];
  }
}

function whatThisMeans(state: SectorMacroState, display: string): SectorReportPayload["what_this_means"] {
  return {
    title: "What This Means",
    interpretation:
      state === "Constructive"
        ? `${display} currently screens at the cheaper end of the Indian-listed valuation band. Useful as a watchlist input — not a blanket buy signal.`
        : state === "Cautious"
        ? `${display} currently screens at the richer end of the band. Past similar phases have tended to reward patience over urgency.`
        : state === "Balanced"
        ? `${display} sits in the middle of the typical valuation band. The sector framing alone is unlikely to drive a decision.`
        : `Sector-level signals for ${display} are limited right now. A written analyst take may be more useful than a sector report.`,
    watch_for: "Sector-level breadth, leadership names, and how the sector reacts to broad market moves.",
    conviction_boosters: [
      "Multiple high-quality names in the sector trading near long-term averages",
      "Earnings momentum confirmed across leaders",
      "Sector outperforming the broad market over a multi-quarter window",
    ],
    conviction_dampeners: [
      "Crowded ownership and stretched valuations across leaders",
      "Earnings revisions turning lower across the sector",
      "Heavy reliance on a single macro tailwind that may be reversing",
    ],
  };
}

export function composeSectorReport(
  row: SectorAggregateRow,
  horizon: QueryType,
): SectorReportPayload {
  const { state, branch } = deriveMacroState(row);
  const pe = round1(row.pe_median);
  const pb = round1(row.pb_median);
  const peP25 = round1(row.pe_p25);
  const peP75 = round1(row.pe_p75);
  const roe = round1(row.roe_median);
  const peAvg5 = round1(row.pe_avg_5y);
  const ret12 = round1(row.return_12m_median_pct);
  const display = row.sector_display && row.sector_display.trim() ? row.sector_display.trim() : row.sector_canonical;
  const hero = heroCopy(state, display, pe);

  const inputs: SectorReportPayload["macro_state_inputs"] = {
    pe_median: pe,
    pb_median: pb,
    roe_median: roe,
    pe_avg_5y: peAvg5,
    return_12m_median_pct: ret12,
    sample_size: row.sample_size,
    branch,
  };

  return {
    schema_version: "v1_sector_view",
    sector_canonical: row.sector_canonical,
    sector_display: display,
    horizon,
    macro_state: state,
    macro_state_inputs: inputs,
    hero,
    valuation_card: {
      title: "Valuation Snapshot",
      pe_median: pe,
      pb_median: pb,
      pe_p25: peP25,
      pe_p75: peP75,
      return_12m_median_pct: ret12,
      note: peP25 != null && peP75 != null
        ? `Sector peer-set PE spread (p25–p75): ${peP25}x – ${peP75}x. Median PB ${pb ?? "n/a"}x.`
        : "Headline PE is the sector median across the bootstrap peer set.",
    },
    profitability_placeholder: {
      title: "Profitability & Quality",
      body: "Sector ROE & quality breadth coming in v1.1 — current view uses valuation-only signals.",
      coming_in: "v1.1",
    },
    historical_placeholder: {
      title: "5Y Context",
      body: "5-year historical valuation range coming in v1.1 — currently we display only the live sector snapshot.",
      coming_in: "v1.1",
    },
    what_this_means: whatThisMeans(state, display),
    action_buckets: {
      title: "Sector Next Steps",
      items: actionItems(state),
    },
    top_stocks_placeholder: {
      title: "Top names in this sector",
      body: "Stock-level ranking for this sector is rolling out in a later release. For now, this view focuses on the sector's valuation and quality context.",
    },
    coverage_note: row.sample_size && row.sample_size > 0
      ? `Coverage: ${row.sample_size} constituents`
      : "Coverage: limited",
    audit_footer: {
      engine_version: "v1_sector_view",
      engine_source: "sector_aggregates",
      sector_canonical: row.sector_canonical,
      macro_state: state,
      as_of_timestamp: row.as_of_timestamp,
      method_version: row.method_version,
      bootstrap_source_reference: row.bootstrap_source_reference,
      source: row.source,
      inputs,
    },
  };
}
