// Tier weighting profiles — extracted verbatim from generate-stock-analysis
// (pre-audit baseline). FROZEN; do NOT mutate without bumping the id.
// Mission 1 Part E · Fix 1 (extraction only, no retune).

export type WeightingProfileId = "intraday_v1" | "medium_v1" | "long_v1";

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

export function profileIdForTier(tier: "intraday" | "medium-term" | "long-term"): WeightingProfileId {
  return tier === "intraday" ? "intraday_v1" : tier === "long-term" ? "long_v1" : "medium_v1";
}

export function weightsForTier(tier: "intraday" | "medium-term" | "long-term"): PillarWeights {
  return WEIGHTING_PROFILES[profileIdForTier(tier)].weights;
}
