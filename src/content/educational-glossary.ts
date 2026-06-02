// Phase 3C — Educational Mode glossary (system of record).
//
// Every entry here is composed verbatim from two pre-approved internal
// sources that already passed forbidden-vocabulary lint:
//   1. src/lib/metric-copy.ts          (METRIC_COPY: measures/how/...)
//   2. src/content/architecture-encyclopedia.ts (MODULES: formulas/outputs)
//
// No new prose is invented. Missing sections are omitted, never fabricated.

export type DifficultyTag = "Beginner" | "Intermediate" | "Advanced";

export interface GlossaryEntry {
  canonical: string;             // exact match (e.g. "RSI", "Piotroski F-Score")
  short_name: string;            // hero one-liner label
  difficulty: DifficultyTag;
  one_line_definition: string;   // shown in hero subtext
  what_it_means: string;         // section A — measures-style
  why_it_matters?: string;       // section B — from MODULES[].purpose
  how_to_read?: string;          // section C — composed from how/scale/interpretation
  formula?: string;              // shown as a small monospace footnote when present
  worked_example_pending?: true; // section D — placeholder card
  appears_in: string[];          // section E — Stockera card chips
  common_mistake?: string;       // section F — only when source-backed
  related: string[];             // section G — canonical names; cap 5 in UI
}

const T = (s: string) => s.trim();

// ─── 16 canonical entries ───
export const GLOSSARY: Record<string, GlossaryEntry> = {
  RSI: {
    canonical: "RSI",
    short_name: "Relative Strength Index",
    difficulty: "Beginner",
    one_line_definition: T(`A momentum oscillator that scores how stretched recent gains are versus recent losses.`),
    what_it_means: T(`A 14-period momentum oscillator on closing prices, scored 0 to 100.`),
    why_it_matters: T(`Daily price-action snapshot: trend, momentum oscillators, mean-reversion, structure.`),
    how_to_read: T(`A strong uptrend usually shows RSI 55–70. Readings above 70 often signal an overheated tape; below 30 typically signals an oversold one.`),
    formula: T(`RSI = 100 − 100 / (1 + RS), RS = avg gain / avg loss over 14 sessions (Wilder).`),
    appears_in: ["Trend & Structure", "Intraday Trend & Levels"],
    related: ["MACD", "EMA", "ADX", "Bollinger Bands"],
  },

  MACD: {
    canonical: "MACD",
    short_name: "Moving Average Convergence Divergence",
    difficulty: "Intermediate",
    one_line_definition: T(`A trend-following momentum indicator built from the gap between two moving averages.`),
    what_it_means: T(`The difference between a 12-period EMA and a 26-period EMA, with a 9-period EMA of that line acting as the signal.`),
    why_it_matters: T(`Daily price-action snapshot: trend, momentum oscillators, mean-reversion, structure.`),
    how_to_read: T(`Bullish when the MACD line crosses above its signal line; bearish on a cross below. Confirms whether momentum is supporting the prevailing trend.`),
    formula: T(`MACD = EMA(12) − EMA(26); signal = EMA(9) of MACD; cross direction = bullish/bearish.`),
    appears_in: ["Trend & Structure", "Intraday Trend & Levels"],
    related: ["RSI", "EMA", "ADX"],
  },

  EMA: {
    canonical: "EMA",
    short_name: "Exponential Moving Average",
    difficulty: "Beginner",
    one_line_definition: T(`A moving average that weights recent prices more than older ones, so it turns faster than a simple average.`),
    what_it_means: T(`An exponentially-weighted average of recent closes. Stockera reads the 20, 50, and 200-period stack together.`),
    why_it_matters: T(`Tracks the underlying trend direction by smoothing noise while staying responsive to the latest closes.`),
    how_to_read: T(`A clean stack of EMAs 20 > 50 > 200 is the textbook uptrend; the inverse stack is a downtrend. A 50DMA crossing above the 200DMA (golden cross) with a positive 3M return is the textbook medium-term uptrend.`),
    appears_in: ["Trend & Structure", "Intraday Trend & Levels"],
    related: ["MACD", "RSI", "ADX"],
  },

  ADX: {
    canonical: "ADX",
    short_name: "Average Directional Index",
    difficulty: "Intermediate",
    one_line_definition: T(`Measures how strong a trend is, without saying which direction it is moving.`),
    what_it_means: T(`A 14-period Wilder smoothing of directional movement that scores trend strength 0 to 100.`),
    why_it_matters: T(`Separates strong, sustainable trends from choppy noise so momentum and trend cards can be ranked properly.`),
    how_to_read: T(`ADX above 25 typically marks a strong trend; below 20 marks a range-bound tape. Combine with EMA stack to know which side of the trend you are on.`),
    formula: T(`ADX = 100 × EMA(|+DI − −DI| / (+DI + −DI), 14) — Wilder.`),
    appears_in: ["Trend & Structure", "Momentum & Relative Strength"],
    related: ["RSI", "MACD", "EMA", "Relative Strength"],
  },

  "Bollinger Bands": {
    canonical: "Bollinger Bands",
    short_name: "Bollinger Bands",
    difficulty: "Intermediate",
    one_line_definition: T(`A volatility envelope drawn two standard deviations around a 20-period simple moving average.`),
    what_it_means: T(`A 20-period SMA flanked by upper and lower bands set two standard deviations away. The %B reading shows where price sits inside the envelope.`),
    why_it_matters: T(`Frames mean-reversion potential and tells you when volatility is compressing or expanding.`),
    how_to_read: T(`Readings near 1 sit at the upper band; near 0 at the lower. Squeezes (tight bands) often precede expansion; rides along a band signal a strong trend.`),
    formula: T(`Bollinger position = (price − lower) / (upper − lower); bands = SMA(20) ± 2σ.`),
    appears_in: ["Trend & Structure"],
    related: ["RSI", "ATR", "MACD"],
  },

  ATR: {
    canonical: "ATR",
    short_name: "Average True Range",
    difficulty: "Beginner",
    one_line_definition: T(`A volatility yardstick: the average size of a stock's typical daily range over the last 14 sessions.`),
    what_it_means: T(`A 14-period mean of true range. Used to size intraday stops and frame realistic move expectations.`),
    why_it_matters: T(`Anchors trade-level math: intraday stop-loss and target distances are derived directly from ATR.`),
    how_to_read: T(`Above-average volume with a filled gap and a wide ATR suggests genuine participation rather than a thin drift. A wider ATR demands a wider stop and a smaller position.`),
    formula: T(`ATR-14 = mean(TR) over 14 days, TR = max(H-L, |H-Cprev|, |L-Cprev|). Intraday SL: spot − 1.0 × ATR(14) (floor 0.5×ATR, ceiling 1.5×ATR).`),
    appears_in: ["Intraday Microstructure", "Trade Levels", "Risk Profile"],
    related: ["Bollinger Bands", "Max Drawdown", "Beta"],
  },

  VWAP: {
    canonical: "VWAP",
    short_name: "Volume-Weighted Average Price",
    difficulty: "Beginner",
    one_line_definition: T(`The average price for the session weighted by how much volume traded at each price.`),
    what_it_means: T(`Volume-Weighted Average Price for the session. Requires a live intraday feed.`),
    why_it_matters: T(`Used by institutional desks as a fair-value benchmark for execution and intraday bias.`),
    how_to_read: T(`Price holding above VWAP signals intraday strength; price losing VWAP often flips bias to weakness.`),
    formula: T(`VWAP_t = Σ (price_i · vol_i) / Σ vol_i over session.`),
    appears_in: ["Intraday Microstructure", "Intraday Trend & Levels"],
    related: ["ATR", "Volume Confirmation"],
  },

  "Piotroski F-Score": {
    canonical: "Piotroski F-Score",
    short_name: "Piotroski F-Score",
    difficulty: "Advanced",
    one_line_definition: T(`A 0–9 quality score that adds up nine pass/fail checks on profitability, leverage, and efficiency.`),
    what_it_means: T(`A quality score from 0 to 9 that counts nine binary checks across profitability (4), leverage / liquidity (3), and operating efficiency (2).`),
    why_it_matters: T(`Quality + valuation snapshot: lets a beginner read a single number instead of a balance sheet.`),
    how_to_read: T(`7 or above is the textbook strong-quality band; 3 or below is weak. High-quality companies typically show ROE > 15%, D/E < 1, Piotroski ≥ 7, and stable or rising promoter holding.`),
    formula: T(`Piotroski F = sum of 9 binary tests (profitability 4, leverage / liquidity 3, operating efficiency 2). Score 0–9.`),
    appears_in: ["Light Fundamentals", "Long-term Business Quality"],
    common_mistake: T(`The Piotroski score is suppressed for banks because their capital structure makes the underlying checks non-comparable.`),
    related: ["Altman Z-Score", "DCF", "PE Ratio", "Promoter Holding"],
  },

  "Altman Z-Score": {
    canonical: "Altman Z-Score",
    short_name: "Altman Z-Score",
    difficulty: "Advanced",
    one_line_definition: T(`A bankruptcy-risk score combining five balance-sheet ratios into one number.`),
    what_it_means: T(`A weighted blend of working capital, retained earnings, EBIT, market equity, and sales — all scaled by total assets — designed to flag distress.`),
    why_it_matters: T(`Quality + valuation snapshot for non-financial companies.`),
    how_to_read: T(`Higher is safer; lower scores cluster with historically distressed companies. Read alongside leverage and quality, not in isolation.`),
    formula: T(`Altman Z = 1.2·A + 1.4·B + 3.3·C + 0.6·D + 1.0·E (A=WC/TA, B=RE/TA, C=EBIT/TA, D=MktEq/Liab, E=Sales/TA).`),
    appears_in: ["Light Fundamentals"],
    common_mistake: T(`Altman Z is suppressed by design for banks because the underlying ratios were calibrated on non-financial companies.`),
    related: ["Piotroski F-Score", "DCF", "PE Ratio"],
  },

  DCF: {
    canonical: "DCF",
    short_name: "Discounted Cash Flow",
    difficulty: "Advanced",
    one_line_definition: T(`Estimates intrinsic value by discounting a company's future cash flows back to today.`),
    what_it_means: T(`Projects free cash flows, discounts them at a required return, adds a terminal value, then compares the intrinsic estimate to the current price.`),
    why_it_matters: T(`Anchors long-term valuation when the cash-flow profile is stable enough to model.`),
    how_to_read: T(`Stockera reports DCF upside as a percentage. Sector-multiple fair value is preferred when DCF is degenerate or when the banking override fires.`),
    formula: T(`DCF upside = (intrinsic − price) / price; intrinsic = Σ FCF_t / (1+r)^t + TV / (1+r)^n, clamped [−50%, +200%].`),
    appears_in: ["Valuation & Fair Value", "Trade Levels"],
    common_mistake: T(`Banks bypass DCF via banking_override; for those names use sector-multiple fair value instead.`),
    related: ["PE Ratio", "Piotroski F-Score", "Altman Z-Score"],
  },

  Beta: {
    canonical: "Beta",
    short_name: "Beta",
    difficulty: "Intermediate",
    one_line_definition: T(`Sensitivity of a stock's returns to moves in the Nifty.`),
    what_it_means: T(`The slope of the stock's returns regressed on Nifty's returns over the trailing one-year window.`),
    why_it_matters: T(`Volatility, downside, market-risk, liquidity — Beta tells you how amplified a stock is versus the index.`),
    how_to_read: T(`Beta > 1.3 means amplified market moves; < 0.7 means defensive. Beta > 1.2 plus 1Y volatility above 30% means small position sizes for day trades.`),
    formula: T(`Beta = Cov(R_stock, R_NIFTY) / Var(R_NIFTY).`),
    appears_in: ["Risk Profile", "Intraday Risk"],
    common_mistake: T(`Beta describes amplitude, not direction — a high-beta stock can fall sharply on a strong-market day if its own news disappoints.`),
    related: ["Max Drawdown", "Sharpe Ratio", "ATR"],
  },

  "Sharpe Ratio": {
    canonical: "Sharpe Ratio",
    short_name: "Sharpe Ratio",
    difficulty: "Advanced",
    one_line_definition: T(`Return earned per unit of total risk taken.`),
    what_it_means: T(`Annualised excess return (over the risk-free rate) divided by annualised volatility.`),
    why_it_matters: T(`Lets you compare two stocks on the quality of their returns, not just the level.`),
    how_to_read: T(`Above 1 is excellent for Indian equities; below 0 means returns did not compensate for risk. A Sharpe above 0.8 with max drawdown shallower than the sector implies a smoother compounding ride.`),
    formula: T(`Sharpe = (μ − r_f) / σ.`),
    appears_in: ["Risk Profile", "Long-term Risk"],
    related: ["Beta", "Max Drawdown", "Piotroski F-Score"],
  },

  "Max Drawdown": {
    canonical: "Max Drawdown",
    short_name: "Maximum Drawdown",
    difficulty: "Intermediate",
    one_line_definition: T(`The worst peak-to-trough decline observed in the lookback window.`),
    what_it_means: T(`Computed on the daily close series and reported as a negative percentage.`),
    why_it_matters: T(`Drawdown character — how much pain a long-term holder may need to absorb.`),
    how_to_read: T(`A shallower max drawdown than the sector implies a smoother ride; a much deeper one signals episodic risk that compounding cannot easily recover.`),
    formula: T(`Max DD = min over t of (P_t / max_{s≤t} P_s − 1).`),
    appears_in: ["Risk Profile", "Long-term Risk"],
    related: ["Beta", "Sharpe Ratio", "ATR"],
  },

  "Relative Strength": {
    canonical: "Relative Strength",
    short_name: "Relative Strength vs Nifty",
    difficulty: "Intermediate",
    one_line_definition: T(`How a stock has performed compared to the Nifty over the same window.`),
    what_it_means: T(`Stock return minus Nifty return for the same lookback. Stockera tracks 1M, 3M, and 6M windows.`),
    why_it_matters: T(`Cross-sectional relative strength and trend persistence — separates leaders from laggards.`),
    how_to_read: T(`Outperformance over Nifty for two of three windows alongside a 'strong' trend label is the cleanest momentum setup.`),
    formula: T(`RS = (1 + r_stock_3M) / (1 + r_NIFTY_3M) − 1.`),
    appears_in: ["Momentum & Relative Strength", "Sector View"],
    related: ["ADX", "Volume Confirmation", "RSI"],
  },

  "Volume Confirmation": {
    canonical: "Volume Confirmation",
    short_name: "Volume Confirmation",
    difficulty: "Beginner",
    one_line_definition: T(`A check on whether today's volume is backing up the price move.`),
    what_it_means: T(`Compares the last 20-day average volume to the trailing 60-day average on up-days, Jegadeesh-Titman style.`),
    why_it_matters: T(`A move on light volume is fragile; a move on confirming volume tends to follow through.`),
    how_to_read: T(`Above-average ≥ 1.25× the 20-day average; below-average ≤ 0.75×. Treat volume as the second opinion on every breakout.`),
    appears_in: ["Momentum & Relative Strength", "Intraday Microstructure"],
    related: ["Relative Strength", "ADX", "VWAP"],
  },

  "Promoter Holding": {
    canonical: "Promoter Holding",
    short_name: "Promoter Holding",
    difficulty: "Beginner",
    one_line_definition: T(`The share of equity currently held by the company's promoters.`),
    what_it_means: T(`Latest quarter from the FinEdge ownership-history feed.`),
    why_it_matters: T(`Rising or steady promoter holding is generally a confidence signal; falling holding deserves scrutiny.`),
    how_to_read: T(`Read direction over multiple quarters, not the absolute number in isolation.`),
    appears_in: ["Long-term Business Quality"],
    related: ["Piotroski F-Score", "PE Ratio"],
  },

  "PE Ratio": {
    canonical: "PE Ratio",
    short_name: "Price-to-Earnings Ratio",
    difficulty: "Beginner",
    one_line_definition: T(`Price relative to trailing earnings — what you pay today per rupee of last year's profit.`),
    what_it_means: T(`Trailing EPS divided into the current price; context comes from comparing to the sector aggregate.`),
    why_it_matters: T(`A simple anchor for valuation; pairs naturally with sector medians and 5-year history.`),
    how_to_read: T(`A stock trading below sector PE with rising EPS is usually 'fair' to 'undervalued'.`),
    appears_in: ["Light Fundamentals", "Valuation & Fair Value", "Sector View"],
    related: ["DCF", "Piotroski F-Score", "Promoter Holding"],
  },
};

export const SUPPORTED_CONCEPTS: string[] = Object.keys(GLOSSARY);

export function getGlossaryEntry(canonical: string): GlossaryEntry | null {
  return GLOSSARY[canonical] ?? null;
}
