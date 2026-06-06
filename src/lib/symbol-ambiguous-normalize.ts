// Wave 5f Problem 1b — shared normalizer for SYMBOL_AMBIGUOUS orchestrator
// responses. Both the live /analysis/$symbol route and the frozen
// /report/$queryId route should render the same UnsupportedSymbolPanel
// instead of a generic red error screen.

import type { UnsupportedSymbolPayload } from "@/types/stock-analysis";

interface AmbiguousCandidate {
  symbol: string;
  company_name: string | null;
  exchange: string;
}

interface AmbiguousError {
  success?: false;
  error?: string;
  symbol?: string;
  candidates?: AmbiguousCandidate[];
  hint?: string;
}

export function isSymbolAmbiguousError(value: unknown): value is AmbiguousError {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.success === false && v.error === "SYMBOL_AMBIGUOUS";
}

export function synthesizeAmbiguousPayload(
  raw: AmbiguousError,
  fallbackSymbol: string,
): UnsupportedSymbolPayload {
  const candidates = Array.isArray(raw.candidates) ? raw.candidates : [];
  return {
    success: true,
    verdict_reason: "SYMBOL_AMBIGUOUS",
    symbol: raw.symbol ?? fallbackSymbol,
    successor_candidates: [],
    fuzzy_candidates: candidates.map((c) => ({
      symbol: c.symbol,
      company_name: c.company_name,
      exchange: c.exchange,
    })),
    hint: raw.hint ?? "Multiple matches — pick a specific ticker.",
  };
}
