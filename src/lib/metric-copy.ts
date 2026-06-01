// Centralised methodology copy for every metric / card surfaced in
// StockAnalysisReport. Used by the tier-shaped grid (Mission 1 B.2) and
// reusable for any downstream surface (PDF, share cards, etc).
//
// Shape per entry:
//   measures       – one short line: what the metric describes
//   how            – 1–2 lines, plain English, how Stockera computes it
//   scale          – optional scale hint (e.g. "0–100")
//   interpretation – optional example sentence helping a beginner read it
//   formula        – optional pro-level formula (revealed via "Show formula")

export interface MetricCopy {
  measures: string;
  how: string;
  scale?: string;
  interpretation?: string;
  formula?: string;
}

export const METRIC_COPY: Record<string, MetricCopy> = {
  // ─── Card-level ──────────────────────────────────────────────────────
  card_intraday_trend_levels: {
    measures: "Where the stock is trading relative to its trend and key levels.",
    how: "Combines RSI(14), MACD signal, EMA stack (20/50/200), ADX and VWAP relationship from the latest end-of-day candle.",
    interpretation: "A strong uptrend usually shows RSI 55–70, MACD bullish, EMAs stacked 20>50>200 and ADX above 25.",
  },
  card_intraday_microstructure: {
    measures: "How the stock behaved through today's session — range, volume profile and gap behaviour.",
    how: "Derived from the latest daily bar: ATR-14 for typical range, 20-day realised volatility (annualised), session high/low, and gap vs previous close.",
    interpretation: "Above-average volume with a filled gap and a wide ATR suggests genuine participation rather than a thin drift.",
    formula: "ATR-14 = mean(TR) over 14 days, TR = max(H-L, |H-Cprev|, |L-Cprev|).\nRealised vol = stdev(log returns, 20d) × √252 × 100.",
  },
  card_intraday_risk: {
    measures: "Short-horizon risk profile — how aggressively the stock can move against you in a day.",
    how: "Beta vs Nifty, annualised 1-year volatility and daily ATR-derived risk band.",
    interpretation: "Beta > 1.2 plus volatility above 30% means small position sizes for day trades.",
  },
  card_today_catalysts: {
    measures: "News and sentiment driving today's price action.",
    how: "Fetches news from the last 24 hours, scores headline sentiment and ranks by article relevance.",
    scale: "Sentiment score: −100 (very bearish) to +100 (very bullish).",
    interpretation: "A sentiment score > 30 with multiple matching articles often precedes follow-through; isolated headlines fade.",
  },
  card_medium_trend_structure: {
    measures: "Multi-week trend health — direction, structure and confirmation.",
    how: "Blends weekly RSI, 50/200-DMA cross status, ADX strength, plus 3M and 6M returns.",
    interpretation: "A golden cross (50DMA above 200DMA) with positive 3M return is the textbook medium-term uptrend.",
  },
  card_medium_momentum_rs: {
    measures: "Momentum and relative strength versus the broader market.",
    how: "Uses 1M/3M/6M relative-strength vs Nifty, trend-strength label and volume confirmation.",
    interpretation: "Outperformance over Nifty for 2 of 3 windows alongside a 'strong' trend is the cleanest momentum setup.",
  },
  card_medium_fundamentals_lite: {
    measures: "Light fundamentals — is the price supported by earnings and a reasonable multiple.",
    how: "P/E vs sector aggregate, EPS growth trend and Stockera valuation label. Banking sector adjusts which inputs apply.",
    interpretation: "A stock trading below sector P/E with rising EPS is usually 'fair' to 'undervalued'.",
  },
  card_medium_catalysts: {
    measures: "Recent news catalysts and upcoming corporate actions over the next ~90 days.",
    how: "Sentiment articles from the last 14 days plus FinEdge corporate-actions feed (dividends, splits, results, bonus, buyback).",
    interpretation: "Cluster of positive catalysts ahead of an event date often shifts the medium-term tape.",
  },
  card_long_business_quality: {
    measures: "Underlying business quality — does this company compound capital well.",
    how: "ROE / ROCE (5-year proxy), debt-to-equity, EPS CAGR, Piotroski F-Score and promoter holding. Banks switch to a regulatory-aware view.",
    interpretation: "High-quality companies typically show ROE > 15%, D/E < 1, Piotroski ≥ 7 and stable or rising promoter holding.",
    formula: "Quality = HIGH if ROE > 15 AND D/E < 1.5 AND Piotroski ≥ 7; WEAK if Piotroski ≤ 3 OR D/E > 3.",
  },
  card_long_valuation: {
    measures: "Whether today's price leaves room for long-term compounding.",
    how: "Compares P/E to the 5-year median, sector-multiple fair value and DCF (where it converges).",
    interpretation: "Sector-multiple fair value is preferred when DCF is degenerate or when banking override fires.",
  },
  card_long_risk: {
    measures: "Drawdown character — how much pain a long-term holder may need to absorb.",
    how: "Annualised 1-year volatility, max drawdown, beta, Sharpe ratio and liquidity classification.",
    interpretation: "A Sharpe above 0.8 with max drawdown shallower than the sector implies a smoother compounding ride.",
  },
  card_long_returns: {
    measures: "Long-horizon return record — has this stock actually rewarded patient capital.",
    how: "1Y / 3M return prints plus relative strength versus Nifty.",
    interpretation: "Beating Nifty across 1Y and 3M is the minimum filter for a long-term core position.",
  },

  // ─── Metric-level (used as Metric `hint` strings; concise on purpose) ─
  m_atr_14: {
    measures: "Average True Range over 14 days — typical daily price travel.",
    how: "Mean of true range over the last 14 sessions; higher = wider intraday swings.",
  },
  m_realized_vol: {
    measures: "Annualised realised volatility from the last 20 days.",
    how: "Standard deviation of daily log returns × √252, expressed as a percentage.",
  },
  m_vwap: {
    measures: "Volume-Weighted Average Price for the session.",
    how: "Requires a live intraday feed — currently shown as '—' on the EOD source.",
  },
  m_gap_behavior: {
    measures: "How today's open behaved versus yesterday's close.",
    how: "Gap up/down if open is >0.3% away; 'filled' if the session traded back to the prior close.",
  },
  m_volume_profile: {
    measures: "Today's volume vs the 20-day average.",
    how: "Above-average ≥ 1.25× avg, below-average ≤ 0.75× avg.",
  },
  m_sector_rs_today: {
    measures: "How the stock is doing today vs the broader market.",
    how: "Uses 1-month relative-strength vs Nifty as a today-proxy (intraday RS pending live feed).",
  },
  m_roe_5y: {
    measures: "Return on Equity averaged over the last few years.",
    how: "3-year average ROE used as a 5-year proxy until full 5y series is wired.",
    interpretation: ">15% sustained ROE is a quality signal.",
  },
  m_roce_5y: {
    measures: "Return on Capital Employed — broader quality measure than ROE.",
    how: "Latest reported ROCE from compute-fundamentals.",
  },
  m_debt_equity: {
    measures: "How much debt the company carries relative to equity.",
    how: "Debt / Equity from the latest annual report.",
    interpretation: "Below 1 is conservative; above 3 is highly leveraged.",
  },
  m_fcf_yield: {
    measures: "Free cash flow yield on the current market cap.",
    how: "Requires multi-year capex; currently unavailable from the upstream feed and shown as '—'.",
  },
  m_eps_cagr_5y: {
    measures: "Annualised EPS growth over 5 years.",
    how: "Profit CAGR over 5 years. Suppressed for banks where provisioning cycles distort the print.",
  },
  m_piotroski: {
    measures: "Quality score from 0 to 9.",
    how: "Counts 9 binary checks across profitability, leverage and efficiency.",
    scale: "0–9 (≥7 strong, ≤3 weak).",
  },
  m_promoter_holding: {
    measures: "Share of equity held by promoters today.",
    how: "Latest quarter from the FinEdge ownership-history feed.",
    interpretation: "Rising or steady promoter holding is generally a confidence signal.",
  },
  m_quality_label: {
    measures: "Stockera's aggregated quality verdict.",
    how: "HIGH / AVERAGE / WEAK from the joint read of ROE, D/E and Piotroski; banks get BANKING_ADJUSTED.",
  },
  m_pe_ratio: {
    measures: "Price relative to trailing earnings.",
    how: "Trailing EPS divided into the current price; context comes from comparing to the sector aggregate.",
  },
  m_valuation_label: {
    measures: "Stockera's valuation verdict — over / fair / under valued.",
    how: "Derived from PE vs sector, DCF upside and historical multiples with banking overrides where relevant.",
  },
  m_beta: {
    measures: "Sensitivity to Nifty moves.",
    how: "Slope of stock returns regressed on Nifty returns over 1Y.",
    interpretation: "Beta > 1.3 means amplified market moves; < 0.7 means defensive.",
  },
  m_vol_1y: {
    measures: "Annualised standard deviation of daily returns over 1Y.",
    how: "stdev(daily returns, 252d) × √252 × 100.",
  },
  m_max_dd: {
    measures: "Worst peak-to-trough decline observed in the lookback.",
    how: "Computed on the daily close series; reported as a negative percentage.",
  },
  m_sharpe: {
    measures: "Return per unit of total risk.",
    how: "(Annualised return − risk-free rate) / annualised volatility.",
    interpretation: "Above 1 is excellent for Indian equities; below 0 means returns didn't compensate for risk.",
  },
  m_liquidity: {
    measures: "How easy it is to enter / exit at decent size.",
    how: "Bucketed from average daily turnover (₹ cr) and free-float metrics.",
  },
  m_returns_window: {
    measures: "Total return over the window (price + dividends ignored).",
    how: "(P_now − P_then) / P_then × 100.",
  },
  m_rs_vs_nifty: {
    measures: "Performance gap vs the Nifty over the window.",
    how: "Stock return minus Nifty return for the same window.",
  },
  m_news_sentiment: {
    measures: "Stockera's polarity read on recent headlines.",
    how: "Weighted average of headline sentiment scores from the news ingestion pipeline.",
    scale: "−100 (very bearish) to +100 (very bullish).",
  },
};

export function getMetricCopy(key: string): MetricCopy | null {
  return METRIC_COPY[key] ?? null;
}
