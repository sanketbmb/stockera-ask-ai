// Canonical orchestrator → presentation label map.
// IMPORTANT:
//   • Orchestrator JSON contract values (BUY / HOLD / SELL / WATCHLIST / AVOID)
//     are NEVER renamed at the data layer — only translated at the presentation
//     layer for the on-screen report.
//   • PDF, audit trail, source_trace, logs, analytics and error states must
//     continue to use the orchestrator literal verbatim.
import type { VerdictAction } from "@/types/stock-analysis";

const UI_LABELS: Record<VerdictAction, string> = {
  BUY: "BUY",
  HOLD: "HOLD",
  SELL: "REDUCE",
  WATCHLIST: "WATCHLIST",
  AVOID: "AVOID",
};

/** UI-only label. NEVER use in PDF, audit trail, or persisted data. */
export function verdictUILabel(action: VerdictAction): string {
  return UI_LABELS[action] ?? action;
}

/** Raw orchestrator label — for PDF, audit footer, logs, analytics. */
export function verdictRawLabel(action: VerdictAction): string {
  return action;
}

/** Title-case helper for ad-hoc strings that historically read "Buy"/"Hold". */
export function verdictTitleCase(action: VerdictAction): string {
  const raw = verdictUILabel(action);
  return raw.charAt(0) + raw.slice(1).toLowerCase();
}
