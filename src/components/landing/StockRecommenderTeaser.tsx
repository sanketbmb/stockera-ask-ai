import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, LineChart, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/motion-helpers";

type Row = { label: string; scale: number };

const ROWS: Row[] = [
  { label: "Composite score", scale: 0.78 },
  { label: "Technical", scale: 0.82 },
  { label: "Fundamental", scale: 0.71 },
  { label: "Sector momentum", scale: 0.64 },
];

export function StockRecommenderTeaser() {
  const barRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      ROWS.forEach((row, i) => {
        const node = barRefs.current[i];
        if (node) node.style.transform = `scaleX(${row.scale})`;
      });
    });
    return () => cancelAnimationFrame(id);
  }, []);

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
              Tell us your risk appetite. We'll show you stocks worth a closer look.
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
              <Button asChild className="rounded-full">
                <Link to="/stock-picker">
                  See stock picks <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/post-query">Ask a custom question</Link>
              </Button>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <Card className="p-6">
            <div className="space-y-4">
              {ROWS.map((row, i) => (
                <div key={row.label}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{row.label}</span>
                    <span className="font-mono text-muted-foreground">
                      {Math.round(row.scale * 100)}
                    </span>
                  </div>
                  <div className="bg-muted h-2 rounded-full overflow-hidden">
                    <div
                      ref={(el) => {
                        barRefs.current[i] = el;
                      }}
                      className="srt-bar bg-accent h-full origin-left"
                      style={{ transform: "scaleX(0)" }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[10px] text-muted-foreground">
              Illustration. Real picks shown after you set your risk on the Stock Picker.
            </p>
          </Card>
        </Reveal>
      </div>

      <style>{`
        .srt-bar {
          transition: transform 900ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .srt-bar { transition: none !important; }
        }
      `}</style>
    </section>
  );
}
