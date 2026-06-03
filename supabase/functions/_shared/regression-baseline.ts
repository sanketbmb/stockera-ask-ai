// Regression baseline — Mission 1 Part E · Step E.0
//
// The orchestrator echoes the relevant entry into audit_meta.regression_baseline
// when one of these reference symbols + tiers is requested. After Part E fixes
// are applied, the orchestrator also computes audit_meta.regression_drift by
// comparing live verdict vs. these baselines.
//
// Values below MUST be captured from production responses BEFORE deploying the
// Part E refactor. Until they are filled in, the orchestrator records the
// baseline as `null` and skips drift assertion (no false-positive failures).
//
// To capture a baseline:
//   1. Hit /analysis/<SYMBOL>?horizon=<TIER> in production.
//   2. Copy final_verdict.{action,overall_score,confidence_pct} and
//      score_breakdown into the matching entry below.
//   3. Re-deploy. Drift will now be asserted automatically.

export type RegressionTier = "intraday" | "short-term" | "medium-term" | "long-term";

export type RegressionBaselineEntry = {
  symbol: string;
  tier: RegressionTier;
  final_verdict: {
    action: string;
    overall_score: number;
    confidence_pct: number;
  } | null;
  score_breakdown: {
    technical_score: number | null;
    fundamental_score: number | null;
    risk_score: number | null;
    momentum_score: number | null;
    sentiment_score: number | null;
  } | null;
  captured_at: string | null;
};

export const REGRESSION_BASELINES: RegressionBaselineEntry[] = [
  { symbol: "RELIANCE",  tier: "intraday",  final_verdict: null, score_breakdown: null, captured_at: null },
  { symbol: "TCS",       tier: "long-term", final_verdict: null, score_breakdown: null, captured_at: null },
  { symbol: "HDFCBANK",  tier: "long-term", final_verdict: null, score_breakdown: null, captured_at: null },
  { symbol: "ICICIBANK", tier: "long-term", final_verdict: null, score_breakdown: null, captured_at: null },
];

export function findBaseline(symbol: string, tier: RegressionTier): RegressionBaselineEntry | null {
  const sym = symbol.toUpperCase();
  return REGRESSION_BASELINES.find((e) => e.symbol === sym && e.tier === tier) ?? null;
}
