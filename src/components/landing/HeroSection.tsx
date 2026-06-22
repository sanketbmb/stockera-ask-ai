import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Play, ShieldCheck, Lock, Zap, Video, Wallet, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "./motion-helpers";

const badges = [
  { icon: ShieldCheck, text: "SEBI Registered Analysts" },
  { icon: Lock, text: "Private & Secure" },
  { icon: Zap, text: "AI Report in 30 sec" },
  { icon: Video, text: "Video Answer in 24 hrs" },
  { icon: Wallet, text: "First 2 queries FREE" },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-mesh bg-noise">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:py-24">
        <Reveal>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent">
              <ShieldCheck className="h-3.5 w-3.5" /> SEBI-Verified Experts
            </div>

            <h1 className="mt-5 font-display text-4xl leading-[1.1] text-foreground sm:text-5xl lg:text-[52px]">
              Your Stock in Loss?
              <br />
              <span className="text-shimmer">Ask The Expert.</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Post your stock query — get an instant AI analysis + video answer from a SEBI-registered Research Analyst.
              In plain Hindi or English.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-full bg-gradient-brand text-white shadow-glow-teal hover:opacity-95">
                <Link to="/post-query">Post My Query Free <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-border bg-card">
                <a href="#how-it-works"><Play className="mr-1 h-4 w-4" /> Watch How It Works</a>
              </Button>
            </div>

            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {badges.map((b) => (
                <li key={b.text} className="flex items-center gap-1.5"><b.icon className="h-3.5 w-3.5 text-accent" /> {b.text}</li>
              ))}
            </ul>

            <p className="mt-6 max-w-md text-[11px] leading-relaxed text-muted-foreground/80">
              Not SEBI investment advice. For educational purposes only.
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

const stockName = "SAMPLE LTD";
const queryText = "Bought at ₹85, now at ₹67. Should I average, hold or sell?";

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
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-brand-soft opacity-20 blur-2xl" />
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
              <span className="ml-2 text-sm font-medium text-accent">Analyzing with Gemini AI...</span>
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
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground blur-xs select-none">
                    HOLD
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-foreground tracking-tight whitespace-nowrap bg-card/60 backdrop-blur-[0.5px] rounded-full px-2">
                    Sign up to view
                  </span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { l: "Risk", v: "Medium" },
                  { l: "Confidence", v: "74%" },
                  { l: "Trend", v: "↑ Recovering" },
                ].map((m) => (
                  <div key={m.l} className="rounded-lg bg-card px-2 py-2">
                    <div className="text-[10px] uppercase text-muted-foreground">{m.l}</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">{m.v}</div>
                  </div>
                ))}
              </div>
              <button className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                See Full Report <TrendingUp className="h-3 w-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
