import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  BadgeCheck,
  Sparkles,
  MapPin,
  Target,
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  Landmark,
  ArrowUpRight,
} from "lucide-react";

const SBI_QUESTION =
  "I bought SBI Bank at 1227 now at 1029. Should I average, hold, or sell?";

const SAMPLE_QUERIES = [
  { stock: "RELIANCE", query: "Bought at ₹2,850. Should I hold or exit?", badge: "Technical" },
  { stock: "TCS", query: "Is this a good entry point for long term?", badge: "Fundamental" },
  { stock: "HDFC", query: "Stop loss level after recent correction?", badge: "Stock Levels" },
];

type Phase = "typing" | "analyzing" | "report";

export function HeroDemoCard() {
  const reduced = useReducedMotion();
  const navigate = useNavigate();

  const [typed, setTyped] = useState(reduced ? SBI_QUESTION : "");
  const [phase, setPhase] = useState<Phase>(reduced ? "report" : "typing");
  const [caret, setCaret] = useState(true);
  const [cycle, setCycle] = useState(0);

  // Typewriter
  useEffect(() => {
    if (reduced) return;
    setTyped("");
    setPhase("typing");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(SBI_QUESTION.slice(0, i));
      if (i >= SBI_QUESTION.length) {
        clearInterval(id);
        setTimeout(() => setPhase("analyzing"), 500);
      }
    }, 32);
    return () => clearInterval(id);
  }, [reduced, cycle]);

  // Analyzing -> report
  useEffect(() => {
    if (phase !== "analyzing") return;
    const t = setTimeout(() => setPhase("report"), 1050);
    return () => clearTimeout(t);
  }, [phase]);

  // Loop
  useEffect(() => {
    if (reduced || phase !== "report") return;
    const t = setTimeout(() => setCycle((c) => c + 1), 7000);
    return () => clearTimeout(t);
  }, [phase, reduced]);

  // Caret blink
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setCaret((v) => !v), 500);
    return () => clearInterval(id);
  }, [reduced]);

  const openQuery = (prefill?: string) => {
    if (prefill) navigate({ to: "/post-query", search: { prefill_query: prefill } as never });
    else navigate({ to: "/post-query" });
  };

  const displayInput =
    phase === "typing" && !reduced ? typed + (caret ? "▍" : " ") : typed || SBI_QUESTION;

  return (
    <motion.div
      className="hidden md:block relative"
      initial={{ opacity: 0, x: 30, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ delay: 0.4, duration: 0.7, type: "spring", stiffness: 80 }}
    >
      <div className="glass relative rounded-3xl p-6 shadow-card-lg overflow-hidden">
        {/* Ambient glow */}
        {!reduced && (
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-24 opacity-40"
            style={{
              background:
                "radial-gradient(600px circle at 20% 0%, rgba(43,168,160,0.18), transparent 40%), radial-gradient(500px circle at 100% 100%, rgba(245,183,49,0.14), transparent 45%)",
            }}
          />
        )}

        {/* Header */}
        <div className="relative flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-teal">
              <Search className="h-5 w-5 text-white" aria-hidden />
            </div>
            <div>
              <div className="font-display font-bold text-sm text-foreground">Post Your Query</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-accent" aria-hidden />
                Instant AI Helix report in ~20 sec
              </div>
            </div>
          </div>
          <span className="rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-success">
            FREE Today
          </span>
        </div>

        {/* Typing input surface */}
        <button
          type="button"
          onClick={() => openQuery(SBI_QUESTION)}
          className="relative w-full text-left rounded-xl border border-border bg-card/80 px-4 py-3 text-sm text-foreground hover:border-accent/50 hover:bg-card transition mb-3 cursor-pointer min-h-[52px]"
          aria-label="Try this query"
        >
          <span className="font-mono text-[13px] leading-relaxed">{displayInput}</span>
        </button>

        {/* Analyzing / Report zone (fixed min-height to prevent jump) */}
        <div className="relative min-h-[228px] mb-4">
          <AnimatePresence mode="wait">
            {phase === "analyzing" && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 flex items-center justify-center rounded-xl border border-accent/20 bg-gradient-to-br from-accent/5 to-transparent"
              >
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-2 w-2 rounded-full bg-accent shadow-glow-teal"
                        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.15, 0.8] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium text-accent tracking-wide">
                    Analyzing<span className="text-accent/60">...</span>
                  </span>
                </div>
              </motion.div>
            )}

            {phase === "report" && (
              <motion.div
                key="report"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 rounded-xl border border-border bg-card/90 p-3.5"
              >
                {/* Snapshot header */}
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-gradient-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                      <Sparkles className="h-2.5 w-2.5" /> AI Helix Snapshot
                    </span>
                    <span className="font-mono text-[11px] font-bold text-primary">SBIN</span>
                  </div>
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    Hold · Averaging Risky
                  </span>
                </div>

                {/* Levels grid */}
                <div className="grid grid-cols-3 gap-2 mb-2.5">
                  <LevelChip
                    tone="info"
                    icon={<MapPin className="h-3 w-3" />}
                    label="Entry"
                    value="₹1,020–1,045"
                  />
                  <LevelChip
                    tone="success"
                    icon={<Target className="h-3 w-3" />}
                    label="Target"
                    value="₹1,180"
                  />
                  <LevelChip
                    tone="danger"
                    icon={<ShieldAlert className="h-3 w-3" />}
                    label="Stop Loss"
                    value="₹985"
                  />
                </div>

                {/* Context row */}
                <div className="grid grid-cols-3 gap-2 mb-2.5">
                  <ContextChip
                    icon={<AlertTriangle className="h-3 w-3 text-amber-600" />}
                    label="Risk"
                    value="Moderate"
                  />
                  <ContextChip
                    icon={<TrendingUp className="h-3 w-3 text-emerald-600" />}
                    label="Trend"
                    value="Base building"
                  />
                  <ContextChip
                    icon={<Landmark className="h-3 w-3 text-primary" />}
                    label="Fundamentals"
                    value="Stable"
                  />
                </div>

                {/* CTA */}
                <button
                  type="button"
                  onClick={() => openQuery(SBI_QUESTION)}
                  className="group inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-brand px-3 py-2 text-[11px] font-semibold text-white shadow-glow-teal transition hover:shadow-card-lg"
                >
                  View full AI report
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sample queries */}
        <div className="relative space-y-1.5 mb-4">
          {SAMPLE_QUERIES.map((s) => (
            <button
              key={s.stock}
              type="button"
              onClick={() => openQuery(s.query)}
              className="w-full text-left rounded-lg border border-border/60 bg-card/60 px-3 py-2 hover:border-accent/40 hover:bg-card transition group"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] font-bold text-primary">{s.stock}</div>
                  <div className="text-xs text-foreground/80 truncate">{s.query}</div>
                </div>
                <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
                  {s.badge}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Bottom stat strip */}
        <div className="relative grid grid-cols-3 divide-x divide-border rounded-xl bg-secondary/50 py-2.5 text-center">
          <div>
            <div className="font-mono text-sm font-bold text-foreground">12K+</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Queries</div>
          </div>
          <div>
            <div className="font-mono text-sm font-bold text-foreground">4.9★</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Rating</div>
          </div>
          <div>
            <div className="font-mono text-sm font-bold text-accent">20 sec</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">AI Report</div>
          </div>
        </div>
      </div>

      {/* Floating badges */}
      <div
        className={`absolute -top-3 -right-3 rounded-full bg-gradient-gold px-4 py-2 text-xs font-bold text-white shadow-glow-gold ${reduced ? "" : "animate-float"}`}
      >
        ₹299 → FREE
      </div>
      <div
        className={`absolute -bottom-3 -left-3 inline-flex items-center gap-1.5 rounded-full glass-subtle border border-border px-3 py-1.5 text-xs font-medium text-foreground ${reduced ? "" : "animate-float"}`}
        style={reduced ? undefined : { animationDelay: "1s" }}
      >
        <BadgeCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
        SEBI Verified
      </div>
    </motion.div>
  );
}

function LevelChip({
  tone,
  icon,
  label,
  value,
}: {
  tone: "info" | "success" | "danger";
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  const toneMap = {
    info: "border-primary/25 bg-primary/5 text-primary",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    danger: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  } as const;
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${toneMap[tone]}`}>
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[11px] font-bold leading-tight">{value}</div>
    </div>
  );
}

function ContextChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/40 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-[11px] font-semibold text-foreground leading-tight truncate">
        {value}
      </div>
    </div>
  );
}
