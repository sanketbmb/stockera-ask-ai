import { useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
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

const SAMPLE_QUERIES = [
  { stock: "RELIANCE", query: "Bought at ₹2,850. Should I hold or exit?", badge: "Technical" },
  { stock: "TCS", query: "Is this a good entry point for long term?", badge: "Fundamental" },
  { stock: "HDFC", query: "Stop loss level after recent correction?", badge: "F&O" },
];

export function HeroSection() {
  const reduced = useReducedMotion();
  const navigate = useNavigate();

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
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1.5 text-[11px] uppercase tracking-wider text-accent">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            SEBI Registered Analysts • 12,400+ queries answered
          </div>

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
          <p className="text-base md:text-lg text-muted-foreground max-w-lg mb-6 leading-relaxed mx-auto md:mx-0 mt-5">
            Helix AI report instantly. Expert text reply in 60 mins. Video analysis in 24 hours.
          </p>

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
              className="rounded-2xl px-8 bg-gradient-brand text-white shadow-glow-teal hover:shadow-card-lg"
              onClick={() => openQuery()}
            >
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
          <ul className="mt-8 flex flex-wrap justify-center md:justify-start gap-2">
            {TRUST_CHIPS.map((c) => (
              <li
                key={c.text}
                className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-3 py-1.5 text-xs text-muted-foreground"
              >
                <c.icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {c.text}
              </li>
            ))}
          </ul>
        </div>

        {/* RIGHT COLUMN — glass query card (md+) */}
        <motion.div
          className="hidden md:block relative"
          initial={{ opacity: 0, x: 30, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.7, type: "spring", stiffness: 80 }}
        >
          <div className="glass relative rounded-3xl p-6 shadow-card-lg">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand">
                  <Search className="h-5 w-5 text-white" aria-hidden />
                </div>
                <div>
                  <div className="font-display font-bold text-sm text-foreground">Post Your Query</div>
                  <div className="text-xs text-muted-foreground">Get expert answer in 60 min</div>
                </div>
              </div>
              <span className="rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-success">
                FREE Today
              </span>
            </div>

            {/* Search input */}
            <button
              type="button"
              onClick={() => openQuery()}
              aria-label="Post your query"
              className="w-full text-left rounded-xl border border-border bg-card/80 px-4 py-3 text-sm text-muted-foreground hover:border-accent/50 hover:bg-card transition mb-4"
            >
              Eg: I bought Dixon at 18000, now 16200. Should I hold or exit?
            </button>

            {/* Sample queries */}
            <div className="space-y-2 mb-5">
              {SAMPLE_QUERIES.map((s) => (
                <button
                  key={s.stock}
                  type="button"
                  onClick={() => openQuery(s.query)}
                  className="w-full text-left rounded-lg border border-border/60 bg-card/60 px-3 py-2.5 hover:border-accent/40 hover:bg-card transition group"
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
            <div className="grid grid-cols-3 divide-x divide-border rounded-xl bg-secondary/50 py-2.5 text-center">
              <div>
                <div className="font-mono text-sm font-bold text-foreground">12K+</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Queries</div>
              </div>
              <div>
                <div className="font-mono text-sm font-bold text-foreground">4.9★</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Rating</div>
              </div>
              <div>
                <div className="font-mono text-sm font-bold text-foreground">60min</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Reply</div>
              </div>
            </div>
          </div>

          {/* Floating top-right badge */}
          <div
            className={`absolute -top-3 -right-3 rounded-full bg-gradient-gold px-4 py-2 text-xs font-bold text-white shadow-glow-gold ${reduced ? "" : "animate-float"}`}
          >
            ₹299 → FREE
          </div>

          {/* Floating bottom-left pill */}
          <div
            className={`absolute -bottom-3 -left-3 inline-flex items-center gap-1.5 rounded-full glass-subtle border border-border px-3 py-1.5 text-xs font-medium text-foreground ${reduced ? "" : "animate-float"}`}
            style={reduced ? undefined : { animationDelay: "1s" }}
          >
            <BadgeCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
            SEBI Verified
          </div>
        </motion.div>
      </div>

      {/* Reserved — keep Link import alive for future use */}
      <Link to="/" className="hidden" aria-hidden tabIndex={-1} />
    </section>
  );
}
