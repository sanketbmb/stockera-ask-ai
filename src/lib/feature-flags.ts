// Centralized feature flags. Default to the smallest, safest UI surface.
// Phase 3 query types (Sector View, Educational) stay gated until their
// Brain flows ship. Phase 3A enables the free-text router + the "Other"
// chip as a graceful fallback for unroutable / not-yet-shipped intents.
// Phase 3B unlocks the Sector View chip + its dedicated report renderer
// (sector_aggregates-only MVP).

export const ENABLE_PHASE3_QUERY_TYPES = false;

// Phase 3A — turn the LLM-backed free-text router on. When true, the
// "Other" chip is exposed as a deliberate user-facing escape hatch and
// the QueryForm calls the classifier on Step 0 -> Step 1.
export const ENABLE_FREE_TEXT_ROUTER = true;

// Phase 3B — turn the Sector View chip + dedicated SectorViewReport on,
// independently of the broader Phase 3 unlock. Keeps Educational gated
// while Sector View ships against the sector_aggregates baseline.
export const ENABLE_SECTOR_VIEW = true;

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
 * Intents the server + form accept on submit. Phase 3A widens the
 * allowlist to include "other"; Phase 3B additionally accepts
 * "sector_view" when ENABLE_SECTOR_VIEW is on.
 */
export function isRoutableIntent(
  value: string,
): value is LiveIntent | "other" | "sector_view" {
  if (isLiveIntent(value)) return true;
  if (ENABLE_FREE_TEXT_ROUTER && value === "other") return true;
  if ((ENABLE_SECTOR_VIEW || ENABLE_PHASE3_QUERY_TYPES) && value === "sector_view") return true;
  return false;
}

/**
 * Visible intents in the current build. Phase 2.1 returned LIVE only.
 * Phase 3A additionally exposes "other"; Phase 3B additionally exposes
 * "sector_view" when its flag is on. Educational stays hidden until the
 * full Phase 3 unlock.
 */
export function visibleIntents(): readonly AnyIntent[] {
  if (ENABLE_PHASE3_QUERY_TYPES) {
    return [...LIVE_INTENTS, ...PHASE3_INTENTS] as const;
  }
  const extras: Phase3Intent[] = [];
  if (ENABLE_SECTOR_VIEW) extras.push("sector_view");
  if (ENABLE_FREE_TEXT_ROUTER) extras.push("other");
  return [...LIVE_INTENTS, ...extras];
}
