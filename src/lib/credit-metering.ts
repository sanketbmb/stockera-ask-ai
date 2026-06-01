// Credit Metering — single source of truth for Phase 1.1.
//
// Every report-generating code path MUST go through `meteringFor()` instead of
// calling a wallet RPC directly. In Phase 1.1 the mode is "noop_dev_mode": no
// credits are ever deducted, but the zero-charge posture is now explicit,
// centralized, and SEBI-defensibly logged on every artifact.
//
// To flip on monetization later, only this module changes — call sites stay put.

export const METERING_MODE = "noop_dev_mode" as const;
export type MeteringMode = typeof METERING_MODE | "tiered_v1";

export type ReportPath =
  | "post_query_fresh_entry"
  | "analysis_direct"
  | "legacy_regenerate";

export type CreditAction =
  | "noop_dev_mode"
  | "noop_dev_mode_direct"
  | "noop_dev_mode_legacy_regenerate";

export interface MeteringDecision {
  metering_mode: MeteringMode;
  credit_action: CreditAction;
  amount_debited_paise: 0;
  rpc_called: null;
}

const ACTION_BY_PATH: Record<ReportPath, CreditAction> = {
  post_query_fresh_entry: "noop_dev_mode",
  analysis_direct: "noop_dev_mode_direct",
  legacy_regenerate: "noop_dev_mode_legacy_regenerate",
};

/**
 * Returns the deterministic metering decision for a given report path.
 * In "noop_dev_mode" no wallet call happens; the decision is recorded into
 * `audit_meta` so reports remain defensible.
 */
export function meteringFor(path: ReportPath): MeteringDecision {
  return {
    metering_mode: METERING_MODE,
    credit_action: ACTION_BY_PATH[path],
    amount_debited_paise: 0,
    rpc_called: null,
  };
}
