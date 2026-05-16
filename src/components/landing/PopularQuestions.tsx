import { ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion-helpers";

type Verdict = "HOLD" | "PARTIAL EXIT" | "WAIT" | "AVERAGE" | "EXIT" | "BUY";

const verdictStyle: Record<Verdict, string> = {
  HOLD: "bg-gold/15 text-[hsl(var(--gold-foreground))]",
  "PARTIAL EXIT": "bg-warning/15 text-[hsl(var(--gold-foreground))]",
  WAIT: "bg-muted text-muted-foreground",
  AVERAGE: "bg-accent/15 text-accent",
  EXIT: "bg-destructive/15 text-destructive",
  BUY: "bg-success/15 text-success",
};

const questions: Array<{ ticker: string; q: string; verdict: Verdict; expert: string }> = [
  { ticker: "IDFCFIRSTB", q: "Bought at ₹85, now ₹67 — average or sell?", verdict: "HOLD", expert: "Mayank S." },
  { ticker: "TATAMOTORS", q: "Long term bet or should I exit after EV concerns?", verdict: "HOLD", expert: "Priya D." },
  { ticker: "IRFC", q: "50% up from my buy price. Book profits or stay?", verdict: "PARTIAL EXIT", expert: "Arjun M." },
  { ticker: "ZOMATO", q: "Fresh entry at ₹220 — good idea?", verdict: "WAIT", expert: "Sneha K." },
  { ticker: "RELIANCE", q: "Stuck at ₹2,800 cost — market keeps falling", verdict: "AVERAGE", expert: "Mayank S." },
  { ticker: "INFY", q: "IT sector weak. Should I exit my long-term position?", verdict: "HOLD", expert: "Priya D." },
];

export function PopularQuestions() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl text-foreground sm:text-4xl">
            Questions Like Yours — <span className="text-gradient">Answered</span>
          </h2>
          <p className="mt-3 text-muted-foreground">Real queries from real investors. Real verdicts from SEBI-registered experts.</p>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {questions.map((q, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <div className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-primary">
                    {q.ticker}
                  </span>
                  <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", verdictStyle[q.verdict])}>
                    {q.verdict}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-foreground">"{q.q}"</p>

                <div className="mt-auto flex items-center justify-between pt-4">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-gradient-brand text-[10px] text-white">
                        {q.expert.split(" ").map((s) => s[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">Answered by {q.expert}</span>
                  </div>
                  <a className="inline-flex items-center gap-1 text-xs font-semibold text-accent group-hover:underline" href="#">
                    See Full Answer <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
