// Phase 3C — Graceful fallback when the concept can't be resolved against the
// approved learning library. No fabricated content; offers closest supported
// concepts and preserves the query record.

import { Link } from "@tanstack/react-router";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { SUPPORTED_CONCEPTS } from "@/content/educational-glossary";

export function ConceptNotFoundPanel({
  rawQuestion,
  suggestions,
}: {
  rawQuestion: string;
  suggestions: string[];
}) {
  const list = suggestions.length > 0 ? suggestions : SUPPORTED_CONCEPTS.slice(0, 5);
  return (
    <div className="min-h-screen bg-mesh">
      <Navbar />
      <main className="px-4 sm:px-6 lg:px-8 py-10">
        <div className="mx-auto max-w-2xl space-y-6">
          <section className="rounded-2xl border border-border bg-card px-6 py-5 shadow-card">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Your question
            </p>
            <blockquote className="mt-2 font-serif italic text-lg text-foreground">
              &ldquo;{rawQuestion}&rdquo;
            </blockquote>
            <p className="mt-3 text-xs text-muted-foreground italic">
              Interpreted as:{" "}
              <span className="font-medium not-italic text-foreground/80">Educational</span>
              {" · "}
              <span className="not-italic">concept unresolved</span>
            </p>
          </section>

          <section className="rounded-2xl border border-primary/30 bg-primary/5 px-6 py-5">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Concept not found in current learning library
            </p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              We didn't recognise this as a concept we cover yet. Try one of these instead:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {list.map((name) => (
                <Button key={name} asChild size="sm" variant="outline" className="text-xs">
                  <Link to="/post-query">{name}</Link>
                </Button>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground italic">
              Try a concept like RSI, MACD, DCF, Beta, or Piotroski F-Score.
            </p>
          </section>

          <Button asChild className="gap-2">
            <Link to="/post-query">
              Ask another question <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
