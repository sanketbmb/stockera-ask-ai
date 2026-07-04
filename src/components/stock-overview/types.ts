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
  meta: { provider_failures: number[]; elapsed_ms: number };
}
