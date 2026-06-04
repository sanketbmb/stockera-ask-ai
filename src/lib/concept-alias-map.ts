// Phase 3C — Deterministic concept alias resolver for Educational Mode.
// Case-insensitive, tolerant of common shorthand/typos.
// Returns null when no confident match exists (no aggressive guessing).

import { SUPPORTED_CONCEPTS, GLOSSARY } from "@/content/educational-glossary";

// Free-text alias -> canonical concept name (must exist in GLOSSARY).
const ALIAS_MAP: Record<string, string> = {
  // RSI
  "rsi": "RSI",
  "relative strength index": "RSI",
  "rsi 14": "RSI",
  "rsi(14)": "RSI",

  // MACD
  "macd": "MACD",
  "moving average convergence divergence": "MACD",
  "moving average convergence": "MACD",

  // EMA
  "ema": "EMA",
  "exponential moving average": "EMA",
  "exponential ma": "EMA",
  "ema stack": "EMA",
  "50 ema": "EMA",
  "200 ema": "EMA",
  "dma": "EMA",
  "200 dma": "EMA",
  "200-dma": "EMA",

  // ADX
  "adx": "ADX",
  "average directional index": "ADX",
  "average directional movement index": "ADX",

  // Bollinger
  "bollinger": "Bollinger Bands",
  "bollinger band": "Bollinger Bands",
  "bollinger bands": "Bollinger Bands",
  "bband": "Bollinger Bands",
  "bbands": "Bollinger Bands",
  "%b": "Bollinger Bands",

  // ATR
  "atr": "ATR",
  "average true range": "ATR",
  "atr 14": "ATR",
  "atr(14)": "ATR",

  // VWAP
  "vwap": "VWAP",
  "volume weighted average price": "VWAP",
  "volume-weighted average price": "VWAP",

  // Piotroski
  "piotroski": "Piotroski F-Score",
  "piotroski score": "Piotroski F-Score",
  "piotroski f score": "Piotroski F-Score",
  "piotroski f-score": "Piotroski F-Score",
  "f score": "Piotroski F-Score",
  "f-score": "Piotroski F-Score",

  // Altman
  "altman": "Altman Z-Score",
  "altman z": "Altman Z-Score",
  "altman z score": "Altman Z-Score",
  "altman z-score": "Altman Z-Score",
  "z score": "Altman Z-Score",
  "z-score": "Altman Z-Score",

  // DCF
  "dcf": "DCF",
  "discounted cash flow": "DCF",
  "intrinsic value": "DCF",
  "fair value": "DCF",

  // Beta
  "beta": "Beta",
  "stock beta": "Beta",
  "market beta": "Beta",

  // Sharpe
  "sharpe": "Sharpe Ratio",
  "sharpe ratio": "Sharpe Ratio",

  // Max DD
  "max drawdown": "Max Drawdown",
  "maximum drawdown": "Max Drawdown",
  "drawdown": "Max Drawdown",
  "max dd": "Max Drawdown",

  // Relative Strength
  "relative strength": "Relative Strength",
  "rs": "Relative Strength",
  "rs vs nifty": "Relative Strength",
  "rs vs index": "Relative Strength",

  // Volume Confirmation
  "volume confirmation": "Volume Confirmation",
  "volume signal": "Volume Confirmation",
  "volume profile": "Volume Confirmation",

  // Promoter Holding
  "promoter holding": "Promoter Holding",
  "promoter stake": "Promoter Holding",
  "promoter shareholding": "Promoter Holding",

  // PE Ratio
  "pe": "PE Ratio",
  "p/e": "PE Ratio",
  "pe ratio": "PE Ratio",
  "p/e ratio": "PE Ratio",
  "price to earnings": "PE Ratio",
  "price-to-earnings": "PE Ratio",
  "price earnings ratio": "PE Ratio",

  // ─── Phase 2A — aliases for 30 new concepts ───

  // ROE
  "roe": "ROE",
  "return on equity": "ROE",

  // ROCE
  "roce": "ROCE",
  "return on capital employed": "ROCE",
  "return on capital": "ROCE",

  // EPS
  "eps": "EPS",
  "earnings per share": "EPS",
  "earning per share": "EPS",

  // Book Value
  "book value": "Book Value",
  "bv": "Book Value",
  "book value per share": "Book Value",

  // P/B
  "pb": "P/B Ratio",
  "p/b": "P/B Ratio",
  "pb ratio": "P/B Ratio",
  "p/b ratio": "P/B Ratio",
  "price to book": "P/B Ratio",
  "price-to-book": "P/B Ratio",

  // Dividend Yield
  "dividend yield": "Dividend Yield",
  "dy": "Dividend Yield",
  "div yield": "Dividend Yield",

  // Market Cap
  "market cap": "Market Cap",
  "market capitalisation": "Market Cap",
  "market capitalization": "Market Cap",
  "mcap": "Market Cap",
  "m-cap": "Market Cap",

  // Volume
  "volume": "Volume",
  "trading volume": "Volume",
  "traded volume": "Volume",

  // Liquidity
  "liquidity": "Liquidity",
  "trading liquidity": "Liquidity",
  "turnover": "Liquidity",
  "impact cost": "Liquidity",

  // Volatility
  "volatility": "Volatility",
  "stock volatility": "Volatility",
  "std dev": "Volatility",
  "standard deviation": "Volatility",
  "annualised volatility": "Volatility",

  // Stop Loss
  "stop loss": "Stop Loss",
  "stoploss": "Stop Loss",
  "sl": "Stop Loss",

  // Target Price
  "target price": "Target Price",
  "target": "Target Price",
  "price target": "Target Price",
  "tgt": "Target Price",

  // Support
  "support": "Support",
  "support level": "Support",
  "support zone": "Support",

  // Resistance
  "resistance": "Resistance",
  "resistance level": "Resistance",
  "resistance zone": "Resistance",

  // Trend
  "trend": "Trend",
  "uptrend": "Trend",
  "downtrend": "Trend",
  "trending": "Trend",

  // Pullback
  "pullback": "Pullback",
  "retracement": "Pullback",
  "dip": "Pullback",

  // Breakout
  "breakout": "Breakout",
  "break out": "Breakout",
  "breakouts": "Breakout",

  // Gap
  "gap": "Gap",
  "gap up": "Gap",
  "gap down": "Gap",
  "gap fill": "Gap",

  // Candlestick
  "candlestick": "Candlestick",
  "candle": "Candlestick",
  "candles": "Candlestick",
  "candlestick chart": "Candlestick",
  "candlestick pattern": "Candlestick",

  // SMA
  "sma": "SMA",
  "simple moving average": "SMA",
  "moving average": "SMA",

  // Stochastic
  "stochastic": "Stochastic",
  "stoch": "Stochastic",
  "stochastic oscillator": "Stochastic",

  // OBV
  "obv": "OBV",
  "on balance volume": "OBV",
  "on-balance volume": "OBV",

  // Fibonacci
  "fibonacci": "Fibonacci",
  "fib": "Fibonacci",
  "fib levels": "Fibonacci",
  "fibonacci retracement": "Fibonacci",
  "golden ratio": "Fibonacci",

  // Pivot Points
  "pivot": "Pivot Points",
  "pivots": "Pivot Points",
  "pivot point": "Pivot Points",
  "pivot points": "Pivot Points",

  // Open Interest
  "oi": "Open Interest",
  "open interest": "Open Interest",

  // Sortino
  "sortino": "Sortino Ratio",
  "sortino ratio": "Sortino Ratio",

  // VaR
  "var": "VaR",
  "value at risk": "VaR",
  "var 95": "VaR",
  "var(95)": "VaR",

  // Free Cash Flow
  "fcf": "Free Cash Flow",
  "free cash flow": "Free Cash Flow",
  "free cashflow": "Free Cash Flow",

  // Debt to Equity
  "d/e": "Debt to Equity",
  "de": "Debt to Equity",
  "de ratio": "Debt to Equity",
  "d/e ratio": "Debt to Equity",
  "debt to equity": "Debt to Equity",
  "debt-to-equity": "Debt to Equity",
  "debt equity ratio": "Debt to Equity",

  // Working Capital
  "working capital": "Working Capital",
  "wc": "Working Capital",
  "net working capital": "Working Capital",
};

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?;:"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Stripped tokens we should ignore when scanning free text for a concept name.
const STOP_WORDS = new Set([
  "explain", "what", "is", "the", "a", "an", "of", "how", "do", "i", "in", "to",
  "with", "and", "or", "for", "by", "tell", "me", "about", "meaning", "definition",
  "stockera", "reports", "report", "score", "value", "stock", "stocks", "ratio",
  "simple", "words", "easy", "way", "term", "terms", "explain", "kya", "hai",
  "mtlb", "matlab", "kaise",
]);

export interface ConceptResolution {
  canonical: string;          // matches a key in GLOSSARY
  confidence: "exact" | "alias" | "substring";
}

/**
 * Resolve a free-text query to a canonical concept name.
 * Strategy (no aggressive guessing — returns null on no match):
 *   1. Exact normalised match against the alias map or canonical list.
 *   2. Multi-word alias appearing as a substring of the normalised query.
 *   3. Single-token alias whose token appears in the normalised query
 *      (after stripping stop words). Only accepted when the matched
 *      token is at least 3 characters long.
 */
export function resolveConcept(rawText: string): ConceptResolution | null {
  if (!rawText || typeof rawText !== "string") return null;
  const text = normalise(rawText);
  if (!text) return null;

  // 1. exact match (alias map, then canonical names case-insensitively)
  if (ALIAS_MAP[text]) {
    return { canonical: ALIAS_MAP[text], confidence: "exact" };
  }
  for (const name of SUPPORTED_CONCEPTS) {
    if (normalise(name) === text) return { canonical: name, confidence: "exact" };
  }

  // 2. multi-word alias substring
  for (const [alias, canonical] of Object.entries(ALIAS_MAP)) {
    if (!alias.includes(" ")) continue;
    // require word boundaries on both sides to avoid "is" matching "history"
    const re = new RegExp(`(^|\\s)${escapeRe(alias)}(\\s|$)`);
    if (re.test(text)) {
      return { canonical, confidence: "alias" };
    }
  }
  // canonical multi-word names as substrings too
  for (const name of SUPPORTED_CONCEPTS) {
    const norm = normalise(name);
    if (norm.includes(" ") && new RegExp(`(^|\\s)${escapeRe(norm)}(\\s|$)`).test(text)) {
      return { canonical: name, confidence: "alias" };
    }
  }

  // 3. single-token alias appearing as a standalone word (3+ chars)
  const tokens = text.split(" ").filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  for (const t of tokens) {
    if (ALIAS_MAP[t]) return { canonical: ALIAS_MAP[t], confidence: "substring" };
  }

  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Quick lookup used by the not-found panel: returns up to 5 supported
 *  concept names ordered by overlap of significant tokens with the input. */
export function suggestConcepts(rawText: string, limit = 5): string[] {
  const text = normalise(rawText);
  if (!text) return SUPPORTED_CONCEPTS.slice(0, limit);
  const tokens = new Set(text.split(" ").filter((t) => t.length >= 3 && !STOP_WORDS.has(t)));
  const scored: { name: string; score: number }[] = [];
  for (const name of SUPPORTED_CONCEPTS) {
    let score = 0;
    const nameTokens = normalise(name).split(" ");
    for (const nt of nameTokens) {
      if (tokens.has(nt)) score += 2;
      else if ([...tokens].some((t) => nt.startsWith(t) || t.startsWith(nt))) score += 1;
    }
    scored.push({ name, score });
  }
  scored.sort((a, b) => b.score - a.score);
  // If no signal at all, return a curated default starter set.
  if (scored[0].score === 0) {
    return ["RSI", "MACD", "DCF", "Beta", "Piotroski F-Score"];
  }
  return scored.slice(0, limit).map((s) => s.name);
}

/** Sanity check used by tests / dev only — every alias points to a real entry. */
export function _assertAliasIntegrity(): void {
  for (const [alias, canonical] of Object.entries(ALIAS_MAP)) {
    if (!(canonical in GLOSSARY)) {
      throw new Error(`Alias "${alias}" -> "${canonical}" not in GLOSSARY`);
    }
  }
}
