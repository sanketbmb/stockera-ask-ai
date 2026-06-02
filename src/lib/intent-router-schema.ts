// Phase 3A — Free-text intent router schema.
// Shared between the server fn (validates LLM tool-call output) and the
// client (types + form-intent mapping). Keep this file dependency-light —
// no server-only imports.

import { z } from "zod";
import type { AnyIntent } from "@/lib/feature-flags";

export const RouterIntentEnum = z.enum([
  "fresh_entry",
  "existing_position",
  "averaging_decision",
  "sector_view",
  "educational",
  "other",
]);
export type RouterIntent = z.infer<typeof RouterIntentEnum>;

export const RouterHorizonEnum = z.enum(["intraday", "short", "medium", "long"]);
export type RouterHorizon = z.infer<typeof RouterHorizonEnum>;

export const RouterLanguageEnum = z.enum(["english", "hindi", "hinglish", "other"]);

export const RouterOutputSchema = z.object({
  interpreted_type: RouterIntentEnum,
  symbol: z.string().min(1).max(40).nullable(),
  sector: z.string().min(1).max(80).nullable(),
  horizon: RouterHorizonEnum.nullable(),
  entry_price: z.number().positive().max(1_000_000).nullable(),
  qty: z.number().int().positive().max(10_000_000).nullable(),
  custom_question: z.string().max(500).nullable(),
  language_hint: RouterLanguageEnum,
  confidence_score: z.number().min(0).max(1),
  clarification_needed: z.boolean(),
  router_version: z.string().min(1).max(40),
});
export type RouterOutput = z.infer<typeof RouterOutputSchema>;

export const ROUTER_VERSION = "router_v1";
export const ROUTER_VERSION_FALLBACK = "router_v1_fallback";

/** Deterministic "couldn't classify" payload — used on timeout / API failure. */
export function buildRouterFallback(rawText: string): RouterOutput {
  return {
    interpreted_type: "other",
    symbol: null,
    sector: null,
    horizon: null,
    entry_price: null,
    qty: null,
    custom_question: rawText.slice(0, 500),
    language_hint: "english",
    confidence_score: 0,
    clarification_needed: true,
    router_version: ROUTER_VERSION_FALLBACK,
  };
}

/** Collapse canonical router type -> form intent. Phase 3B unlocks
 *  sector_view as a first-class form intent. Phase 3C unlocks
 *  educational. "other" remains the catch-all. */
export function toFormIntent(t: RouterIntent): AnyIntent {
  switch (t) {
    case "fresh_entry":
      return "buy_decision";
    case "existing_position":
      return "stuck_position";
    case "averaging_decision":
      return "should_average";
    case "sector_view":
      return "sector_view";
    case "educational":
      return "educational";
    case "other":
    default:
      return "other";
  }
}

export type ConfidenceBand = "high" | "medium" | "low";
export function confidenceBand(score: number): ConfidenceBand {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

/** Map router horizon -> the human-readable strings the form's Select uses. */
export function routerHorizonToFormHorizon(h: RouterHorizon | null): string | null {
  switch (h) {
    case "intraday":
      return "Intraday";
    case "short":
      return "Short-term (<3mo)";
    case "medium":
      return "Medium-term (3-12mo)";
    case "long":
      return "Long-term (1+ year)";
    default:
      return null;
  }
}
