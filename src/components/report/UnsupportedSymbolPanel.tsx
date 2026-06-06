// Wave 5f — Friendly empty-state panel rendered when the orchestrator returns
// `verdict_reason: "UNSUPPORTED_SYMBOL"`. Replaces the red "Couldn't load
// this report" error block for symbols that have been delisted, renamed,
// replaced post-corporate-action, or are too new to be in our coverage
// universe. No auto-redirect — successors are surfaced as one-click links.

import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UnsupportedSymbolPayload, QueryType } from "@/types/stock-analysis";

interface Props {
  payload: UnsupportedSymbolPayload;
  horizon?: QueryType;
}

export function UnsupportedSymbolPanel({ payload, horizon = "medium-term" }: Props) {
  const successors = payload.successor_candidates ?? [];
  const fuzzy = payload.fuzzy_candidates ?? [];
  const hasSuggestions = successors.length > 0 || fuzzy.length > 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-muted p-2">
            <AlertCircle className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="flex-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Symbol not in coverage
            </p>
            <h2 className="font-display text-2xl mt-1">
              We couldn't analyse <span className="text-foreground">{payload.symbol}</span>
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {payload.hint ?? "This ticker is not in our coverage universe right now."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              This usually means the symbol was delisted, renamed, replaced after a corporate
              action (demerger, spinoff, merger), or is a very new listing that has not yet
              been indexed.
            </p>
          </div>
        </div>

        {successors.length > 0 && (
          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
              Did you mean
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {successors[0].reason
                ? `${successors[0].reason}${successors[0].effective_date ? ` · ${successors[0].effective_date}` : ""}`
                : "Possible successor symbol"}
            </p>
            <ul className="mt-3 space-y-2">
              {successors.map((s) => (
                <li key={s.symbol}>
                  <Link
                    to="/analysis/$symbol"
                    params={{ symbol: s.symbol }}
                    search={{ horizon, news: true }}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-display text-sm text-foreground">{s.symbol}</p>
                      {s.company_name && (
                        <p className="truncate text-xs text-muted-foreground">{s.company_name}</p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {fuzzy.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Similar tickers
            </p>
            <ul className="mt-3 space-y-2">
              {fuzzy.slice(0, 5).map((s) => (
                <li key={s.symbol}>
                  <Link
                    to="/analysis/$symbol"
                    params={{ symbol: s.symbol }}
                    search={{ horizon, news: true }}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-display text-sm text-foreground">{s.symbol}</p>
                      {s.company_name && (
                        <p className="truncate text-xs text-muted-foreground">{s.company_name}</p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                  </Link>
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
