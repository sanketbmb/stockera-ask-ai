import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, LineChart, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/motion-helpers";

export function StockRecommenderTeaser() {
  return (
    <section
      className="py-20"
      style={{ backgroundColor: "hsl(var(--surface-warm))" }}
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 md:grid-cols-2 md:items-center">
        <Reveal>
          <div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              DON'T KNOW WHERE TO START?
            </span>
            <h2 className="mt-3 font-display text-3xl text-foreground sm:text-4xl">
              Tell us your risk appetite. We'll show you{" "}
              <span
                className="text-gradient animate-gradient-text"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #2BA8A0, #1F3C73, #F5B731, #2BA8A0)",
                }}
              >
                stocks worth a closer look
              </span>
              .
            </h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              The Stock Picker runs a multi-factor scan — technical, fundamental, sector — across NSE-listed names. You set risk (conservative, moderate, aggressive, high risk) and the count. We return picks with target zones, stop-loss zones, support/resistance and a scoreboard. Educational. You decide what to do.
            </p>

            <ul className="mt-6 space-y-2 text-sm text-foreground">
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
                SEBI-registered Research Analyst framework
              </li>
              <li className="flex items-center gap-2">
                <LineChart className="h-4 w-4 text-accent" aria-hidden />
                Multi-factor: technical + fundamental + sector
              </li>
              <li className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-accent" aria-hidden />
                Transparent reasoning per pick
              </li>
            </ul>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                asChild
                className="relative overflow-hidden group rounded-full transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(43,168,160,0.4)]"
              >
                <Link to="/stock-picker">
                  <span
                    className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
                    aria-hidden="true"
                  />
                  See stock picks <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full transition-colors duration-200 hover:border-accent">
                <Link to="/post-query">Ask a custom question</Link>
              </Button>
            </div>

          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div>
            <div className="relative rounded-xl border border-border/60 overflow-hidden bg-card shadow-md transition-shadow duration-200 hover:shadow-card-hover">
              <span
                className="absolute -top-2 -right-2 z-10 px-2 py-1 rounded-full text-[10px] font-bold text-white animate-pulse"
                style={{ background: "var(--gradient-brand)" }}
              >
                LIVE
              </span>
              <img
                src="/images/hero-report-preview.webp"
                width={1262}
                height={832}
                alt="Sample stock report showing our structured analysis layout — company name, composite score, fundamentals, and data freshness checks."
                loading="lazy"
                decoding="async"
                className="block w-full h-auto"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Sample report — your personalized report shows your stock, your buy price, your question.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
