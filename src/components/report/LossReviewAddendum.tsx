// Phase 2 — Loss Review / Neutral Review Plan. Forward-thesis only, never
// a backward-looking entry critique.

import type { PositionContext } from "@/lib/position-context";
import type { StockAnalysisPayload, QueryType } from "@/types/stock-analysis";
import { fmtRupee, fmtSignedPct, behavioralNudgeFor, lossRecommendedResponse } from "@/lib/position-copy";

export function LossReviewAddendum({
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

  const isNeutral = ctx.position_state === "neutral_review";
  const headerLine = isNeutral
    ? `Entry ${fmtRupee(ctx.entry_price)} → Current ${fmtRupee(ctx.current_price)} (~flat). The decision rests on forward structure, not the entry price.`
    : `Entry ${fmtRupee(ctx.entry_price)} → Current ${fmtRupee(ctx.current_price)} (${fmtSignedPct(ctx.profit_loss_pct ?? 0)}). Unrealized loss of ${fmtRupee(Math.abs(ctx.pl_per_share ?? 0))} per share.`;

  const recommended = lossRecommendedResponse(payload.final_verdict.action);

  return (
    <section aria-label="Position Review Plan" className={`rounded-2xl border px-6 py-5 shadow-card space-y-4 ${isNeutral ? "border-border bg-card" : "border-amber-500/30 bg-card"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg text-foreground">Position Review Plan</h3>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Stockera Engine</p>
      </div>

      <p className="text-sm text-foreground/85">{headerLine}</p>

      <p className="text-sm text-foreground/85">
        Forward thesis: fundamentals <strong>{ctx.forward_thesis.fundamentals_label}</strong>,
        momentum <strong>{ctx.forward_thesis.momentum_label}</strong>,
        risk <strong>{ctx.forward_thesis.risk_label}</strong>,
        sentiment <strong>{ctx.forward_thesis.sentiment_label}</strong>.
      </p>

      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Disciplined response</p>
        <p className="mt-1 text-sm text-foreground">{recommended}</p>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Re-entry zone</p>
        {ctx.re_entry.status === "available" && ctx.re_entry.zone1 ? (
          <p className="mt-1 text-sm text-foreground">
            Watch for re-entry around {fmtRupee(ctx.re_entry.zone1.price)} ({ctx.re_entry.zone1.source})
            {ctx.re_entry.zone2 ? <> or {fmtRupee(ctx.re_entry.zone2.price)} ({ctx.re_entry.zone2.source})</> : null},
            with stop loss at {fmtRupee(ctx.re_entry.stop_loss)} and target {fmtRupee(ctx.re_entry.target_1)} over {tier.replace("-", " ")}.
          </p>
        ) : (
          <p className="mt-1 text-sm text-foreground">Re-entry zone is not justified at current prices. Wait for a structural reset.</p>
        )}
      </div>

      <p className="text-sm font-medium text-foreground">{invalidation}</p>
      <p className="text-xs italic text-muted-foreground">{behavioralNudgeFor(ctx.position_state, ctx.profit_loss_pct)}</p>
    </section>
  );
}
