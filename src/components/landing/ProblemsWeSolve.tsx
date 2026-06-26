import { Link } from "@tanstack/react-router";
import { ArrowRight, TrendingDown, TrendingUp, HelpCircle, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/landing/motion-helpers";
import { FIRM } from "@/lib/firm-details";

type Problem = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  icon: LucideIcon;
  iconClass: string;
};

const PROBLEMS: Problem[] = [
  {
    id: "item-1",
    eyebrow: "PROBLEM 01",
    title: "You're down on a stock. Average, hold, or exit?",
    body: "Post the symbol, your buy price and quantity. Our AI returns the technical view, fundamental view, key zones, and a verdict — HOLD / AVERAGE / EXIT / PARTIAL EXIT / WAIT — with educational reasoning. Escalate to a SEBI-registered analyst when you want a second opinion.",
    cta: "Bring me my report",
    icon: TrendingDown,
    iconClass: "text-rose-500",
  },
  {
    id: "item-2",
    eyebrow: "PROBLEM 02",
    title: "In profit. Book, hold, partial exit, or trail?",
    body: "We frame trend strength, risk of reversal, partial-exit and trailing-stop logic — in plain language. Verdict included. Educational, never advisory.",
    cta: "Get the framework",
    icon: TrendingUp,
    iconClass: "text-emerald-500",
  },
  {
    id: "item-3",
    eyebrow: "PROBLEM 03",
    title: "Heard a tip. Should you actually buy?",
    body: "We give you the bull case, the bear case, price zones, risk frame, and a verdict — BUY / WATCHLIST / WAIT / AVOID / REDUCE — with the reasoning that got us there.",
    cta: "Pressure-test the idea",
    icon: HelpCircle,
    iconClass: "text-accent",
  },
];

const VERDICT_TONE: Record<string, string> = {
  BUY: "border-primary/40 text-primary",
  WATCHLIST: "border-primary/40 text-primary",
  HOLD: "border-border text-muted-foreground",
  WAIT: "border-border text-muted-foreground",
  AVERAGE: "border-warning/40 text-warning",
  "PARTIAL EXIT": "border-warning/40 text-warning",
  REDUCE: "border-warning/40 text-warning",
  EXIT: "border-destructive/40 text-destructive",
  AVOID: "border-destructive/40 text-destructive",
};

// Longer phrases first so "PARTIAL EXIT" beats "EXIT".
const VERDICT_RE =
  /(PARTIAL EXIT|WATCHLIST|AVERAGE|REDUCE|AVOID|HOLD|EXIT|WAIT|BUY)/g;

function renderBody(text: string) {
  const parts = text.split(VERDICT_RE);
  return parts.map((part, i) => {
    const tone = VERDICT_TONE[part];
    if (tone) {
      return (
        <span
          key={i}
          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${tone}`}
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function ProblemHeader({ p }: { p: Problem }) {
  const Icon = p.icon;
  return (
    <div className="flex w-full items-start justify-between gap-3 text-left">
      <div className="min-w-0 flex-1">
        <span className="pws-chip font-mono text-[10px] uppercase tracking-widest text-accent">
          {p.eyebrow}
        </span>
        <h3 className="mt-2 font-display text-xl text-foreground">{p.title}</h3>
      </div>
      <Icon className={`mt-1 h-5 w-5 shrink-0 ${p.iconClass}`} aria-hidden />
    </div>
  );
}

export function ProblemsWeSolve() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl text-foreground sm:text-4xl">
            <span className="text-foreground">Three moments every Indian investor</span>{" "}
            <span className="text-primary">knows.</span>
          </h2>
          <p className="mt-3 text-muted-foreground">And what we'd actually do in each one.</p>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEMS.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.05}>
              <Card className="flex h-full flex-col gap-4 p-6">
                <ProblemHeader p={p} />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {renderBody(p.body)}
                </p>
                <Link
                  to="/post-query"
                  className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
                >
                  {p.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Card>
            </Reveal>
          ))}
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
