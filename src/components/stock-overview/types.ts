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

// Stage 4A.2b — public /stock/$symbol Analytics tab payload.
// Server-side whitelist strips: final_verdict.action / summary_reason /
// verdict_reason / confidence_pct, levels, user_context, technical_snapshot,
// intraday_microstructure_snapshot, and all trade-planning audit_meta.*.
export interface PublicAnalyticsPayload {
  as_of_date: string | null;
  stock: { symbol: string; company_name: string; sector: string; industry: string; exchange: string } | null;
  final_verdict: {
    overall_score: number | null;
    risk_label: string | null;
    time_horizon: string | null;
  } | null;
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
  momentum_snapshot?: Record<string, unknown> | null;
  sentiment_snapshot: {
    news_sentiment_score: number | null;
    sentiment_label: string;
    article_count: number;
    // Stage 4D.1 B3 — public payload carries attribution only (no title/url/score).
    top_articles?: Array<{ source: string; published_at: string }>;
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
  audit_meta: {
    formula_version: string | null;
    weighting_profile_id?: string | null;
    action_bucket_version?: string | null;
    tier_weights: Record<string, number> | null;
    dcf_status?: string | null;
    dcf_method_used?: string | null;
    banking_override_applied?: boolean | null;
    banking_override_reason?: string | null;
  } | null;
  flags: {
    incomplete_data?: boolean;
    news_data_limited?: boolean;
    benchmark_fallback_used?: boolean;
    banking_override_applied?: boolean;
    [k: string]: boolean | undefined;
  } | null;
}

export interface AnalyticsProvenance {
  computed_at: string | null;
  // Stage 4A.3.x B1 — provenance describes the fetch/cache layer.
  // Compute-layer authoritative versions live in analytics.audit_meta.*.
  cache_schema_version: string | null;
  cache_horizon_profile: string | null;
  cache_origin_contract: string | null;
  origin: string | null;
}
