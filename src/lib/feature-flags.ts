// Front-end feature flags. Keep this tiny and dependency-free.
// Flags are evaluated at module load; flip them here to roll back instantly.

export const FEATURE_FLAGS = {
  /**
   * Mission 1 — Part B.2.
   * When ON, the StockAnalysisReport renders the new tier-shaped metric grid
   * (different cards per tier) instead of the legacy 4-card grid.
   * The legacy grid stays in the bundle (rendered when flag is OFF) until
   * Part B.3 removes it for good.
   */
  tier_shaped_grid_v1: true,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
