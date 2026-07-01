import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";

const questions = [
  { stock: "Dixon Tech", question: "Down 12%. Hold or book loss?", type: "stuck" as const },
  { stock: "Tata Motors", question: "Good time to buy for long term?", type: "buy" as const },
  { stock: "IRFC", question: "Not moving. Exit and redeploy?", type: "stuck" as const },
  { stock: "Zomato", question: "Can I average down from ₹200?", type: "stuck" as const },
  { stock: "Reliance", question: "Current dip a buying opportunity?", type: "buy" as const },
  { stock: "Suzlon", question: "Multibagger or value trap?", type: "buy" as const },
  { stock: "HDFC Bank", question: "Stuck 2 years. Shift to IT?", type: "stuck" as const },
  { stock: "Infosys", question: "Earnings miss. Panic sell?", type: "stuck" as const },
  { stock: "Adani Ports", question: "Safe to enter for swing trade?", type: "buy" as const },
  { stock: "ITC", question: "Demerger unlock value?", type: "buy" as const },
  { stock: "IREDA", question: "40% up. Book profit or hold?", type: "stuck" as const },
  { stock: "Tata Steel", question: "Steel cycle turning?", type: "buy" as const },
];

export function TrendingQueriesStrip() {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);

  return (
    <div
      className="relative overflow-hidden py-3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <style>{`
        @keyframes trending-marquee {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
        .trending-marquee-track {
          animation: trending-marquee 42s linear infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .trending-marquee-track { animation: none; }
        }
      `}</style>

      <p className="text-center text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-semibold">
        Trending Queries from Investors
      </p>

      {/* Edge fade masks — kills the hard cut-in at strip edges */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent"
      />

      <div
        className={reduced ? "flex w-max gap-2.5" : "trending-marquee-track flex w-max gap-2.5"}
        style={{ animationPlayState: paused && !reduced ? "paused" : "running" }}
      >
        {[...questions, ...questions].map((q, i) => (
          <div
            key={i}
            className="min-w-[220px] flex items-center gap-2 px-3 py-2 rounded-xl bg-card/70 backdrop-blur-sm border border-border/60 text-xs transition-colors hover:border-accent/50 hover:bg-card"
          >
            {q.type === "stuck" ? (
              <TrendingDown className="w-3.5 h-3.5 text-destructive shrink-0" />
            ) : (
              <TrendingUp className="w-3.5 h-3.5 text-success shrink-0" />
            )}
            <span className="font-semibold text-foreground whitespace-nowrap">{q.stock}</span>
            <span className="text-muted-foreground truncate">{q.question}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TrendingQueriesStrip;
