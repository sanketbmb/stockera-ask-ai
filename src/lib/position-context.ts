// Position Context Composer — Mission 1.5 Phase 2.
//
// Pure, deterministic composition over existing Brain outputs. No new LLM,
// no orchestrator math changes, no new computations beyond arithmetic.
//
// Inputs : orchestrator payload (StockAnalysisPayload) + user-supplied
//          entry_price (required) and qty (optional).
// Output : a typed PositionContext object every Phase 2 addendum reads from.

import type { StockAnalysisPayload, TradeLevels } from "@/types/stock-analysis";
import type { PositionState } from "@/lib/position-copy";

export type PartialBookingTier = 0 | 25 | 50 | 75;

export type ReEntryZoneStatus = "available" | "structural_reset_required";

export interface ReEntryZone {
  status: ReEntryZoneStatus;
  zone1?: { price: number; source: string };
  zone2?: { price: number; source: string };
  stop_loss?: number | null;
  target_1?: number | null;
  rr_from_re_entry?: number | null;
}

export interface ForwardThesisSnapshot {
  fundamentals_label: "Intact" | "Mixed" | "Deteriorating";
  momentum_label: "Strong" | "Decelerating" | "Weak";
  risk_label: string;
  sentiment_label: string;
}

export interface PositionContext {
  position_state: PositionState;
  entry_price: number;
  qty: number | null;
  current_price: number | null;
  profit_loss_pct: number | null;
  pl_per_share: number | null;
  avg_position_value: number | null;
  forward_thesis: ForwardThesisSnapshot;
  partial_booking_tier: PartialBookingTier | null;
  re_entry: ReEntryZone;
  conviction_decay_triggered: boolean;
  invalidation_price: number | null;
  invalidation_volume_note: string | null;
}

// ─── Position state resolver (deterministic ±5% band) ───
export function resolvePositionState(args: {
  query_type: "existing_position" | "averaging";
  profit_loss_pct: number | null;
}): PositionState {
  if (args.query_type === "averaging") return "averaging";
  const pct = args.profit_loss_pct;
  if (pct == null) return "neutral_review";
  if (pct >= 5) return "profit_review";
  if (pct <= -5) return "loss_review";
  return "neutral_review";
}

// ─── Forward thesis label derivation (existing Brain outputs only) ───
function deriveForwardThesis(payload: StockAnalysisPayload): ForwardThesisSnapshot {
  const fund = payload.fundamental_snapshot.valuation_label?.toUpperCase?.() ?? "";
  const lt = payload.long_term_quality_snapshot;
  const flags = payload.flags;

  let fundamentals_label: ForwardThesisSnapshot["fundamentals_label"] = "Mixed";
  if (lt?.quality_label === "HIGH_QUALITY" || lt?.quality_label === "BANKING_ADJUSTED") {
    fundamentals_label = "Intact";
  } else if (lt?.quality_label === "WEAK" || lt?.margin_trend_label === "DETERIORATING") {
    fundamentals_label = "Deteriorating";
  } else if (fund.includes("FAIR") || fund.includes("UNDERVALUED") || fund.includes("ATTRACTIVE")) {
    fundamentals_label = "Intact";
  } else if (fund.includes("OVERVALUED") || fund.includes("STRETCHED")) {
    fundamentals_label = "Mixed";
  }
  if (flags.incomplete_data && fundamentals_label === "Intact") fundamentals_label = "Mixed";

  const mom = payload.momentum_snapshot;
  let momentum_label: ForwardThesisSnapshot["momentum_label"] = "Decelerating";
  const ts = (mom.trend_strength || "").toUpperCase();
  const mlbl = (mom.momentum_label || "").toUpperCase();
  if (ts.includes("STRONG") || mlbl.includes("STRONG") || mlbl.includes("BULL")) momentum_label = "Strong";
  else if (ts.includes("WEAK") || mlbl.includes("WEAK") || mlbl.includes("BEAR")) momentum_label = "Weak";

  return {
    fundamentals_label,
    momentum_label,
    risk_label: payload.final_verdict.risk_label || payload.risk_snapshot.liquidity_label || "Moderate",
    sentiment_label: payload.sentiment_snapshot.sentiment_label || "Neutral",
  };
}

// ─── Partial booking tier (deterministic) ───
function derivePartialBookingTier(
  payload: StockAnalysisPayload,
  positionState: PositionState,
): PartialBookingTier | null {
  if (positionState !== "profit_review") return null;
  const confBand = payload.audit_meta.confidence_band ?? "";
  const current = payload.price_context.current_price;
  const r1 = payload.levels.resistance_1;
  const atr = payload.intraday_microstructure_snapshot?.atr_14 ?? null;
  const riskScore = payload.score_breakdown.risk_score;
  const trendStrength = (payload.momentum_snapshot.trend_strength || "").toUpperCase();
  const momLabel = (payload.momentum_snapshot.momentum_label || "").toUpperCase();
  const decelerating = momLabel.includes("DECEL") || momLabel.includes("WEAK") || trendStrength.includes("WEAK");

  const distToR1 = current != null && r1 != null ? r1 - current : null;
  const within = (mult: number) => distToR1 != null && atr != null && atr > 0 ? distToR1 <= mult * atr && distToR1 >= 0 : false;

  if (confBand === "High" && within(1) && decelerating && riskScore >= 50) return 75;
  if (confBand === "Moderate" || within(2) || decelerating) return 50;
  if (confBand === "Cautious" && !decelerating && trendStrength.includes("STRONG")) return 25;
  if (distToR1 == null && !decelerating) return 0;
  return 0;
}

// ─── Re-entry zone with three-honesty-check filter ───
function deriveReEntryZone(payload: StockAnalysisPayload): ReEntryZone {
  const levels: TradeLevels = payload.levels;
  const current = payload.price_context.current_price;
  if (current == null) return { status: "structural_reset_required" };

  const candidates: { price: number; source: string }[] = [];
  if (levels.support_1 != null) candidates.push({ price: levels.support_1, source: "Support 1" });
  if (levels.support_2 != null) candidates.push({ price: levels.support_2, source: "Support 2" });
  // 50-DMA / 200-DMA proxy: stop_loss method dma200_anchor stores 200DMA in SL when applicable.
  if (payload.audit_meta.targets_meta?.sl_method === "dma200_anchor" && levels.stop_loss != null) {
    candidates.push({ price: levels.stop_loss, source: "200-DMA anchor" });
  }

  // Honesty check: at least 5% below current
  const filtered = candidates.filter((c) => c.price <= current * 0.95).sort((a, b) => b.price - a.price);
  if (filtered.length === 0) return { status: "structural_reset_required" };

  // R:R check from re-entry → T1
  const t1 = levels.target_1;
  const sl = levels.stop_loss;
  const reEntry = filtered[0];
  if (t1 != null && sl != null) {
    const risk = Math.abs(reEntry.price - sl);
    const reward = Math.abs(t1 - reEntry.price);
    if (risk > 0 && reward / risk >= 1.5) {
      return {
        status: "available",
        zone1: reEntry,
        zone2: filtered[1],
        stop_loss: sl,
        target_1: t1,
        rr_from_re_entry: reward / risk,
      };
    }
  }
  return { status: "structural_reset_required" };
}

function isConvictionDecay(payload: StockAnalysisPayload, plPct: number | null): boolean {
  if (plPct == null || plPct <= 50) return false;
  const momLabel = (payload.momentum_snapshot.momentum_label || "").toUpperCase();
  const decel = momLabel.includes("DECEL") || momLabel.includes("WEAK");
  const band = payload.audit_meta.confidence_band ?? "";
  return decel && band !== "High";
}

export function composePositionContext(args: {
  payload: StockAnalysisPayload;
  entry_price: number;
  qty: number | null;
  query_type: "existing_position" | "averaging";
}): PositionContext {
  const { payload, entry_price, qty, query_type } = args;
  const current = payload.price_context.current_price;
  const plPct = current != null && entry_price > 0 ? ((current - entry_price) / entry_price) * 100 : null;
  const plPerShare = current != null ? current - entry_price : null;
  const avg_position_value = qty != null && qty > 0 ? entry_price * qty : null;
  const position_state = resolvePositionState({ query_type, profit_loss_pct: plPct });
  const forward_thesis = deriveForwardThesis(payload);
  const partial_booking_tier = derivePartialBookingTier(payload, position_state);
  const re_entry = deriveReEntryZone(payload);
  const conviction_decay_triggered = isConvictionDecay(payload, plPct);
  const volConfirm = (payload.momentum_snapshot.volume_confirmation || "").toUpperCase();
  const invalidation_volume_note = volConfirm === "STRONG_DIVERGENCE" ? " on rising volume" : null;

  return {
    position_state,
    entry_price,
    qty,
    current_price: current,
    profit_loss_pct: plPct,
    pl_per_share: plPerShare,
    avg_position_value,
    forward_thesis,
    partial_booking_tier,
    re_entry,
    conviction_decay_triggered,
    invalidation_price: payload.levels.stop_loss,
    invalidation_volume_note,
  };
}
