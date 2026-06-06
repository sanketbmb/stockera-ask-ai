// Wave 5g Sub-track A — Honest UX hint for INSUFFICIENT_DATA on short-history
// stocks (e.g. post-demerger entities like TMCV). Surfaces a one-liner
// explanation and quick CTAs to switch horizon or jump to a sibling ticker
// with a longer history. Frontend-only; no backend changes.
//
// The "short-history" condition is detected by scanning audit_meta.source_trace
// for any module that reported INSUFFICIENT_HISTORY (technicals, risk, momentum,
// long-term-quality). When that signal is present we know the verdict is
// AVOID/INSUFFICIENT_DATA because of listing-age, not provider failure.

import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, Info } from "lucide-react";
import type { AuditMeta, QueryType } from "@/types/stock-analysis";

// Demerger / corporate-action sibling map. When the user lands on the
// short-history child, suggest the sibling that inherited the long series.
// Mirrors supabase/functions/_shared/symbol-successors.ts but kept tiny
// here so the client doesn't bundle the orchestrator module.
const SIBLING_MAP: Record<string, { symbol: string; company_name: string; reason: string }> = {
  TMCV: {
    symbol: "TMPV",
    company_name: "Tata Motors Passenger Vehicles",
    reason: "Same demerger — TMPV inherited the longer trading history.",
  },
  TMPV: {
    symbol: "TMCV",
    company_name: "Tata Motors Commercial Vehicles",
    reason: "Same demerger group.",
  },
  JIOFIN: {
    symbol: "RELIANCE",
    company_name: "Reliance Industries",
    reason: "Spun off from Reliance — parent has the longer history.",
  },
};

export function detectShortHistory(audit: AuditMeta | null | undefined): boolean {
  if (!audit?.source_trace?.length) return false;
  return audit.source_trace.some((t) => {
    const code = (t.code ?? "").toUpperCase();
    const err = (t.error ?? "").toUpperCase();
    return (
      code.includes("INSUFFICIENT_HISTORY") ||
      err.includes("INSUFFICIENT_HISTORY") ||
      code.includes("SHORT_HISTORY") ||
      err.includes("SHORT_HISTORY")
    );
  });
}

interface Props {
  symbol: string;
  companyName?: string | null;
  tier: QueryType;
  audit: AuditMeta;
}

export function ShortHistoryHint({ symbol, companyName, tier, audit }: Props) {
  const isShortHistory = detectShortHistory(audit);
  const sibling = SIBLING_MAP[symbol.toUpperCase()];

  // Horizon CTAs — only the OTHER two horizons.
  const otherHorizons: Array<{ id: QueryType; label: string }> = (
    [
      { id: "intraday", label: "Intraday" },
      { id: "medium-term", label: "Medium term" },
      { id: "long-term", label: "Long term" },
    ] as const
  ).filter((h) => h.id !== tier);

  const headline = isShortHistory
    ? `${companyName ?? symbol} doesn't have enough trading history yet for a reliable ${labelFor(tier)} verdict.`
    : `Not enough recent data to issue a reliable ${labelFor(tier)} verdict for ${companyName ?? symbol}.`;

  const subline = isShortHistory
    ? "This usually happens after a recent corporate action (demerger, spinoff, fresh listing). Try a shorter horizon — or analyse a sibling ticker that inherited the longer series."
    : "Try a different horizon, or check back once more recent data is available.";

  return (
    <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4 print:hidden">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-background p-1.5 ring-1 ring-border">
          {isShortHistory ? (
            <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
          ) : (
            <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{headline}</p>
          <p className="mt-1 text-xs text-muted-foreground">{subline}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {otherHorizons.map((h) => (
              <Link
                key={h.id}
                to="/analysis/$symbol"
                params={{ symbol }}
                search={{ horizon: h.id, news: true }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary hover:bg-primary/5 transition-colors"
              >
                Try {h.label.toLowerCase()}
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            ))}
            {sibling && (
              <Link
                to="/analysis/$symbol"
                params={{ symbol: sibling.symbol }}
                search={{ horizon: tier, news: true }}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary hover:border-primary hover:bg-primary/15 transition-colors"
              >
                Analyse {sibling.company_name} ({sibling.symbol})
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            )}
          </div>

          {sibling && isShortHistory && (
            <p className="mt-2 text-[11px] text-muted-foreground">{sibling.reason}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function labelFor(tier: QueryType): string {
  if (tier === "intraday") return "intraday";
  if (tier === "long-term") return "long-term";
  return "medium-term";
}
