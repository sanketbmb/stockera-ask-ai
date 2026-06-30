import { motion, useReducedMotion } from "framer-motion";
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
  return (
    <div className="overflow-hidden py-3">
      <p className="text-center text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-semibold">
        Trending Queries from Investors
      </p>
      <motion.div
        animate={reduced ? undefined : { x: [0, -1200] }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        className="flex gap-2.5"
      >
        {[...questions, ...questions].map((q, i) => (
          <div
            key={i}
            className="min-w-[220px] flex items-center gap-2 px-3 py-2 rounded-xl bg-card/70 backdrop-blur-sm border border-border/60 text-xs"
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
      </motion.div>
    </div>
  );
}

export default TrendingQueriesStrip;
