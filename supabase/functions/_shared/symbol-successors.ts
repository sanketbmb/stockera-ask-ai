// Wave 5f Problem 1 — Successor / alias map for tickers removed from the
// live Dhan instrument master via corporate actions (demerger, spinoff,
// rename, DVR collapse, etc.).
//
// Data-only; no scoring, no new pillars. Consumed by the orchestrator's
// resolveStock() when a user-typed symbol has no row in stock_master.
// The orchestrator returns a structured UNSUPPORTED_SYMBOL payload that
// includes these successors as one-click suggestions in the friendly
// empty-state panel. No auto-redirect — the user picks.
//
// To add an entry:
//   1) Confirm the successor symbols exist in stock_master (NSE row).
//   2) Add the mapping below with the effective_date (ISO).
//   3) Do NOT ship an empty-successors entry to production — list the
//      ticker in the TO_VERIFY block instead until the successor is known.

export interface SymbolSuccessorEntry {
  successors: string[];
  reason: string;
  effective_date: string; // ISO YYYY-MM-DD
}

export const SUCCESSOR_MAP: Record<string, SymbolSuccessorEntry> = {
  TATAMOTORS: {
    successors: ["TMPV", "TMCV"],
    reason: "Demerger into Passenger Vehicles + Commercial Vehicles",
    effective_date: "2025-10-01",
  },
  TATAMTRDVR: {
    successors: ["TMPV", "TMCV"],
    reason: "DVR shares collapsed + parent demerger",
    effective_date: "2025-10-01",
  },
  RELIANCEJF: {
    successors: ["JIOFIN"],
    reason: "Spinoff of Jio Financial Services from Reliance Industries",
    effective_date: "2023-08-21",
  },
  TMLCV: {
    successors: ["TMCV"],
    reason: "Ticker alias normalization (TMLCV → TMCV in Dhan master)",
    effective_date: "2025-10-01",
  },
};

// TO VERIFY — confirm the actual successor symbol before adding to the
// production map above. Do NOT add empty-successors entries.
// - PIRAMALENT (Piramal Enterprises rename/merger — verify current ticker)

export function lookupSuccessor(symbol: string): SymbolSuccessorEntry | null {
  if (!symbol) return null;
  const key = symbol.toUpperCase().trim();
  return SUCCESSOR_MAP[key] ?? null;
}
