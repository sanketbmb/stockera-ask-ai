import { useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { useState, useEffect } from "react";
import {
  Search,
  ShieldCheck,
  TrendingUp,
  Target,
  BarChart3,
  Gift,
  Sparkles,
  BadgeCheck,
  GraduationCap,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrendingQueriesStrip } from "./TrendingQueriesStrip";
import { HeroDemoCard } from "./HeroDemoCard";
import {
  DELAY,
  DUR,
  EASE_IN_OUT,
  EASE_OUT_SOFT,
} from "@/lib/motion/tokens";

const DISCOVERY_TEMPLATE =
  "I have ₹_____ to invest in _____ sector. Which stock should I buy?";

const H1_LINES = [
  { text: "Stuck in a Stock?", delay: 0.1, gradient: false },
  { text: "Ask an Expert:", delay: 0.22, gradient: true },
  { text: "Buy, Hold or Exit.", delay: 0.34, gradient: false },
];

const FEATURE_PILLS = [
  {
    icon: Target,
    label: "Target Price",
    style: {
      background: "rgba(43,168,160,0.10)",
      borderColor: "rgba(43,168,160,0.30)",
      color: "#1F7A75",
    },
  },
  {
    icon: BarChart3,
    label: "Stop Loss",
    style: {
      background: "rgba(220,38,38,0.10)",
      borderColor: "rgba(220,38,38,0.30)",
      color: "#B91C1C",
    },
  },
  {
    icon: TrendingUp,
    label: "Support & Resistance",
    style: {
      background: "rgba(22,163,74,0.10)",
      borderColor: "rgba(22,163,74,0.30)",
      color: "#15803D",
    },
  },
];

const TRUST_CHIPS = [
  { icon: ShieldCheck, text: "SEBI Registered Advisors" },
  { icon: Award, text: "No Guaranteed Returns" },
  { icon: GraduationCap, text: "Educational & Compliant Advice" },
  { icon: BadgeCheck, text: "12,400+ Queries Resolved" },
];

const HERO_PLACEHOLDER_TEXT =
  "Eg: I bought Dixon at 18000, now 16200. Should I hold or exit?";

const SAMPLE_QUERIES = [
  { stock: "RELIANCE", query: "Bought at ₹2,850. Should I hold or exit?", badge: "Technical" },
  { stock: "TCS", query: "Is this a good entry point for long term?", badge: "Fundamental" },
  { stock: "HDFC", query: "Stop loss level after recent correction?", badge: "Stock Levels" },
];

export function HeroSection() {
  const reduced = useReducedMotion();
  const navigate = useNavigate();

  const [typedText, setTypedText] = useState(reduced ? HERO_PLACEHOLDER_TEXT : "");
  const [caretOn, setCaretOn] = useState(true);
  const [typingDone, setTypingDone] = useState(reduced);

  useEffect(() => {
    if (reduced) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTypedText(HERO_PLACEHOLDER_TEXT.slice(0, i));
      if (i >= HERO_PLACEHOLDER_TEXT.length) {
        clearInterval(id);
        setTypingDone(true);
      }
    }, 28);
    return () => clearInterval(id);
  }, [reduced]);

  useEffect(() => {
    if (reduced || typingDone) return;
    const id = setInterval(() => setCaretOn((v) => !v), 500);
    return () => clearInterval(id);
  }, [reduced, typingDone]);
  const displayedPlaceholder = typingDone
    ? typedText
    : typedText + (caretOn ? "|" : "");

  const openQuery = (prefill?: string) => {
    if (prefill) {
      navigate({ to: "/post-query", search: { prefill_query: prefill } as never });
    } else {
      navigate({ to: "/post-query" });
    }
  };

  return (
    <section className="relative overflow-hidden bg-background text-foreground bg-mesh">
      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 md:gap-10 lg:py-24">
        {/* LEFT COLUMN */}
        <div className="text-center md:text-left">
          {/* Eyebrow */}
          <motion.div
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1.5 text-[11px] uppercase tracking-wider text-accent"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, delay: DELAY.sebiBar, ease: EASE_OUT_SOFT }}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            SEBI Registered Analysts • INH000019071
          </motion.div>

          {/* Tiny brand line */}
          <div className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:flex">
            <Sparkles className="h-3 w-3 text-gold" aria-hidden />
            Powered by Stockera
          </div>

          {/* H1 — hardcoded English, 3 lines */}
          <h1 className="mt-3 font-display text-4xl leading-[1.05] text-foreground sm:text-5xl lg:text-6xl">
            {H1_LINES.map((line, i) =>
              reduced ? (
                <span key={i} className="block">
                  {line.gradient ? (
                    <span
                      className="text-gradient"
                      style={{
                        backgroundImage:
                          "linear-gradient(90deg, #2BA8A0, #1F3C73, #F5B731, #2BA8A0)",
                      }}
                    >
                      {line.text}
                    </span>
                  ) : (
                    line.text
                  )}
                </span>
              ) : (
                <motion.span
                  key={i}
                  className="block"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: line.delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  {line.gradient ? (
                    <span
                      className="text-gradient animate-gradient-text"
                      style={{
                        backgroundImage:
                          "linear-gradient(90deg, #2BA8A0, #1F3C73, #F5B731, #2BA8A0)",
                      }}
                    >
                      {line.text}
                    </span>
                  ) : (
                    line.text
                  )}
                </motion.span>
              )
            )}
          </h1>

          {/* Sub-text */}
          <motion.p
            className="text-base md:text-lg text-muted-foreground max-w-lg mb-6 leading-relaxed mx-auto md:mx-0 mt-5"
            initial={reduced ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.heroSub, delay: DELAY.sub, ease: EASE_OUT_SOFT }}
          >
            Helix AI report instantly. Expert text reply in 60 mins. Video analysis in 24 hours.
          </motion.p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-5">
            {FEATURE_PILLS.map((p) => (
              <span
                key={p.label}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                style={p.style}
              >
                <p.icon className="h-3.5 w-3.5" aria-hidden />
                {p.label}
              </span>
            ))}
          </div>

          {/* Referral pill */}
          <a
            href="#referral"
            className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-medium text-foreground transition-shadow hover:shadow-glow-gold mb-6"
          >
            <Gift className="h-4 w-4 text-gold" aria-hidden />
            Invite & Earn ₹50 per friend
            <span className="rounded-full bg-gradient-gold px-2 py-0.5 text-[10px] font-bold text-white">
              FREE ₹
            </span>
          </a>

          {/* CTA row */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center md:justify-start gap-3 mt-2">
            <Button
              size="lg"
              className="relative overflow-hidden group rounded-2xl px-8 bg-gradient-brand text-white shadow-glow-teal hover:shadow-card-lg transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(43,168,160,0.4)]"
              onClick={() => openQuery()}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
              />
              Post My Query →
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-2xl px-8"
              onClick={() => navigate({ to: "/experts" as never })}
            >
              Compare Experts
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="rounded-2xl px-8 text-gold border border-gold/30 hover:bg-gold/10"
              onClick={() => openQuery(DISCOVERY_TEMPLATE)}
            >
              Find Me a Stock →
            </Button>
          </div>

          {/* Trust strip */}
          <motion.ul
            className="mt-8 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:justify-start md:gap-3"
            initial={reduced ? false : "hidden"}
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  delayChildren: DELAY.trustRow,
                  staggerChildren: 0.06,
                },
              },
            }}
          >
            {TRUST_CHIPS.map((c) => {
              const isSebi = c.icon === ShieldCheck;
              return (
                <motion.li
                  key={c.text}
                  className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] text-muted-foreground md:px-3 md:py-1.5 md:text-xs"
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: DUR.trustFade, ease: EASE_OUT_SOFT },
                    },
                  }}
                >
                  {isSebi && !reduced ? (
                    <motion.span
                      className="inline-flex"
                      animate={{ opacity: [0.75, 1, 0.75] }}
                      transition={{
                        duration: DUR.sebiPulse,
                        repeat: Infinity,
                        ease: EASE_IN_OUT,
                        delay: 1.4,
                      }}
                    >
                      <c.icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    </motion.span>
                  ) : (
                    <c.icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  )}
                  {c.text}
                </motion.li>
              );
            })}
          </motion.ul>
        </div>

        {/* RIGHT COLUMN — instant AI demo card */}
        <HeroDemoCard />
      </div>

      {/* Trending Queries strip integrated at hero bottom */}
      <div className="relative z-10 border-t border-border/40 bg-background/60 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-2 sm:px-4">
          <TrendingQueriesStrip />
        </div>
      </div>
    </section>
  );
}
