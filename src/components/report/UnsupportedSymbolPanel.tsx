// Wave 5f — Friendly empty-state panel rendered when the orchestrator returns
// `verdict_reason: "UNSUPPORTED_SYMBOL"` (delisted / renamed / post-corp-action /
// uncovered) OR `verdict_reason: "SYMBOL_AMBIGUOUS"` (multiple matches and
// the user needs to pick). No auto-redirect — every candidate is a one-click
// link the user explicitly chooses.

import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UnsupportedSymbolPayload, QueryType } from "@/types/stock-analysis";

interface Props {
  payload: UnsupportedSymbolPayload;
  horizon?: QueryType;
}

export function UnsupportedSymbolPanel({ payload, horizon = "medium-term" }: Props) {
  const isAmbiguous = payload.verdict_reason === "SYMBOL_AMBIGUOUS";
  const successors = payload.successor_candidates ?? [];
  const fuzzy = payload.fuzzy_candidates ?? [];
  const hasSuggestions = successors.length > 0 || fuzzy.length > 0;

  const headerEyebrow = isAmbiguous ? "Multiple matches" : "Symbol not in coverage";
  const headerTitle = isAmbiguous
    ? <>Multiple matches for <span className="text-foreground">{payload.symbol}</span></>
    : <>We couldn't analyse <span className="text-foreground">{payload.symbol}</span></>;
  const headerHint = isAmbiguous
    ? (payload.hint ?? "Pick the ticker you meant.")
    : (payload.hint ?? "This ticker is not in our coverage universe right now.");
  const HeaderIcon = isAmbiguous ? ListChecks : AlertCircle;

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-muted p-2">
            <HeaderIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="flex-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {headerEyebrow}
            </p>
            <h2 className="font-display text-2xl mt-1">{headerTitle}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{headerHint}</p>
            {!isAmbiguous && (
              <p className="mt-2 text-xs text-muted-foreground">
                This usually means the symbol was delisted, renamed, replaced after a corporate
                action (demerger, spinoff, merger), or is a very new listing that has not yet
                been indexed.
              </p>
            )}
          </div>
        </div>

        {successors.length > 0 && (
          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
              Did you mean
            </p>
            {successors[0].reason && (
              <p className="mt-1 text-xs text-muted-foreground">
                {successors[0].reason}
                {successors[0].effective_date ? ` · ${successors[0].effective_date}` : ""}
              </p>
            )}
            <ul className="mt-3 space-y-2">
              {successors.map((s) => (
                <li key={s.symbol}>
                  <CandidateButton
                    symbol={s.symbol}
                    company_name={s.company_name}
                    horizon={horizon}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {fuzzy.length > 0 && (
          <div className={`mt-${successors.length > 0 ? "4" : "6"} rounded-xl border ${isAmbiguous ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"} p-4`}>
            <p className={`font-mono text-[10px] uppercase tracking-widest ${isAmbiguous ? "text-primary" : "text-muted-foreground"}`}>
              {isAmbiguous ? "Choose a ticker" : "Similar tickers"}
            </p>
            <ul className="mt-3 space-y-2">
              {fuzzy.slice(0, 8).map((s) => (
                <li key={s.symbol}>
                  <CandidateButton
                    symbol={s.symbol}
                    company_name={s.company_name}
                    horizon={horizon}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/post-query">Post a new query</Link>
          </Button>
          {!hasSuggestions && (
            <p className="text-xs text-muted-foreground self-center">
              Try the full company name or a different ticker spelling.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CandidateButton({
  symbol,
  company_name,
  horizon,
}: {
  symbol: string;
  company_name: string | null;
  horizon: QueryType;
}) {
  const label = company_name ? `Analyze ${company_name} (${symbol})` : `Analyze ${symbol}`;
  return (
    <Link
      to="/analysis/$symbol"
      params={{ symbol }}
      search={{ horizon, news: true }}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left hover:border-primary hover:bg-primary/5 transition-colors"
    >
      <span className="min-w-0 truncate font-display text-sm text-foreground">{label}</span>
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
    </Link>
  );
}
