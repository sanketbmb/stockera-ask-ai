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
