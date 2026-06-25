import { Link } from "@tanstack/react-router";
import { ArrowRight, TrendingDown, TrendingUp, HelpCircle, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/landing/motion-helpers";
import { FIRM } from "@/lib/firm-details";

type Problem = {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  icon: LucideIcon;
  iconClass: string;
};

const PROBLEMS: Problem[] = [
  {
    eyebrow: "PROBLEM 01",
    title: "You're down on a stock. Average, hold, or exit?",
    body: "Post the symbol, your buy price and quantity. Our AI returns the technical view, fundamental view, key zones, and a verdict — HOLD / AVERAGE / EXIT / PARTIAL EXIT / WAIT — with educational reasoning. Escalate to a SEBI-registered analyst when you want a second opinion.",
    cta: "Bring me my report",
    icon: TrendingDown,
    iconClass: "text-rose-500",
  },
  {
    eyebrow: "PROBLEM 02",
    title: "In profit. Book, hold, partial exit, or trail?",
    body: "We frame trend strength, risk of reversal, partial-exit and trailing-stop logic — in plain language. Verdict included. Educational, never advisory.",
    cta: "Get the framework",
    icon: TrendingUp,
    iconClass: "text-emerald-500",
  },
  {
    eyebrow: "PROBLEM 03",
    title: "Heard a tip. Should you actually buy?",
    body: "We give you the bull case, the bear case, price zones, risk frame, and a verdict — BUY / WATCHLIST / WAIT / AVOID / REDUCE — with the reasoning that got us there.",
    cta: "Pressure-test the idea",
    icon: HelpCircle,
    iconClass: "text-accent",
  },
];

export function ProblemsWeSolve() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl text-foreground sm:text-4xl">
            Three moments every Indian investor knows.
          </h2>
          <p className="mt-3 text-muted-foreground">And what we'd actually do in each one.</p>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PROBLEMS.map((p, i) => {
            const Icon = p.icon;
            return (
              <Reveal key={p.eyebrow} delay={i * 0.06}>
                <Card className="group flex h-full flex-col gap-4 p-6 transition-transform duration-300 ease-out hover:-translate-y-1">
                  <div className="flex items-center justify-between">
                    <span className="pws-chip font-mono text-[10px] uppercase tracking-widest text-accent">
                      {p.eyebrow}
                    </span>
                    <Icon className={`h-5 w-5 ${p.iconClass}`} aria-hidden />
                  </div>
                  <h3 className="font-display text-xl text-foreground">{p.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                  <div className="mt-auto pt-2">
                    <Link
                      to="/post-query"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
                    >
                      {p.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                </Card>
              </Reveal>
            );
          })}
        </div>

        <p className="mt-10 text-center text-[11px] text-muted-foreground">
          {`${FIRM.legalName} · SEBI Research Analyst ${FIRM.sebiRegNumber}. Educational analysis. Not investment advice.`}
        </p>
      </div>

      <style>{`
        @keyframes pws-chip-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.7; }
        }
        .pws-chip { animation: pws-chip-pulse 3.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .pws-chip { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
