// Phase 3A — graceful surface for queries the free-text router classified
// as "other". Phase 3B removed sector_view (its own report variant);
// Phase 3C removed educational (its own report variant). This panel now
// only handles "other".

import { Link } from "@tanstack/react-router";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import type { RouterOutput } from "@/lib/intent-router-schema";

const TYPE_LABEL: Record<string, string> = {
  other: "Custom Question",
  fresh_entry: "Fresh Entry",
  existing_position: "Sell or Hold",
  averaging_decision: "Should I Average",
};

function bandLabel(score: number): string {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

export function RoutedPendingPanel({
  rawQuestion,
  routerMeta,
}: {
  rawQuestion: string;
  routerMeta: RouterOutput | null;
}) {
  const interpreted = routerMeta?.interpreted_type ?? "other";
  const label = TYPE_LABEL[interpreted] ?? "Custom Question";

  return (
    <div className="min-h-screen bg-mesh">
      <Navbar />
      <main className="px-4 sm:px-6 lg:px-8 py-10 print:py-0">
        <div className="mx-auto max-w-2xl space-y-6">
          <section
            aria-label="Your question, preserved verbatim"
            className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 px-6 py-5 shadow-card"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Your question
            </p>
            <blockquote className="mt-2 font-serif italic text-lg leading-relaxed text-foreground">
              &ldquo;{rawQuestion}&rdquo;
            </blockquote>
            {routerMeta && (
              <p className="mt-3 text-xs text-muted-foreground italic">
                Interpreted as:{" "}
                <span className="font-medium not-italic text-foreground/80">{label}</span>
                {" · "}
                <span className="not-italic">
                  confidence: {bandLabel(routerMeta.confidence_score)}
                </span>
                {routerMeta.symbol && (
                  <>
                    {" · "}
                    <span className="font-mono not-italic text-foreground/80">
                      {routerMeta.symbol}
                    </span>
                  </>
                )}
                {routerMeta.sector && !routerMeta.symbol && (
                  <>
                    {" · "}
                    <span className="not-italic">{routerMeta.sector}</span>
                  </>
                )}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-primary/30 bg-primary/5 px-6 py-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Routed to a SEBI analyst</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              We couldn&rsquo;t fit this question into the live AI report types yet, so it&rsquo;s queued for a SEBI Research Analyst. You&rsquo;ll be notified when the response is ready.
            </p>
            {routerMeta?.clarification_needed && (
              <p className="mt-3 text-xs text-muted-foreground italic">
                The analyst may reach out for a quick clarification before answering.
              </p>
            )}
          </section>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild className="gap-2">
              <Link to="/post-query">
                Post another question <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/my-queries">View my queries</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
