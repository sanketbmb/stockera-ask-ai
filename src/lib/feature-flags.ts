// Centralized feature flags. Default to the smallest, safest UI surface.
// Phase 3 query types (Sector View, Educational, Other) are intentionally
// gated until their Brain flows ship.

export const ENABLE_PHASE3_QUERY_TYPES = false;

// Canonical list of intents whose end-to-end Brain flow is wired in production.
// Intake (form, server functions) MUST reject anything outside this allowlist
// when ENABLE_PHASE3_QUERY_TYPES is false.
export const LIVE_INTENTS = [
  "buy_decision",
  "stuck_position",
  "should_average",
] as const;

export const PHASE3_INTENTS = [
  "educational",
  "sector_view",
  "other",
] as const;

export type LiveIntent = (typeof LIVE_INTENTS)[number];
export type Phase3Intent = (typeof PHASE3_INTENTS)[number];
export type AnyIntent = LiveIntent | Phase3Intent;

export function isLiveIntent(value: string): value is LiveIntent {
  return (LIVE_INTENTS as readonly string[]).includes(value);
}

/**
 * Visible intents in the current build. When ENABLE_PHASE3_QUERY_TYPES is
 * false (default), only the three wired intents are returned. Phase 3 intents
 * are never sent to the DOM in that mode.
 */
export function visibleIntents(): readonly AnyIntent[] {
  return ENABLE_PHASE3_QUERY_TYPES
    ? ([...LIVE_INTENTS, ...PHASE3_INTENTS] as const)
    : LIVE_INTENTS;
}
