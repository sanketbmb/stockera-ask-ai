// Typed contract for `generate-stock-analysis` orchestrator payload.
// Mirrors supabase/functions/generate-stock-analysis/index.ts response shape.

export type QueryType = "intraday" | "medium-term" | "long-term";
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

export interface TradeLevels {
  entry_zone: number | null;
  stop_loss: number | null;
  target_1: number | null;
  target_2: number | null;
  support_1: number | null;
  support_2: number | null;
  resistance_1: number | null;
  resistance_2: number | null;
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

export interface SentimentSnapshot {
  news_sentiment_score: number | null;
  sentiment_label: string;
  article_count: number;
  top_news_driver: string;
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
  flags: Flags;
  report_modules: ReportModules;
  audit_meta: AuditMeta;
  user_context: string | null;
}
