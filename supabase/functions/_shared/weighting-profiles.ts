// Tier weighting profiles — extracted verbatim from generate-stock-analysis
// (pre-audit baseline). FROZEN; do NOT mutate without bumping the id.
// Mission 1 Part E · Fix 1 (extraction only, no retune).
// Phase 4A: added short_v1 — first-class short-term swing tier.

export type WeightingProfileId =
  | "intraday_v1"
  | "short_v1"
  | "medium_v1"
  | "long_v1";

export type TierId = "intraday" | "short-term" | "medium-term" | "long-term";

export type PillarWeights = {
  technical: number;
  fundamental: number;
  risk: number;
  momentum: number;
  sentiment: number;
};

export type WeightingProfile = {
  id: WeightingProfileId;
  description: string;
  created_at: string; // ISO
  author: string;
  frozen: true;
  baseline_source: string;
  weights: PillarWeights;
};

export const WEIGHTING_PROFILES: Record<WeightingProfileId, WeightingProfile> = {
  intraday_v1: {
    id: "intraday_v1",
    description:
      "Intraday tier — technical/momentum dominant; fundamentals zero-weighted; sentiment minor.",
    created_at: "2026-06-01T00:00:00Z",
    author: "system_extracted_v1",
    frozen: true,
    baseline_source: "extracted_from_orchestrator_pre_audit",
    weights: { technical: 0.45, fundamental: 0.00, risk: 0.20, momentum: 0.30, sentiment: 0.05 },
  },
  // Short-term swing tier — technical-led with momentum support; fundamentals
  // minor; sentiment moderate. Defensible because short-horizon swing trades
  // are driven primarily by chart structure and momentum continuation, with
  // fundamentals acting only as a sanity rail (not a thesis driver), risk
  // still material due to gap/drawdown exposure, and sentiment carrying modest
  // weight because flow/news can swing prices within a <3mo window.
  short_v1: {
    id: "short_v1",
    description:
      "Short-term swing tier — technical-led with momentum support; fundamentals minor; sentiment moderate.",
    created_at: "2026-06-03T00:00:00Z",
    author: "phase_4a",
    frozen: true,
    baseline_source: "phase_4a_short_term_introduction",
    weights: { technical: 0.40, fundamental: 0.10, risk: 0.20, momentum: 0.20, sentiment: 0.10 },
  },
  medium_v1: {
    id: "medium_v1",
    description:
      "Medium-term tier — balanced technical / fundamental / risk; sentiment moderate.",
    created_at: "2026-06-01T00:00:00Z",
    author: "system_extracted_v1",
    frozen: true,
    baseline_source: "extracted_from_orchestrator_pre_audit",
    weights: { technical: 0.25, fundamental: 0.25, risk: 0.20, momentum: 0.20, sentiment: 0.10 },
  },
  long_v1: {
    id: "long_v1",
    description:
      "Long-term tier — fundamentals dominant; risk material; technical/momentum reduced.",
    created_at: "2026-06-01T00:00:00Z",
    author: "system_extracted_v1",
    frozen: true,
    baseline_source: "extracted_from_orchestrator_pre_audit",
    weights: { technical: 0.15, fundamental: 0.40, risk: 0.20, momentum: 0.15, sentiment: 0.10 },
  },
};

export function profileIdForTier(tier: TierId): WeightingProfileId {
  switch (tier) {
    case "intraday":    return "intraday_v1";
    case "short-term":  return "short_v1";
    case "long-term":   return "long_v1";
    case "medium-term":
    default:            return "medium_v1";
  }
}

export function weightsForTier(tier: TierId): PillarWeights {
  return WEIGHTING_PROFILES[profileIdForTier(tier)].weights;
}
