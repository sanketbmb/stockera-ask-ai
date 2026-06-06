// Wave 5h Sub-track B — deterministic server-safe ambiguity gate.
//
// The intent router (Gemini) confidently auto-resolves bare family stems like
// "ICICI" → "ICICIBANK" or "Reliance" → "RELIANCE", which silently buries
// other valid family members (ICICIPRULI, ICICIGI, JIOFIN, RPOWER, …).
//
// This module runs BEFORE we trust the router's `symbol`:
//   - In QueryForm.handleSubmit: if the raw text matches an ambiguous stem
//     AND the user did not explicitly pick a ticker via StockAutocomplete,
//     we persist the bare stem as stock_symbol so the freeze fn can short-
//     circuit to the picker.
//   - In freezeOrReadReport: if the persisted stock_symbol IS the bare stem
//     (and matches a stem in this map), synthesize a SYMBOL_AMBIGUOUS
//     payload and render the existing UnsupportedSymbolPanel picker.
//
// Pure module, no I/O. Safe to import on both client and server.

export interface AmbiguityCandidate {
  symbol: string;
  company_name: string;
  exchange: "NSE";
}

export interface AmbiguityMatch {
  stem: string; // canonical stem token, uppercase ("ICICI", "TATA MOTORS", …)
  candidates: AmbiguityCandidate[];
}

// Stem → family map. Mirrors the family groupings in
// supabase/functions/_shared/symbol-successors.ts. Keep this list narrow:
// only stems where multiple ACTIVE NSE listings share the same colloquial
// name. Adding a stem here forces the picker — never add a stem that has
// only one real interpretation.
interface StemEntry {
  // Regex to match the stem in raw user text. Word-boundary, case-insensitive.
  pattern: RegExp;
  stem: string;
  candidates: AmbiguityCandidate[];
  // If the user text also contains any of these qualifier tokens, the stem
  // is considered disambiguated by the user (e.g. "reliance industries"
  // → RELIANCE specifically, not the family picker).
  disqualifiers?: RegExp;
}

const STEM_TABLE: StemEntry[] = [
  {
    stem: "ICICI",
    pattern: /\bicici\b/i,
    // Exclude exact tickers in the raw text — those are unambiguous.
    disqualifiers: /\b(ICICIBANK|ICICIPRULI|ICICIGI)\b/i,
    candidates: [
      { symbol: "ICICIBANK", company_name: "ICICI Bank Ltd", exchange: "NSE" },
      { symbol: "ICICIPRULI", company_name: "ICICI Prudential Life Insurance", exchange: "NSE" },
      { symbol: "ICICIGI", company_name: "ICICI Lombard General Insurance", exchange: "NSE" },
    ],
  },
  {
    stem: "TATA MOTORS",
    pattern: /\btata\s*motors\b/i,
    disqualifiers: /\b(TMCV|TMPV)\b/i,
    candidates: [
      { symbol: "TMPV", company_name: "Tata Motors Passenger Vehicles Ltd", exchange: "NSE" },
      { symbol: "TMCV", company_name: "Tata Motors Commercial Vehicles Ltd", exchange: "NSE" },
    ],
  },
  {
    stem: "RELIANCE",
    pattern: /\breliance\b/i,
    // "Reliance Industries" / "RIL" → RELIANCE specifically. Jio Financial
    // and Reliance Power are distinct listings.
    disqualifiers: /\b(industries|RIL|JIOFIN|RPOWER|jio\s*financial|reliance\s*power)\b/i,
    candidates: [
      { symbol: "RELIANCE", company_name: "Reliance Industries Ltd", exchange: "NSE" },
      { symbol: "JIOFIN", company_name: "Jio Financial Services Ltd", exchange: "NSE" },
      { symbol: "RPOWER", company_name: "Reliance Power Ltd", exchange: "NSE" },
    ],
  },
  {
    stem: "ADANI",
    pattern: /\badani\b/i,
    // Any specific Adani company name or exact ticker disqualifies.
    disqualifiers:
      /\b(enterprises|ports|power|green|transmission|energy|wilmar|gas|total|ADANIENT|ADANIPORTS|ADANIPOWER|ADANIGREEN|ADANIENSOL|ATGL|AWL)\b/i,
    candidates: [
      { symbol: "ADANIENT", company_name: "Adani Enterprises Ltd", exchange: "NSE" },
      { symbol: "ADANIPORTS", company_name: "Adani Ports & SEZ Ltd", exchange: "NSE" },
      { symbol: "ADANIPOWER", company_name: "Adani Power Ltd", exchange: "NSE" },
      { symbol: "ADANIGREEN", company_name: "Adani Green Energy Ltd", exchange: "NSE" },
      { symbol: "ADANIENSOL", company_name: "Adani Energy Solutions Ltd", exchange: "NSE" },
      { symbol: "ATGL", company_name: "Adani Total Gas Ltd", exchange: "NSE" },
    ],
  },
];

/**
 * Detect whether the raw user text contains an ambiguous family stem.
 * Returns the first matching stem (priority = STEM_TABLE order) or null.
 */
export function detectAmbiguousStem(rawText: string | null | undefined): AmbiguityMatch | null {
  if (!rawText) return null;
  const text = String(rawText);
  for (const entry of STEM_TABLE) {
    if (!entry.pattern.test(text)) continue;
    if (entry.disqualifiers && entry.disqualifiers.test(text)) continue;
    return { stem: entry.stem, candidates: entry.candidates };
  }
  return null;
}

/**
 * Helper used by the freeze fn: if the persisted stock_symbol IS one of the
 * known bare stems (uppercase, possibly with internal spaces collapsed),
 * return its match. Different from text scanning: this checks the SYMBOL
 * field for a stem sentinel persisted by QueryForm.
 */
export function matchStemBySymbol(stockSymbol: string | null | undefined): AmbiguityMatch | null {
  if (!stockSymbol) return null;
  const normalized = stockSymbol.trim().toUpperCase().replace(/\s+/g, " ");
  for (const entry of STEM_TABLE) {
    if (entry.stem === normalized) {
      return { stem: entry.stem, candidates: entry.candidates };
    }
  }
  return null;
}
