// Credit Metering — single source of truth.
//
// Every report-generating code path MUST go through `meteringFor()`. In
// "noop_dev_mode" no credits are deducted but the zero-charge posture is
// explicit, centralized, and SEBI-defensibly logged on every artifact.
//
// Phase 2 (Mission 1.5) — extends the deterministic action map for the new
// Existing Position + Averaging Decision paths.
// Phase 3B — adds the Sector View path. No behavioral change.

export const METERING_MODE = "noop_dev_mode" as const;
export type MeteringMode = typeof METERING_MODE | "tiered_v1";

export type ReportPath =
  | "post_query_fresh_entry"
  | "post_query_existing_position"
  | "post_query_averaging"
  | "post_query_sector_view"
  | "analysis_direct"
  | "legacy_regenerate";

export type CreditAction =
  | "noop_dev_mode"
  | "noop_dev_mode_direct"
  | "noop_dev_mode_legacy_regenerate"
  | "noop_dev_mode_existing_position"
  | "noop_dev_mode_averaging"
  | "noop_dev_mode_sector_view";

export interface MeteringDecision {
  metering_mode: MeteringMode;
  credit_action: CreditAction;
  amount_debited_paise: 0;
  rpc_called: null;
}

const ACTION_BY_PATH: Record<ReportPath, CreditAction> = {
  post_query_fresh_entry: "noop_dev_mode",
  post_query_existing_position: "noop_dev_mode_existing_position",
  post_query_averaging: "noop_dev_mode_averaging",
  post_query_sector_view: "noop_dev_mode_sector_view",
  analysis_direct: "noop_dev_mode_direct",
  legacy_regenerate: "noop_dev_mode_legacy_regenerate",
};

export function meteringFor(path: ReportPath): MeteringDecision {
  return {
    metering_mode: METERING_MODE,
    credit_action: ACTION_BY_PATH[path],
    amount_debited_paise: 0,
    rpc_called: null,
  };
}
