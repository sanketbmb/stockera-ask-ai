// Deterministic intake parser for /post-query Fresh Entry submissions.
// Translates the human-friendly form selections into the orchestrator's
// strict horizon tier vocabulary, and produces the interpretation line
// rendered by <ReflectiveBanner />. No LLM calls.

import type { QueryType } from "@/types/stock-analysis";

const HORIZON_FORM_TO_TIER: Record<string, QueryType> = {
  "Intraday": "intraday",
  // No "short-term" tier exists in the orchestrator — collapse to medium-term.
  "Short-term (<3mo)": "medium-term",
  "Medium-term (3-12mo)": "medium-term",
  "Long-term (1+ year)": "long-term",
};

export function normalizeHorizon(formValue: string | null | undefined): QueryType {
  if (!formValue) return "medium-term";
  return HORIZON_FORM_TO_TIER[formValue] ?? "medium-term";
}

const HORIZON_HUMAN_LABEL: Record<QueryType, string> = {
  intraday: "Intraday view",
  "medium-term": "Medium-term view",
  "long-term": "Long-term view",
};

export function horizonHumanLabel(tier: QueryType): string {
  return HORIZON_HUMAN_LABEL[tier];
}

export interface InterpretedQuery {
  rawQuestion: string;
  interpretedType: "Fresh Entry";
  interpretedSymbol: string;
  interpretedHorizon: QueryType;
}

export function buildInterpretation(args: {
  rawQuestion: string;
  symbol: string;
  horizonTier: QueryType;
}): InterpretedQuery {
  return {
    rawQuestion: args.rawQuestion.trim(),
    interpretedType: "Fresh Entry",
    interpretedSymbol: args.symbol.toUpperCase(),
    interpretedHorizon: args.horizonTier,
  };
}
