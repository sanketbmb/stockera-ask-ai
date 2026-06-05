// Mission 6.4 — Wave 3 Option A+
// Horizon-aware pillar shaping, banking carve-out blend, and symmetric
// one-bucket promotion. Bounded, symmetric, fully gated by the
// HORIZON_SHAPING_VERSION env var so unset = byte-identical to today.
//
// Caps (HARD):
//   - per-pillar delta: ±3
//   - total weighted overall delta from shaping: ±4
//   - promotion: at most one bucket up, never above HOLD, never lifts AVOID
//
// All shaping/carve-out helpers are NO-OPs when SHAPING_ACTIVE is false.

import type { PillarWeights } from "./weighting-profiles.ts";

export const HORIZON_SHAPING_VERSION = Deno.env.get("HORIZON_SHAPING_VERSION") ?? "";
export const SHAPING_ACTIVE = HORIZON_SHAPING_VERSION === "shape_v1";
// Mission 6.4 Move 1 — promotion rule kill-switch (default OFF until re-spec'd
// post falsification-audit). Shaping + carve-out remain active independently.
export const PROMOTION_RULES_ENABLED =
  (Deno.env.get("PROMOTION_RULES_ENABLED") ?? "false").toLowerCase() === "true";

export type QueryType = "intraday" | "short-term" | "medium-term" | "long-term";
export type PillarKey = "technical" | "fundamental" | "risk" | "momentum" | "sentiment";

export type PillarScores = Record<PillarKey, number | null>;
export type PerPillarDelta = Record<PillarKey, number>;

const ALL_PILLARS: PillarKey[] = ["technical", "fundamental", "risk", "momentum", "sentiment"];

// Per-tier emphasis: pillars that shaping is allowed to nudge.
// Medium-term is intentionally empty — it is already the balanced baseline.
const EMPHASIS: Record<QueryType, PillarKey[]> = {
  "intraday":    ["technical", "momentum"],
  "short-term":  ["technical", "momentum"],
  "medium-term": [],
  "long-term":   ["fundamental", "risk"],
};

const PER_PILLAR_CAP = 3;
const TOTAL_DELTA_CAP = 4;

export function emptyDelta(): PerPillarDelta {
  return { technical: 0, fundamental: 0, risk: 0, momentum: 0, sentiment: 0 };
}

export function computeOverall(scores: PillarScores, weights: PillarWeights): number {
  let sum = 0, wUsed = 0;
  for (const k of ALL_PILLARS) {
    const w = weights[k];
    const s = scores[k];
    if (w > 0 && s != null) { sum += s * w; wUsed += w; }
  }
  return wUsed > 0 ? Math.round(sum / wUsed) : 0;
}

export type ShapingResult = {
  shapedScores: PillarScores;
  perPillarDelta: PerPillarDelta;
  totalDelta: number;   // weighted overall delta vs input
  applied: boolean;
};

// Symmetric pillar nudge for the tier's emphasized pillars only.
// Direction follows the pillar's distance from neutral 50 — strong pillars
// in an emphasized slot lift; weak pillars in an emphasized slot drag.
// Capped to ±3 per pillar and scaled down so the weighted overall delta
// never exceeds ±4.
export function shapeScoresByHorizon(
  scores: PillarScores,
  weights: PillarWeights,
  queryType: QueryType,
): ShapingResult {
  if (!SHAPING_ACTIVE) {
    return { shapedScores: { ...scores }, perPillarDelta: emptyDelta(), totalDelta: 0, applied: false };
  }

  const emphasized = EMPHASIS[queryType];
  const rawDelta: PerPillarDelta = emptyDelta();
  for (const k of emphasized) {
    const s = scores[k];
    if (s == null) continue;
    let d = Math.round((s - 50) / 10);
    if (d > PER_PILLAR_CAP) d = PER_PILLAR_CAP;
    if (d < -PER_PILLAR_CAP) d = -PER_PILLAR_CAP;
    rawDelta[k] = d;
  }

  // Weighted overall delta from the proposed per-pillar deltas.
  let weightedSum = 0, wUsed = 0;
  for (const k of ALL_PILLARS) {
    const w = weights[k];
    if (w > 0 && scores[k] != null) { wUsed += w; weightedSum += rawDelta[k] * w; }
  }
  const proposedOverallDelta = wUsed > 0 ? weightedSum / wUsed : 0;

  let scale = 1;
  if (Math.abs(proposedOverallDelta) > TOTAL_DELTA_CAP) {
    scale = TOTAL_DELTA_CAP / Math.abs(proposedOverallDelta);
  }

  const finalDelta: PerPillarDelta = emptyDelta();
  const shaped: PillarScores = { ...scores };
  let finalWeightedSum = 0;
  for (const k of ALL_PILLARS) {
    const d = Math.round(rawDelta[k] * scale);
    finalDelta[k] = d;
    if (shaped[k] != null && d !== 0) {
      shaped[k] = Math.max(0, Math.min(100, (shaped[k] as number) + d));
    }
    const w = weights[k];
    if (w > 0 && scores[k] != null) finalWeightedSum += d * w;
  }
  const totalDelta = wUsed > 0 ? Math.round((finalWeightedSum / wUsed) * 10) / 10 : 0;

  return { shapedScores: shaped, perPillarDelta: finalDelta, totalDelta, applied: true };
}

// ─── Banking carve-out blend ───
// Long-term only, banks only. Blends compute-fundamentals' fund score with
// the banking-applicable long-quality composite (Piotroski + earnings
// consistency, dampened at 0.5x intensity inside compute-long-term-quality).
// Symmetric: weak banks drift down, healthy banks drift up.

export type CarveoutResult = {
  applied: boolean;
  fundamentalBlended: number | null;
  fundamentalOriginal: number | null;
  longQualityCompositeBanking: number | null;
  reason: string | null;
};

export function applyBankingCarveout(
  fundamentalScore: number | null,
  longQualityCompositeBanking: number | null,
  queryType: QueryType,
  isBanking: boolean,
): CarveoutResult {
  if (!SHAPING_ACTIVE) {
    return { applied: false, fundamentalBlended: fundamentalScore, fundamentalOriginal: fundamentalScore, longQualityCompositeBanking, reason: "shaping_inactive" };
  }
  if (queryType !== "long-term") {
    return { applied: false, fundamentalBlended: fundamentalScore, fundamentalOriginal: fundamentalScore, longQualityCompositeBanking, reason: "non_long_tier" };
  }
  if (!isBanking) {
    return { applied: false, fundamentalBlended: fundamentalScore, fundamentalOriginal: fundamentalScore, longQualityCompositeBanking, reason: "non_banking" };
  }
  if (fundamentalScore == null || longQualityCompositeBanking == null) {
    return { applied: false, fundamentalBlended: fundamentalScore, fundamentalOriginal: fundamentalScore, longQualityCompositeBanking, reason: "missing_input" };
  }
  const blended = Math.round(0.5 * fundamentalScore + 0.5 * longQualityCompositeBanking);
  return {
    applied: true,
    fundamentalBlended: blended,
    fundamentalOriginal: fundamentalScore,
    longQualityCompositeBanking,
    reason: "banking_long_term_blend",
  };
}

// ─── Symmetric one-bucket promotion ───
// Lifts SELL→WATCHLIST or WATCHLIST→HOLD when ALL gates pass.
// Never promotes AVOID. Never lifts above HOLD.

export type PromotionAction = "AVOID" | "SELL" | "WATCHLIST" | "HOLD" | "BUY";

export type PromotionOpts = {
  confidenceBand: string | null;
  missingPillars: number;
  fundamentalFallbackApplied: boolean;
  volumeConfirmation: string | null;
};

export type PromotionResult = {
  promoted: boolean;
  newAction: PromotionAction;
  reason: string | null;
};

// Inclusive boundaries — score must be within 6 points of the next bucket.
const NEXT_BUCKET_THRESHOLD: Record<PromotionAction, number | null> = {
  "AVOID": null,
  "SELL": 45,        // → WATCHLIST
  "WATCHLIST": 60,   // → HOLD
  "HOLD": null,      // never promote above HOLD
  "BUY": null,
};
const PROXIMITY = 6;

export function evaluatePromotion(
  action: PromotionAction,
  overallScore: number,
  scores: PillarScores,
  queryType: QueryType,
  opts: PromotionOpts,
): PromotionResult {
  if (!SHAPING_ACTIVE) return { promoted: false, newAction: action, reason: null };
  if (!PROMOTION_RULES_ENABLED) return { promoted: false, newAction: action, reason: "promotion_rules_disabled" };
  const threshold = NEXT_BUCKET_THRESHOLD[action];
  if (threshold == null) return { promoted: false, newAction: action, reason: null };
  if (opts.missingPillars > 0) return { promoted: false, newAction: action, reason: "missing_pillars" };
  if (opts.confidenceBand && opts.confidenceBand.toLowerCase().startsWith("low")) {
    return { promoted: false, newAction: action, reason: "low_confidence" };
  }
  if (overallScore < threshold - PROXIMITY) {
    return { promoted: false, newAction: action, reason: "too_far_from_boundary" };
  }

  let signal = false;
  let signalDesc = "";
  if (queryType === "long-term") {
    signal = (scores.fundamental != null && scores.fundamental >= 55) || opts.fundamentalFallbackApplied === true;
    signalDesc = "long:F>=55_or_fund_fallback";
  } else if (queryType === "medium-term") {
    signal = (scores.technical != null && scores.technical >= 55) && (scores.momentum != null && scores.momentum >= 50);
    signalDesc = "medium:tech>=55_AND_mom>=50";
  } else if (queryType === "short-term") {
    signal = (scores.technical != null && scores.technical >= 60) && (scores.momentum != null && scores.momentum >= 55);
    signalDesc = "short:tech>=60_AND_mom>=55";
  } else {
    signal = (scores.technical != null && scores.technical >= 60)
      && (scores.momentum != null && scores.momentum >= 55)
      && (opts.volumeConfirmation === "POSITIVE");
    signalDesc = "intraday:tech>=60_AND_mom>=55_AND_vol+";
  }
  if (!signal) return { promoted: false, newAction: action, reason: "no_tier_signal" };

  const order: PromotionAction[] = ["AVOID", "SELL", "WATCHLIST", "HOLD", "BUY"];
  const idx = order.indexOf(action);
  // Safety: only SELL or WATCHLIST may promote (HOLD threshold is null above).
  if (idx < 0 || idx >= order.indexOf("HOLD")) return { promoted: false, newAction: action, reason: null };
  return { promoted: true, newAction: order[idx + 1], reason: signalDesc };
}

// ─── Earnings consistency label → 0-100 (helper for compute-long-term-quality) ───
export function earningsConsistencyToScore(label: string | null): number | null {
  if (label == null) return null;
  switch (label) {
    case "VERY_HIGH": return 90;
    case "HIGH":      return 75;
    case "MODERATE":  return 55;
    case "LOW":       return 35;
    case "VERY_LOW":  return 15;
    default: return null;
  }
}

// Composite for banking long-quality, dampened to 0.5x intensity vs neutral 50.
// Returns null when neither Piotroski nor earnings_consistency is available.
export function bankingLongQualityComposite(
  piotroskiFScore: number | null,
  earningsConsistencyLabel: string | null,
): number | null {
  const pioRaw = piotroskiFScore != null ? Math.max(0, Math.min(100, (piotroskiFScore / 9) * 100)) : null;
  const earn = earningsConsistencyToScore(earningsConsistencyLabel);
  const parts: number[] = [];
  if (pioRaw != null) parts.push(pioRaw);
  if (earn  != null) parts.push(earn);
  if (parts.length === 0) return null;
  const raw = parts.reduce((a, b) => a + b, 0) / parts.length;
  // 0.5x intensity = dampen toward 50.
  const dampened = 50 + 0.5 * (raw - 50);
  return Math.round(dampened);
}
