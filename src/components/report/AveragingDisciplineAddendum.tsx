// Phase 2 — Averaging Discipline addendum. Honest framing, deterministic guard.

import type { PositionContext } from "@/lib/position-context";
import type { StockAnalysisPayload, QueryType } from "@/types/stock-analysis";
import { fmtRupee, behavioralNudgeFor } from "@/lib/position-copy";

export function AveragingDisciplineAddendum({
  ctx, payload, tier,
}: {
  ctx: PositionContext;
  payload: StockAnalysisPayload;
  tier: QueryType;
}) {
  const slClose = tier === "intraday" ? "15-min" : "daily";
  const inv = ctx.invalidation_price;
  const invalidation = inv != null
    ? `View invalidates if a ${slClose} close prints below ${fmtRupee(inv)}.`
    : `Invalidation level not derivable from the current data window.`;

  const fundImproving = ctx.forward_thesis.fundamentals_label === "Intact";
  const riskScore = payload.score_breakdown.risk_score;
  const sentScore = payload.score_breakdown.sentiment_score;
  const greenLight = fundImproving && riskScore >= 55 && sentScore >= 50;
  const support = payload.levels.support_1;

  const recommendation = greenLight && support != null
    ? `Cautiously add only if a confirmed structural retest holds at ${fmtRupee(support)}.`
    : `Discipline says: do not average down. Wait for structure or thesis to improve before adding.`;

  return (
    <section aria-label="Averaging Discipline" className="rounded-2xl border border-border bg-card px-6 py-5 shadow-card space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg text-foreground">Averaging Discipline</h3>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Stockera Engine</p>
      </div>

      <p className="text-sm text-foreground/85">Averaging works when quality is improving — not when conviction is fading.</p>

      <p className="text-sm text-foreground/85">
        Quality {ctx.forward_thesis.fundamentals_label.toLowerCase()},
        risk {ctx.forward_thesis.risk_label.toLowerCase()},
        sentiment {ctx.forward_thesis.sentiment_label.toLowerCase()}.
        Composite risk score: <strong>{riskScore}</strong>/100.
      </p>

      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Recommendation</p>
        <p className="mt-1 text-sm text-foreground">{recommendation}</p>
      </div>

      {ctx.avg_position_value != null && (
        <p className="text-sm text-foreground/85">
          Average position size: {fmtRupee(ctx.avg_position_value)}. Adding more would commit
          additional capital to a setup with <strong>{ctx.forward_thesis.risk_label.toLowerCase()}</strong> risk profile.
        </p>
      )}

      <p className="text-sm font-medium text-foreground">{invalidation}</p>
      <p className="text-xs italic text-muted-foreground">{behavioralNudgeFor("averaging", ctx.profit_loss_pct)}</p>
    </section>
  );
}
