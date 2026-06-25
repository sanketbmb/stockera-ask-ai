import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, Play, ShieldCheck, Lock, Zap, Video, Wallet, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "./motion-helpers";

const TRUST_BADGES = [
  { icon: ShieldCheck, text: "SEBI-Registered RA" },
  { icon: Lock, text: "Private & Secure" },
  { icon: Zap, text: "AI Report in 30 sec" },
  { icon: Video, text: "Video Answer in 24 hrs" },
  { icon: Wallet, text: "First 2 queries free" },
];

const LINE_1_WORDS = ["Don't", "act", "on", "tips."];

export function HeroSection() {
  const reduced = useReducedMotion();

  return (
    <section
      className="relative overflow-hidden"
      style={{ backgroundColor: "hsl(var(--brand-ink))", color: "white" }}
    >
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:py-24">
        <Reveal>
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] uppercase tracking-wider text-white">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              SEBI-Registered Research Analyst · INH000019071
            </div>

            <h1 className="mt-5 font-display text-4xl leading-[1.05] text-white sm:text-5xl lg:text-6xl">
              <span className="block">
                {reduced
                  ? <span>Don't act on tips.</span>
                  : LINE_1_WORDS.map((w, i) => (
                      <motion.span
                        key={`${w}-${i}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="inline-block"
                      >
                        {w}{i < LINE_1_WORDS.length - 1 ? "\u00A0" : ""}
                      </motion.span>
                    ))}
              </span>
              <span className="text-shimmer-on-ink block">Get a SEBI-registered second opinion.</span>
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">
              Whether you trade or invest — post any stock question. Get an AI-grounded report in 30 seconds, and if you want, a personalized video answer from a SEBI-registered Research Analyst within 24 hours. Calm. Educational. On the record.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/post-query">
                  Post my query — free <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10"
              >
                <a href="#how-it-works">
                  <Play className="mr-1 h-4 w-4" aria-hidden /> See how it works
                </a>
              </Button>
            </div>

            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/60">
              {TRUST_BADGES.map((b) => (
                <li key={b.text} className="flex items-center gap-1.5">
                  <b.icon className="h-3.5 w-3.5 text-accent" aria-hidden /> {b.text}
                </li>
              ))}
            </ul>

            <p className="mt-6 max-w-md text-[11px] text-white/40">
              Educational analysis only. Not investment advice. Investments in securities are subject to market risks.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <LiveDemoWidget />
        </Reveal>
      </div>
    </section>
  );
}

const stockName = "Suzlon Energy";
const queryText = "Bought at ₹68, now at ₹57. Should I average, hold or sell?";

type Phase = "typing-stock" | "typing-query" | "analyzing" | "report";

function useTypewriter(text: string, active: boolean, speed = 40) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!active) { setOut(""); return; }
    let i = 0;
    const t = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, active, speed]);
  return out;
}

function LiveDemoWidget() {
  const [phase, setPhase] = useState<Phase>("typing-stock");

  useEffect(() => {
    const seq: Array<[Phase, number]> = [
      ["typing-stock", 1400],
      ["typing-query", 2400],
      ["analyzing", 2000],
      ["report", 2400],
    ];
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      setPhase(seq[i][0]);
      timer = setTimeout(() => { i = (i + 1) % seq.length; next(); }, seq[i][1]);
    };
    next();
    return () => clearTimeout(timer);
  }, []);

  const stock = useTypewriter(stockName, phase === "typing-stock", 50);
  const query = useTypewriter(queryText, phase === "typing-query" || phase === "analyzing" || phase === "report", 30);

  return (
    <Link to="/post-query" className="block text-foreground">
      <div className="relative">
      <div aria-hidden className="absolute -inset-4 -z-10 rounded-3xl bg-accent/10 blur-2xl" />
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card-lg sm:p-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-success" />
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Live Query Demo (Illustration)</span>
          </div>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent">NSE · BSE</span>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Stock</label>
            <div className="mt-1 flex h-10 items-center rounded-lg border border-border bg-secondary/60 px-3 font-mono text-sm">
              {stock}<span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-accent" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Your Question</label>
            <div className="mt-1 min-h-[60px] rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm leading-relaxed">
              {query}{(phase === "typing-query") && <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-accent align-middle" />}
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {phase === "analyzing" && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-accent/40 bg-accent/5 py-4"
            >
              <div className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
              <div className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
              <div className="h-2 w-2 animate-bounce rounded-full bg-accent" />
              <span className="ml-2 text-sm font-medium text-accent">Analyzing…</span>
            </motion.div>
          )}

          {phase === "report" && (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded-xl border border-border bg-gradient-to-br from-secondary/40 to-card p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">AI Verdict</span>
                <div className="relative">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground blur-sm select-none">
                    HOLD
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-card/60 px-2 text-[10px] font-medium tracking-tight text-foreground backdrop-blur-[0.5px] whitespace-nowrap">
                    Sign up to view
                  </span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { l: "Risk", v: "Medium" },
                  { l: "Confidence", v: "Educational" },
                  { l: "Trend", v: "Neutral" },
                ].map((m) => (
                  <div key={m.l} className="rounded-lg bg-card px-2 py-2">
                    <div className="text-[10px] uppercase text-muted-foreground">{m.l}</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">{m.v}</div>
                  </div>
                ))}
              </div>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                See full report <TrendingUp className="h-3 w-3" aria-hidden />
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>
    </Link>
  );
}
