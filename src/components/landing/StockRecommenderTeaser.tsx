import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Target,
  ShieldAlert,
  Activity,
  Gauge,
  BarChart3,
} from "lucide-react";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/motion-helpers";

const POINTERS = [
  {
    icon: Target,
    title: "Entry & Exit Levels",
    body: "clear buy zones and target prices",
  },
  {
    icon: ShieldAlert,
    title: "Stop-Loss Zones",
    body: "defined risk per pick, no guessing",
  },
  {
    icon: Activity,
    title: "Support & Resistance",
    body: "key levels mapped on the chart",
  },
  {
    icon: Gauge,
    title: "Technical Ratios",
    body: "RSI, MACD, momentum, volume signals",
  },
  {
    icon: BarChart3,
    title: "Fundamental Metrics",
    body: "P/E, P/B, ROE, sector strength",
  },
] as const;

function PointerList() {
  const ref = useRef<HTMLUListElement | null>(null);
  const inView = useInView(ref, { once: false, margin: "0px 0px -10% 0px" });
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <ul ref={ref} className="mt-6 space-y-3">
        {POINTERS.map((p) => (
          <li key={p.title} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <p.icon className="h-4 w-4 text-accent" aria-hidden />
            </span>
            <span className="text-sm text-foreground">
              <span className="font-semibold">{p.title}</span>
              <span className="text-muted-foreground"> — {p.body}</span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul ref={ref} className="mt-6 space-y-3">
      {POINTERS.map((p, i) => (
        <motion.li
          key={p.title}
          className="flex items-start gap-3"
          initial={{ opacity: 0, x: -20, scale: 0.96 }}
          animate={
            inView
              ? { opacity: 1, x: 0, scale: 1 }
              : { opacity: 0, x: -20, scale: 0.96 }
          }
          transition={{
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1],
            delay: inView ? i * 0.1 : (POINTERS.length - 1 - i) * 0.06,
          }}
        >
          <motion.span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10"
            initial={{ scale: 0.8 }}
            animate={inView ? { scale: [0.8, 1.05, 1] } : { scale: 0.8 }}
            transition={{
              duration: 0.4,
              delay: inView ? i * 0.1 + 0.05 : 0,
              ease: "easeOut",
            }}
          >
            <p.icon className="h-4 w-4 text-accent" aria-hidden />
          </motion.span>
          <span className="text-sm text-foreground">
            <span className="font-semibold">{p.title}</span>
            <span className="text-muted-foreground"> — {p.body}</span>
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

function SampleReportKenBurns() {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  // Peak scale 1.03 at viewport center (progress 0.5); flat on outer 25%.
  const scale = useTransform(scrollYProgress, [0, 0.25, 0.5, 0.75, 1], [1, 1, 1.03, 1, 1]);
  return (
    <div ref={ref} className="relative rounded-xl border border-border/60 overflow-hidden bg-card shadow-md transition-shadow duration-200 hover:shadow-card-hover">
      <span
        className="absolute top-2 right-2 z-10 px-2 py-1 rounded-full text-[10px] font-bold text-white animate-pulse"
        style={{ background: "var(--gradient-brand)" }}
      >
        LIVE
      </span>
      <motion.img
        src="/images/hero-report-preview.webp"
        width={1262}
        height={832}
        alt="Sample stock report showing our structured analysis layout — company name, composite score, fundamentals, and data freshness checks."
        loading="lazy"
        decoding="async"
        className="block w-full h-auto will-change-transform motion-reduce:!scale-100 max-[375px]:!scale-100"
        style={reduced ? undefined : { scale }}
      />
    </div>
  );
}

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
              Set your risk. Get a structured report on every pick — backed by SEBI-aligned reasoning.
            </p>

            <PointerList />

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
            <SampleReportKenBurns />
            <p className="mt-2 text-xs text-muted-foreground">
              Sample report — your personalized report shows your stock, your buy price, your question.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
