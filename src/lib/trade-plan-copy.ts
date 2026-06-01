// Centralized retail-friendly translations for trade-plan engine omission reasons.
// Engine reasons live verbatim in `audit_meta.trade_plan_validation[].reason`.
// The UI consumes `omissionCopy(reason)` to render an editorial-tone tooltip,
// and reveals the raw engine string via a small "Why?" footer for pros.

export interface OmissionCopy {
  friendly: string;
  raw: string;
}

const EXACT: Record<string, string> = {
  support_above_spot: "This level was invalidated by recent price action.",
  resistance_below_spot: "This level was invalidated by recent price action.",
  sl_too_tight_below_atr: "The engine omitted this stop loss because it would trigger on normal market noise.",
  "t1_rr_below_1.5": "Reward potential too low relative to the risk. Engine suppressed.",
  "t2_rr_below_2.0": "Reward potential too low relative to the risk. Engine suppressed.",
  dcf_degenerate: "Long-term valuation model degraded; target unavailable.",
  banking_override: "Not applicable for banking-sector stocks.",
  s1_equals_s2: "Levels too close to be meaningful. Engine suppressed.",
  r1_equals_t1: "Conflict between resistance and target. Engine suppressed.",
  sl_above_spot_invalid_for_long_position:
    "Stop loss would sit above entry — invalid for a long position. Engine suppressed.",
};

// Loose pattern fallbacks so new engine reason codes still translate gracefully.
function pattern(reason: string): string | null {
  const r = reason.toLowerCase();
  if (r.includes("rr_below") || r.includes("reward")) return "Reward potential too low relative to the risk. Engine suppressed.";
  if (r.includes("above_spot") && r.includes("support")) return "This level was invalidated by recent price action.";
  if (r.includes("below_spot") && r.includes("resistance")) return "This level was invalidated by recent price action.";
  if (r.includes("atr") && r.includes("tight")) return "The engine omitted this level because it would trigger on normal market noise.";
  if (r.includes("dcf")) return "Long-term valuation model degraded; target unavailable.";
  if (r.includes("compute_error")) return "Could not be computed reliably from the current data window.";
  if (r.includes("equal")) return "Levels too close to be meaningful. Engine suppressed.";
  return null;
}

export function omissionCopy(reason: string | undefined | null): OmissionCopy {
  if (!reason) {
    return {
      friendly: "Level not derivable from the current data window.",
      raw: "no_reason_provided",
    };
  }
  const friendly = EXACT[reason] ?? pattern(reason) ?? "This level was suppressed by the validation engine.";
  return { friendly, raw: reason };
}
