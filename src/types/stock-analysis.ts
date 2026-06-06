// Typed contract for `generate-stock-analysis` orchestrator payload.
// Mirrors supabase/functions/generate-stock-analysis/index.ts response shape.

export type QueryType = "intraday" | "short-term" | "medium-term" | "long-term";
export type VerdictAction = "BUY" | "HOLD" | "SELL" | "AVOID" | "WATCHLIST";

export interface StockMeta {
  symbol: string;
  company_name: string;
  sector: string;
  industry: string;
  exchange: string;
}

export interface QueryContext {
  query_type: QueryType;
  language: string;
  include_news: boolean;
}

export interface FinalVerdict {
  action: VerdictAction;
  confidence_pct: number;
  overall_score: number;
  risk_label: string;
  time_horizon: string;
  summary_reason: string;
  /**
   * Structured override emitted when the orchestrator could not gather enough
   * evidence to issue a meaningful verdict. UI uses this to render a neutral
   * gray "Insufficient Data" state instead of the red AVOID styling.
   */
  verdict_reason?: "INSUFFICIENT_DATA" | null;
}

export interface ScoreBreakdown {
  technical_score: number;
  fundamental_score: number;
  risk_score: number;
  momentum_score: number;
  sentiment_score: number;
}

export interface PriceContext {
  current_price: number | null;
  price_source: string;
  as_of: string;
}

export interface EntryStrategy {
  mode: "single" | "zone";
  entry_zone_lower: number | null;
  entry_zone_upper: number | null;
  entry_anchor:
    | "LTP" | "DMA20" | "DMA50" | "DMA200"
    | "S1" | "S1_DMA50_BLEND" | "DMA200_52WL_BLEND";
  preferred_entry: number;
  reasoning_code: string;
  reasoning_text: string;
  staggered_plan?: Array<{ pct: number; price: number; note: string }>;
}

export interface TradeLevels {
  entry_zone: number | null;
  stop_loss: number | null;
  target_1: number | null;
  target_2: number | null;
  support_1: number | null;
  support_2: number | null;
  resistance_1: number | null;
  resistance_2: number | null;
  entry_strategy?: EntryStrategy | null;
}

export interface ReturnsSnapshot {
  one_week: number | null;
  one_month: number | null;
  three_month: number | null;
  one_year: number | null;
  vs_nifty_one_month: number | null;
  vs_nifty_three_month: number | null;
}

export interface TechnicalSnapshot {
  rsi: number | null;
  macd_signal: string;
  trend_label: string;
  ema_stack: string;
  adx: number | null;
  bollinger_position: string;
  vwap_signal: string;
}

export interface FundamentalSnapshot {
  pe_ratio: number | null;
  roe: number | null;
  piotroski_f_score: number | null;
  altman_z_score: number | null;
  dcf_upside_pct: number | null;
  valuation_label: string;
  // Mission 6.2 Fix #2 — sector-derived fallback when company fundamentals
  // are missing. `derivation: "sector_fallback"` signals UI to label the card.
  derivation?: "sector_fallback" | null;
  sector_fallback_meta?: {
    sector_display: string | null;
    sample_size: number | null;
    pb_ratio: number | null;
  } | null;
}

export interface RiskSnapshot {
  beta: number | null;
  volatility_1y: number | null;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  max_drawdown: number | null;
  var_95: number | null;
  liquidity_label: string;
}

export interface MomentumSnapshot {
  relative_strength_vs_nifty: number | null;
  trend_strength: string;
  volume_confirmation: string;
  momentum_label: string;
}

export interface SentimentTopArticle {
  title: string;
  source: string;
  url: string;
  published_at: string;
  sentiment: number;
}

export interface SentimentSnapshot {
  news_sentiment_score: number | null;
  sentiment_label: string;
  article_count: number;
  top_news_driver: string;
  // Mission 6.1B: top 3 recent articles surfaced by compute-sentiment.
  top_articles?: SentimentTopArticle[];
}

export interface Flags {
  banking_override_applied: boolean;
  benchmark_fallback_used: boolean;
  news_data_limited: boolean;
  incomplete_data: boolean;
}

export interface ReportModules {
  show_score_ring: boolean;
  show_score_breakdown: boolean;
  show_returns_strip: boolean;
  show_news_widget: boolean;
  show_stocks_in_focus: boolean;
}

export interface AuditMeta {
  formula_version: string;
  verdict_model_version: string;
  tier_applied: QueryType;
  tier_weights: Record<string, number>;
  tier_guardrails: string[];
  technical_as_of: string | null;
  fundamental_as_of: string | null;
  risk_as_of: string | null;
  momentum_as_of: string | null;
  sentiment_as_of: string | null;
  source_trace: Array<{
    module: string;
    ok: boolean;
    http_status: number | null;
    latency_ms: number;
    error?: string | null;
    code?: string | null;
    derived?: string;
  }>;
  trade_plan_source?: string;
  trade_plan_flag?: "new" | "legacy";
  trade_plan_validation?: Array<{ level: keyof TradeLevels; reason: string }>;
  trade_plan_vol_1y?: number | null;
  targets_meta?: {
    tier: string;
    t1: { value: number | null; method: string; reason: string; inputs: Record<string, number | string | null>; attempts: Array<{ method: string; ok: boolean; reason: string; value?: number | null }> };
    t2: { value: number | null; method: string; reason: string; inputs: Record<string, number | string | null>; attempts: Array<{ method: string; ok: boolean; reason: string; value?: number | null }> };
    guardrails: { liquidity_ok: boolean; volatility_ok: boolean; avg_daily_turnover_cr: number | null; ann_vol_pct: number | null; guardrail_breach: string | null };
    sector_used: string | null;
    sector_canonical?: string | null;
    sector_aggregate_source?: "computed" | "bootstrap" | "default_fallback" | "missing";
    sector_method_version?: string | null;
    sector_bootstrap_reference?: string | null;
    sector_missing_reason: string | null;
    sl_method?: "vol_adaptive" | "dma200_anchor" | "max_distance_cap" | "min_distance_floor";
  } | null;
  confidence_breakdown?: {
    alignment: number;
    strength: number;
    stability: number;
    data_quality: number;
    coverage: number;
    raw_total: number;
    clamped: number;
  };
  confidence_band?: string;
  modules_invoked?: string[];
  tier_modules_added_version?: string;
  intraday_microstructure_diagnostic?: IntradayMicrostructureDiagnostic | null;
  long_term_quality_diagnostic?: LongTermQualityDiagnostic | null;
}

export interface IntradayMicrostructureDiagnostic {
  symbol: string;
  null_reasons: Record<string, string>;
}

export interface LongTermQualityDiagnostic {
  symbol: string;
  banking_override_applied: boolean;
  null_reasons: Record<string, string>;
}



export interface IntradayMicrostructureSnapshot {
  atr_14: number | null;
  daily_realized_volatility: number | null;
  opening_range_15m_high: number | null;
  opening_range_15m_low: number | null;
  vwap: number | null;
  price_vs_vwap_pct: number | null;
  intraday_volume_profile_label: "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" | null;
  gap_behavior_label: "GAP_UP" | "GAP_DOWN" | "FLAT" | "GAP_FILLED_UP" | "GAP_FILLED_DOWN" | null;
  session_high: number | null;
  session_low: number | null;
  sector_rs_today_label: "OUTPERFORMING" | "INLINE" | "UNDERPERFORMING" | null;
  intraday_news_catalysts: string[] | null;
  data_freshness: "live" | "post_market" | "stale";
}

export interface LongTermQualitySnapshot {
  roe_5y_avg: number | null;
  roce_5y_avg: number | null;
  debt_to_equity_current: number | null;
  fcf_yield: number | null;
  eps_cagr_5y: number | null;
  earnings_consistency_label: "VERY_HIGH" | "HIGH" | "MODERATE" | "LOW" | "VERY_LOW" | null;
  promoter_holding_pct: number | null;
  piotroski_f_score: number | null;
  quality_label: "HIGH_QUALITY" | "AVERAGE" | "WEAK" | "BANKING_ADJUSTED" | null;
  margin_trend_label: "IMPROVING" | "STABLE" | "DETERIORATING" | null;
  market_share_trend_label: "GAINING" | "STABLE" | "LOSING" | "UNKNOWN" | null;
  data_completeness_pct: number;
}

export interface StockAnalysisPayload {
  success: true;
  as_of_date: string;
  stock: StockMeta;
  query_context: QueryContext;
  final_verdict: FinalVerdict;
  score_breakdown: ScoreBreakdown;
  price_context: PriceContext;
  levels: TradeLevels;
  returns_snapshot: ReturnsSnapshot;
  technical_snapshot: TechnicalSnapshot;
  fundamental_snapshot: FundamentalSnapshot;
  risk_snapshot: RiskSnapshot;
  momentum_snapshot: MomentumSnapshot;
  sentiment_snapshot: SentimentSnapshot;
  intraday_microstructure_snapshot?: IntradayMicrostructureSnapshot | null;
  long_term_quality_snapshot?: LongTermQualitySnapshot | null;
  flags: Flags;
  report_modules: ReportModules;
  audit_meta: AuditMeta;
  user_context: string | null;
}

// Wave 5f — Structured empty-state payload returned by the orchestrator
// when the user-typed symbol has no row in stock_master (delisting,
// rename, post-corporate-action, very new listing). Distinguished from
// a successful StockAnalysisPayload by the top-level `verdict_reason`
// discriminator. Frontend renders a friendly panel with one-click
// successor suggestions instead of a red error page.
export interface UnsupportedSymbolPayload {
  success: true;
  verdict_reason: "UNSUPPORTED_SYMBOL";
  symbol: string;
  successor_candidates: Array<{
    symbol: string;
    company_name: string | null;
    exchange: string;
    reason: string | null;
    effective_date: string | null;
  }>;
  fuzzy_candidates: Array<{
    symbol: string;
    company_name: string | null;
    exchange: string;
  }>;
  hint: string | null;
}

export type OrchestratorResponse = StockAnalysisPayload | UnsupportedSymbolPayload;

export function isUnsupportedSymbolPayload(
  p: unknown,
): p is UnsupportedSymbolPayload {
  return (
    !!p &&
    typeof p === "object" &&
    (p as { verdict_reason?: unknown }).verdict_reason === "UNSUPPORTED_SYMBOL"
  );
}
