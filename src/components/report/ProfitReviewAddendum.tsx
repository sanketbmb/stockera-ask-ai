// Phase 2 — Profit Review Plan. Pure presentation of position-context.
// All numbers come from Brain outputs; no invented values.

import type { PositionContext } from "@/lib/position-context";
import type { StockAnalysisPayload, QueryType } from "@/types/stock-analysis";
import { fmtRupee, fmtSignedPct, behavioralNudgeFor } from "@/lib/position-copy";

function fmtNum(n: number | null | undefined, d = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

export function ProfitReviewAddendum({
  ctx, payload, tier,
}: {
  ctx: PositionContext;
  payload: StockAnalysisPayload;
  tier: QueryType;
}) {
  const slClose = tier === "intraday" ? "15-min" : "daily";
  const atr = payload.intraday_microstructure_snapshot?.atr_14 ?? null;
  const r1 = payload.levels.resistance_1;
  const distance = ctx.current_price != null && r1 != null ? r1 - ctx.current_price : null;
  const atrDist = distance != null && atr && atr > 0 ? distance / atr : null;

  const bookingCopy = (() => {
    const t = ctx.partial_booking_tier;
    if (t === 75) return "Book 75% — structure favours aggressive profit-taking near resistance with decelerating momentum.";
    if (t === 50) return "Book 50% — partial profit-taking is warranted; preserve the remainder with a trailing stop.";
    if (t === 25) return "Book 25% — light trim only; structure still constructive.";
    return "Hold the full position — no resistance pressure and momentum + structure remain intact.";
  })();

  const inv = ctx.invalidation_price;
  const invalidation = inv != null
    ? `View invalidates if a ${slClose} close prints below ${fmtRupee(inv)}${ctx.invalidation_volume_note ?? ""}.`
    : `Invalidation level not derivable from the current data window.`;

  return (
    <section aria-label="Profit Review Plan" className="rounded-2xl border border-emerald-500/30 bg-card px-6 py-5 shadow-card space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg text-foreground">Profit Review Plan</h3>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Stockera Engine</p>
      </div>

      <p className="text-sm text-foreground/85">
        Entry {fmtRupee(ctx.entry_price)} → Current {fmtRupee(ctx.current_price)}{" "}
        ({fmtSignedPct(ctx.profit_loss_pct ?? 0)}). Unrealized gain of {fmtRupee(ctx.pl_per_share)} per share.
      </p>

      {r1 != null && ctx.current_price != null && (
        <p className="text-sm text-foreground/85">
          Current price sits {atrDist != null ? `${fmtNum(atrDist, 2)}× ATR` : `${fmtRupee(distance)}`} from nearest resistance at {fmtRupee(r1)}.
        </p>
      )}

      <p className="text-sm text-foreground/85">
        Long-term fundamentals: <strong>{ctx.forward_thesis.fundamentals_label}</strong>.{" "}
        Momentum: <strong>{ctx.forward_thesis.momentum_label}</strong>.
      </p>

      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Disciplined response</p>
        <p className="mt-1 text-sm text-foreground">{bookingCopy}</p>
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

      {ctx.conviction_decay_triggered && (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Long-running winners deserve fresh evaluation, not autopilot. Reassess thesis quarterly.
        </p>
      )}

      <p className="text-sm font-medium text-foreground">{invalidation}</p>
      <p className="text-xs italic text-muted-foreground">{behavioralNudgeFor("profit_review", ctx.profit_loss_pct)}</p>
    </section>
  );
}
