// Elevated Analyst CTA — Phase 2. Rendered above the addendum on
// emotionally-fragile flows (profit/loss/neutral review + averaging).

import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ShieldCheck, MessageCircle } from "lucide-react";

export function AnalystCtaCard({ queryId }: { queryId: string }) {
  return (
    <section
      aria-label="SEBI analyst guidance"
      className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 px-6 py-5"
    >
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> SEBI-Registered Analyst
          </div>
          <p className="mt-1.5 font-display text-base text-foreground">
            Want a human second opinion on this position?
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            A SEBI-registered analyst will record a personalized video answer within 24 hours.
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link to="/report/$queryId" params={{ queryId }} hash="analyst-answer">
            <MessageCircle className="h-3.5 w-3.5" /> Request analyst video
          </Link>
        </Button>
      </div>
    </section>
  );
}
