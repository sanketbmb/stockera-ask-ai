export interface StockOverview {
  success: boolean;
  symbol: string;
  exchange: string;
  name: string;
  isin: string | null;
  sector: string | null;
  industry: string | null;
  market_cap_rs: number | null;
  cap_band: string | null;
  logo_url: string | null;
  price: {
    value: number | null;
    source: string | null;
    as_of: string | null;
    change: number | null;
    change_pct: number | null;
  } | null;
  candles_30d: Array<{ date: string; close: number }> | null;
  profile: Record<string, unknown> | null;
  statistics: Record<string, unknown> | null;
  dividends: unknown;
  splits: unknown;
  earnings: unknown;
  news: Array<{
    title: string | null;
    source: string | null;
    published_at: string | null;
    url: string | null;
    snippet: string | null;
  }> | null;
  ai_report_stats: {
    total_reports_on_stock: number;
    latest_verdict_distribution: Record<string, number>;
    most_recent_report_date: string | null;
  };
  analytics?: PublicAnalyticsPayload | null;
  analytics_provenance?: AnalyticsProvenance | null;
  meta: { provider_failures: number[]; elapsed_ms: number };
}

// Stage 4A.2 — public /stock/$symbol Analytics tab payload (report-only
// fields already stripped server-side: user_context, summary_reason,
// verdict_reason, confidence_pct, risk_label, time_horizon).
export interface PublicAnalyticsPayload {
  as_of_date: string | null;
  stock: { symbol: string; company_name: string; sector: string; industry: string; exchange: string } | null;
  final_verdict: { action: string | null; overall_score: number | null } | null;
  score_breakdown: {
    technical_score: number;
    fundamental_score: number;
    risk_score: number;
    momentum_score: number;
    sentiment_score: number;
  } | null;
  returns_snapshot: {
    one_week: number | null;
    one_month: number | null;
    three_month: number | null;
    one_year: number | null;
    vs_nifty_one_month: number | null;
    vs_nifty_three_month: number | null;
  } | null;
  fundamental_snapshot: {
    pe_ratio: number | null;
    roe: number | null;
    piotroski_f_score: number | null;
    altman_z_score: number | null;
    dcf_upside_pct: number | null;
    valuation_label: string;
    derivation?: "sector_fallback" | null;
    sector_fallback_meta?: { sector_display: string | null; sample_size: number | null; pb_ratio: number | null } | null;
  } | null;
  risk_snapshot: {
    beta: number | null;
    volatility_1y: number | null;
    sharpe_ratio: number | null;
    sortino_ratio: number | null;
    max_drawdown: number | null;
    var_95: number | null;
    liquidity_label: string;
  } | null;
  sentiment_snapshot: {
    news_sentiment_score: number | null;
    sentiment_label: string;
    article_count: number;
    top_news_driver: string;
    top_articles?: Array<{ title: string; source: string; url: string; published_at: string; sentiment: number }>;
  } | null;
  long_term_quality_snapshot?: {
    roe_5y_avg: number | null;
    roce_5y_avg: number | null;
    debt_to_equity_current: number | null;
    fcf_yield: number | null;
    eps_cagr_5y: number | null;
    earnings_consistency_label: string | null;
    promoter_holding_pct: number | null;
    piotroski_f_score: number | null;
    quality_label: string | null;
    margin_trend_label: string | null;
    market_share_trend_label: string | null;
    data_completeness_pct: number;
  } | null;
  audit_meta: { formula_version: string | null; tier_weights: Record<string, number> | null } | null;
  flags: Record<string, boolean> | null;
}

export interface AnalyticsProvenance {
  computed_at: string | null;
  formula_version: string | null;
  weighting_profile_id: string | null;
  action_bucket_version: string | null;
  origin: string | null;
}
