// Stage 4A.2 — public analytics cards barrel.
// PUBLIC RENDER LOCK: AnalyticsTab imports ONLY from this barrel.
// Never import from src/components/analysis/* — that path is report-only.
//
// Allowed on the public /stock/$symbol route:
//   1. ScoreRingBlock (composite score ring + 5 pillar bars)
//   2. ReturnsAtAGlance
//   3. BusinessQualityCard
//   4. ValuationFairValueCard
//   5. RiskProfileCard
//   6. LongTermReturnsCard
//   7. Latest30dNewsBlock
//
// FORBIDDEN on this route:
//   - verdict hero, ActionPanel, PriceBand
//   - confidence triad, staggered plan, behavioral nudges
//   - LLM-authored narrative / summary_reason / recap
export { ScoreRingBlock } from "./ScoreRingBlock";
export { ReturnsAtAGlance } from "./ReturnsAtAGlance";
export { BusinessQualityCard } from "./BusinessQualityCard";
export { ValuationFairValueCard } from "./ValuationFairValueCard";
export { RiskProfileCard } from "./RiskProfileCard";
export { LongTermReturnsCard } from "./LongTermReturnsCard";
export { Latest30dNewsBlock } from "./Latest30dNewsBlock";
