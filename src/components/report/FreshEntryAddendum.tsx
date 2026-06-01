// Fresh Entry Addendum — deterministic, PDF-safe restatement of the
// trade plan in plain-language form. Reuses omissionCopy() tooltips
// for null levels, never calls itself "advice", stays in
// "Stockera Engine" framing per SEBI guardrails.

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { omissionCopy } from "@/lib/trade-plan-copy";
import type { TradeLevels, QueryType } from "@/types/stock-analysis";

const DASH = "—";

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function LevelCell({
  label, value, reason,
}: { label: string; value: number | null; reason?: string }) {
  if (value != null) {
    return (
      <div className="rounded-lg border border-border bg-card/50 px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 font-display text-base tabular-nums text-foreground">{fmtPrice(value)}</p>
      </div>
    );
  }
  const copy = omissionCopy(reason);
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="font-display text-base text-muted-foreground">{DASH}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] text-xs">
            <p>{copy.friendly}</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">Engine reason: {copy.raw}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function FreshEntryAddendum({
  levels, tier, validationReasons,
}: {
  levels: TradeLevels;
  tier: QueryType;
  validationReasons?: Partial<Record<keyof TradeLevels, string>>;
}) {
  const slClose = tier === "intraday" ? "15-min" : "daily";
  const invalidation = levels.stop_loss != null
    ? `View invalidates if a ${slClose} close prints below ${fmtPrice(levels.stop_loss)}.`
    : `Invalidation level not derivable from the current data window.`;

  return (
    <section
      aria-label="Fresh Entry Plan"
      className="rounded-2xl border border-border bg-card px-6 py-5 shadow-card"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg text-foreground">Fresh Entry Plan</h3>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Stockera Engine</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LevelCell label="Entry zone" value={levels.entry_zone} reason={validationReasons?.entry_zone} />
        <LevelCell label="Stop loss" value={levels.stop_loss} reason={validationReasons?.stop_loss} />
        <LevelCell label="Target 1" value={levels.target_1} reason={validationReasons?.target_1} />
        <LevelCell label="Target 2" value={levels.target_2} reason={validationReasons?.target_2} />
      </div>
      <p className="mt-4 text-sm text-foreground/85">{invalidation}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Reference levels are valid until structure changes — avoid revenge entries.
      </p>
    </section>
  );
}
