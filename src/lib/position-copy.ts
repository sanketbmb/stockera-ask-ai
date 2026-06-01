// Deterministic copy patterns for Mission 1.5 Phase 2 addendums.
// No emoji. No LLM. PDF-safe. SEBI forbidden-vocab clean.

import type { VerdictAction } from "@/types/stock-analysis";

export type PositionState =
  | "profit_review"
  | "loss_review"
  | "neutral_review"
  | "averaging";

export function fmtRupee(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtSignedPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

export function behavioralNudgeFor(state: PositionState, profitPct: number | null): string {
  if (state === "profit_review") {
    return "This decision is about your forward thesis, not the entry price you paid.";
  }
  if (state === "loss_review") {
    return "Recent losses don't define the next decision — only forward structure does.";
  }
  if (state === "neutral_review") {
    return "Neither up nor down meaningfully — let structure, not impatience, decide.";
  }
  return "Averaging works when quality is improving, not when conviction is fading.";
}

// Recommended-response copy for Loss / Neutral Review, by final verdict action.
export function lossRecommendedResponse(action: VerdictAction): string {
  if (action === "SELL" || action === "AVOID") {
    return "Disciplined response: exit and re-evaluate.";
  }
  if (action === "WATCHLIST") {
    return "Disciplined response: trim partial; hold remainder above invalidation level.";
  }
  return "Disciplined response: hold; do not act on emotion.";
}

// ─── MF / portfolio / SIP rejection guard ───
const MF_TOKENS = /(mutual\s*fund|\bmf\b|\bsip\b|portfolio|\betf\b)/i;
export function isMfOrPortfolioQuestion(text: string | null | undefined): boolean {
  if (!text) return false;
  return MF_TOKENS.test(text);
}

export const MF_REJECTION_COPY =
  "Mutual fund and portfolio-level reviews are coming soon. For now, ask about a specific stock.";
