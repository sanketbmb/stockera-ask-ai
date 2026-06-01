// Stockera Brain v2 — God-tier Stock Analysis Report
// Renders the orchestrator JSON contract from `generate-stock-analysis`.
// Premium, editorial, tier-aware. No backend logic, pure presentation.
// Motion layer: framer-motion + useCountUp. Honors prefers-reduced-motion.

import { useMemo } from "react";
import {
  Activity, AlertTriangle, BarChart3, Brain, Building2, CheckCircle2,
  Compass, Eye, Flame, Gauge, HelpCircle, Info, LineChart, Newspaper,
  ShieldCheck, Sparkles, Target, TrendingDown, TrendingUp,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion, useInView, MotionConfig } from "framer-motion";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  StockAnalysisPayload, VerdictAction, QueryType, ScoreBreakdown,
} from "@/types/stock-analysis";
import { AnimatedNumber, useCountUp } from "@/hooks/useCountUp";
import { omissionCopy } from "@/lib/trade-plan-copy";
import { verdictUILabel, verdictRawLabel } from "@/lib/verdict-labels";
import {
  pageContainer, sectionFadeUp, verdictScale, tierBadgeSlide,
  gridContainer, cardItem, innerStaggerContainer, innerStaggerItem,
  priceBandLine, tabContent, nudgeReveal, footerFade,
  duration, ease,
} from "./motion-variants";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const DASH = "—";
const fmtNum = (n: number | null | undefined, d = 2): string =>
  n == null || !Number.isFinite(n) ? DASH : n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPrice = (n: number | null | undefined): string =>
  n == null ? DASH : `₹${fmtNum(n, 2)}`;
const fmtPct = (n: number | null | undefined, d = 2, signed = false): string => {
  if (n == null || !Number.isFinite(n)) return DASH;
  const v = fmtNum(n, d);
  return signed && n > 0 ? `+${v}%` : `${v}%`;
};
const fmtDate = (s: string | null | undefined): string => {
  if (!s) return DASH;
  try { return new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }); }
  catch { return s; }
};
const fmtDateShort = (s: string | null | undefined): string => {
  if (!s) return DASH;
  try { return new Date(s).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
};
const fmtTimeIST = (s: string | null | undefined): string => {
  if (!s) return DASH;
  try { return new Date(s).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }); }
  catch { return s; }
};
// Friendly label for a price_context.price_source value coming from compute-technicals.
const PRICE_SOURCE_LABEL: Record<string, string> = {
  dhan_live: "Dhan live",
  dhan_cache: "Dhan live",
  finedge_eod: "finedge EOD",
  finedge: "finedge EOD",
};
const formatPriceSource = (raw: string | null | undefined): { label: string; isLive: boolean } => {
  const key = (raw ?? "").toLowerCase();
  if (!key) return { label: "live feed", isLive: false };
  const live = key.startsWith("dhan");
  return { label: PRICE_SOURCE_LABEL[key] ?? key.replace(/_/g, " "), isLive: live };
};
const labelize = (s: string | null | undefined): string =>
  !s ? DASH : s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Verdict palette — refined, never alarmist.
const VERDICT_STYLES: Record<VerdictAction, { label: string; ring: string; chip: string; accent: string; dot: string; stroke: string }> = {
  BUY:       { label: "Buy",        ring: "from-emerald-500/30 to-teal-500/10",  chip: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",   accent: "text-emerald-700", dot: "bg-emerald-500", stroke: "#0e9f6e" },
  HOLD:      { label: "Hold",       ring: "from-amber-400/30 to-amber-200/10",   chip: "bg-amber-400/10 text-amber-800 border-amber-500/30",         accent: "text-amber-700",   dot: "bg-amber-500",   stroke: "#d68910" },
  WATCHLIST: { label: "Watchlist",  ring: "from-sky-500/25 to-sky-200/10",       chip: "bg-sky-500/10 text-sky-800 border-sky-500/30",               accent: "text-sky-700",     dot: "bg-sky-500",     stroke: "#3498db" },
  SELL:      { label: "Reduce",     ring: "from-rose-500/30 to-rose-200/10",     chip: "bg-rose-500/10 text-rose-800 border-rose-500/30",            accent: "text-rose-700",    dot: "bg-rose-500",    stroke: "#c0392b" },
  AVOID:     { label: "Avoid",      ring: "from-red-700/30 to-red-300/10",       chip: "bg-red-700/10 text-red-900 border-red-700/30",               accent: "text-red-800",     dot: "bg-red-700",     stroke: "#c0392b" },
};

const TIER_LABEL: Record<QueryType, string> = {
  "intraday": "Intraday view",
  "medium-term": "Medium-term view",
  "long-term": "Long-term view",
};

// Plain-English, deterministic methodology copy for each pillar (0–100 scale).
const PILLAR_METHODOLOGY = {
  technical:   "RSI, MACD, moving-average stack, ADX, Bollinger position and VWAP signal blended into a single trend/strength reading.",
  fundamental: "Valuation (PE, DCF upside), profitability (ROE), and quality scores (Piotroski F, Altman Z) combined with a banking-aware override.",
  risk:        "Beta, 1-year volatility, Sharpe/Sortino ratios, max drawdown, VaR-95 and liquidity classification — higher score means lower realised risk.",
  momentum:    "1-week / 1-month / 3-month returns, relative strength vs Nifty, moving-average cross status and volume confirmation.",
  sentiment:   "News-flow sentiment score from recent headlines; null when news is disabled or no coverage is available.",
} as const;

const SCORE_TONE = (s: number | null | undefined): { color: string; label: string } => {
  if (s == null) return { color: "text-muted-foreground", label: "no data" };
  if (s >= 70) return { color: "text-emerald-700", label: "strong" };
  if (s >= 50) return { color: "text-amber-700", label: "moderate" };
  if (s >= 30) return { color: "text-rose-700", label: "weak" };
  return { color: "text-red-800", label: "very weak" };
};

// Score ring stroke colour based on score band (refined emotional palette).
const ringStroke = (score: number, action: VerdictAction): string => {
  if (score >= 75) return "#0e9f6e";           // emerald premium
  if (score >= 60) return "#c9a227";           // refined gold
  if (score >= 45) return "#d68910";           // refined amber
  if (score >= 30) return "#e07b5f";           // coral
  if (score < 30)  return "#a93226";           // restrained crimson
  return VERDICT_STYLES[action].stroke;
};

// Severity tone for risk metrics — refined, only escalates when genuinely needed.
const riskTone = (kind: "beta" | "vol" | "sharpe" | "sortino" | "dd" | "var", v: number | null): string => {
  if (v == null) return "text-muted-foreground";
  switch (kind) {
    case "beta":    return v > 1.6 ? "text-rose-700" : v > 1.2 ? "text-amber-700" : "text-emerald-700";
    case "vol":     return v > 45  ? "text-rose-700" : v > 30  ? "text-amber-700" : "text-emerald-700";
    case "sharpe":  return v < 0   ? "text-rose-700" : v < 0.5 ? "text-amber-700" : "text-emerald-700";
    case "sortino": return v < 0   ? "text-rose-700" : v < 0.7 ? "text-amber-700" : "text-emerald-700";
    case "dd":      return v < -40 ? "text-rose-700" : v < -20 ? "text-amber-700" : "text-emerald-700";
    case "var":     return v < -8  ? "text-rose-700" : v < -4  ? "text-amber-700" : "text-emerald-700";
  }
};

// Tier-aware section priority (lower = more emphasis at top)
const SECTION_ORDER: Record<QueryType, Array<"technical" | "fundamental" | "risk" | "momentum">> = {
  "intraday":    ["technical", "momentum", "risk", "fundamental"],
  "medium-term": ["technical", "fundamental", "risk", "momentum"],
  "long-term":   ["fundamental", "risk", "technical", "momentum"],
};

// Tier-aware pulse: which pillars deserve the gentle one-shot emphasis.
const TIER_PULSE_PILLARS: Record<QueryType, Set<"technical" | "fundamental" | "risk" | "momentum">> = {
  "intraday":    new Set(["technical", "momentum"]),
  "medium-term": new Set(),
  "long-term":   new Set(["fundamental", "risk"]),
};

// Behavioral nudge — deterministic mapping (verdict × tier × risk)
function behavioralNudge(action: VerdictAction, tier: QueryType, riskLabel: string): { title: string; body: string } | null {
  if (action === "AVOID" || action === "SELL") {
    if (tier === "intraday") return { title: "Avoid revenge buying after sharp falls", body: "Sharp short-term declines invite emotional re-entries. Wait for structure to re-form before acting." };
    return { title: "Resist the urge to average down", body: "When the underlying story weakens, adding more rarely fixes it. Reassess the thesis before committing fresh capital." };
  }
  if (action === "WATCHLIST") {
    return { title: "Patience beats premature conviction", body: "Watchlist setups need a trigger — predefine the level and condition that would change your mind, rather than acting on noise." };
  }
  if (action === "HOLD") {
    if (tier === "intraday") return { title: "Be mindful of recency bias on short-term moves", body: "Yesterday's candle is rarely tomorrow's edge. Stay anchored to your plan, not the last 30 minutes." };
    return { title: "Stay anchored to the original thesis", body: "Hold means hold — avoid micro-managing a position the data still supports." };
  }
  if (action === "BUY") {
    if (tier === "long-term") return { title: "Long-term setups require patience, not noise reaction", body: "Multi-quarter compounding rarely shows up week to week. Size sensibly and let the thesis play out." };
    if (riskLabel === "HIGH" || riskLabel === "VERY_HIGH") return { title: "Strong setup, calibrated size", body: "Conviction is high but so is risk. Right-size the position so a normal drawdown does not break the plan." };
    return { title: "Confirmation, not chase", body: "Enter on your level, not on FOMO. A good setup will give you a defined risk; an emotional entry rarely does." };
  }
  return null;
}

// Default action-zone tab based on tier
const TIER_DEFAULT_TAB: Record<QueryType, "holding" | "fresh" | "exploring"> = {
  "intraday": "fresh",
  "medium-term": "holding",
  "long-term": "exploring",
};

// ─────────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────────

function SectionTitle({ eyebrow, title, icon: Icon, info }: { eyebrow: string; title: string; icon?: React.ComponentType<{ className?: string }>; info?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 border-b border-border/60 pb-3">
      <div className="flex items-center gap-3">
        {Icon && <Icon className="h-5 w-5 text-accent" />}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
          <h2 className="font-display text-2xl text-foreground leading-tight">{title}</h2>
        </div>
        {info}
      </div>
    </div>
  );
}

// Reusable "How this is calculated" affordance — Popover for richer copy than tooltip.
function InfoTip({ title, body, formula, className }: { title: string; body: React.ReactNode; formula?: React.ReactNode; className?: string }) {
  const [showFormula, setShowFormula] = useState(false);
  return (
    <Popover>
      <PopoverTrigger
        className={`inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground ${className ?? ""}`}
        aria-label={`How ${title} is calculated`}
      >
        <Info className="h-3 w-3" /> How this is calculated
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] text-xs leading-snug">
        <p className="mb-1.5 font-display text-sm text-foreground">{title}</p>
        <div className="space-y-1.5 text-muted-foreground">{body}</div>
        {formula && (
          <div className="mt-3 border-t border-border pt-2">
            <button
              type="button"
              onClick={() => setShowFormula((s) => !s)}
              className="text-[10px] font-mono uppercase tracking-wider text-accent hover:underline"
            >
              {showFormula ? "Hide formula" : "Show formula"}
            </button>
            {showFormula && (
              <pre className="mt-1.5 whitespace-pre-wrap rounded bg-muted/40 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-foreground/80">{formula}</pre>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Metric({ label, value, tone = "", hint }: { label: string; value: React.ReactNode; tone?: string; hint?: string }) {
  return (
    <motion.div variants={innerStaggerItem} className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild><HelpCircle className="h-3 w-3 cursor-help opacity-60" /></TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className={`font-display text-lg tabular-nums leading-tight ${tone || "text-foreground"}`}>{value}</p>
    </motion.div>
  );
}

// Animated score bar — width fills from 0 to target on view; tier-weighted pulses once.
function ScoreBar({ label, value, weighted, pulse, note, methodology }: { label: string; value: number | null; weighted: boolean; pulse?: boolean; note?: string; methodology?: string }) {
  const v = value ?? 0;
  const tone = SCORE_TONE(value);
  // Only null/undefined count as missing. A literal 0 is a legitimate score.
  const isMissing = value == null;
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const width = isMissing ? 0 : Math.max(0, Math.min(100, v));
  // CRITICAL: attach useCountUp's ref to the count span so its internal
  // useInView fires; otherwise the count stays at 0 forever.
  const { ref: countRef, text: countText } = useCountUp({ value: isMissing ? null : v, duration: 700, decimals: 0 });

  return (
    <div ref={ref} className={isMissing ? "opacity-60" : ""}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {label}
          {weighted && (
            <motion.span
              className="inline-block h-1 w-1 rounded-full bg-accent"
              title="Tier-weighted"
              animate={pulse && inView && !reduce ? { scale: [1, 1.6, 1], opacity: [1, 0.8, 1] } : {}}
              transition={{ duration: 0.45, ease: ease.standard, delay: 0.4 }}
            />
          )}
          {methodology && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 cursor-help text-muted-foreground/50 hover:text-muted-foreground" aria-label={`${label} methodology`} />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-snug">
                Score 0–100. {methodology}
              </TooltipContent>
            </Tooltip>
          )}
          {note && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 cursor-help text-muted-foreground/60" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">{note}</TooltipContent>
            </Tooltip>
          )}
        </span>
        <span ref={countRef} className={`font-mono tabular-nums font-semibold ${tone.color}`}>
          {isMissing ? DASH : <>{countText}<span className="text-muted-foreground/60 font-normal"> / 100</span></>}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <motion.div
          className={`h-full origin-left rounded-full ${isMissing ? "bg-muted-foreground/30" : "bg-gradient-to-r from-primary to-accent"}`}
          style={{ width: `${width}%` }}
          initial={reduce ? { scaleX: 1 } : { scaleX: 0 }}
          animate={inView ? (pulse && !reduce
            ? { scaleX: [0, 1, 1.02, 1] }
            : { scaleX: 1 }) : undefined}
          transition={{
            duration: pulse && !reduce ? duration.cinematic + 0.1 : duration.cinematic,
            ease: ease.standard,
          }}
        />
      </div>
    </div>
  );
}

function ReturnChip({ label, value }: { label: string; value: number | null }) {
  const isMissing = value == null;
  const pos = value != null && value >= 0;
  return (
    <motion.div
      variants={innerStaggerItem}
      whileHover={{ y: -1 }}
      transition={{ duration: duration.fast, ease: ease.standard }}
      className="flex flex-col items-start rounded-md border border-border/60 bg-card px-3 py-2 hover:border-accent/40"
    >
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-display text-base tabular-nums ${isMissing ? "text-muted-foreground" : pos ? "text-emerald-700" : "text-rose-700"}`}>
        {isMissing ? DASH : <AnimatedNumber value={value} decimals={2} suffix="%" signed duration={700} />}
      </span>
    </motion.div>
  );
}

// Score ring (SVG) — animated arc fill + count-up center.
// Binds to `final_verdict.overall_score`. When score is null/undefined, the
// stroke stays at 0 and the centre renders the universal DASH; a literal 0
// still renders as "0" so we never silently fabricate a non-zero reading.
function ScoreRing({ score, action }: { score: number | null | undefined; action: VerdictAction }) {
  const r = 64, c = 2 * Math.PI * r;
  const isMissing = score == null || !Number.isFinite(score);
  const pct = isMissing ? 0 : Math.max(0, Math.min(100, score as number));
  const dash = (pct / 100) * c;
  const stroke = isMissing ? "hsl(var(--muted-foreground))" : ringStroke(pct, action);
  const reduce = useReducedMotion();
  const ref = useRef<SVGSVGElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const { ref: countRef, text: scoreText } = useCountUp({
    value: isMissing ? null : (score as number),
    duration: 800,
    decimals: 0,
  });
  const isBuy = action === "BUY" && !isMissing;

  return (
    <div className="relative inline-flex flex-col items-center">
      {isBuy && !reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 24px ${stroke}33` }}
          animate={{ opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <svg ref={ref} width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
        {!isMissing && (
          <motion.circle
            cx="80" cy="80" r={r} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={c}
            initial={reduce ? { strokeDashoffset: c - dash } : { strokeDashoffset: c }}
            animate={inView ? { strokeDashoffset: c - dash } : undefined}
            transition={{ duration: duration.cinematic, ease: ease.standard }}
          />
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span ref={countRef} className="font-display text-4xl tabular-nums text-foreground">
          {isMissing ? DASH : scoreText}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{isMissing ? "Stockera Score" : "out of 100"}</span>
      </div>
    </div>
  );
}



// Price band visual for trade levels — line draws first, markers stagger in by priority.
// Collision system:
//   1. Exact-value markers are merged into a single label (e.g. "ENTRY / LTP ₹1,321.90").
//   2. Markers within MIN_GAP_PCT of one another are pushed alternately above/below
//      the band — when stacked on the same side, a second tier is offset further
//      with a subtle leader line so labels never overlap.
//   3. All positions are static (no hover-only state) so PDF capture is identical
//      to the on-screen render. Tap-to-expand is unnecessary because every label
//      is permanently visible.
function PriceBand({ levels, current }: { levels: StockAnalysisPayload["levels"]; current: number | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduce = useReducedMotion();

  const priorityIndex: Record<string, number> = {
    Entry: 0, LTP: 0.5, SL: 1, T1: 2, T2: 3, S1: 4, S2: 5, R1: 6, R2: 7,
  };
  const dotColor: Record<string, string> = {
    S2: "bg-rose-500", S1: "bg-rose-400", SL: "bg-red-700",
    Entry: "bg-primary", LTP: "bg-foreground",
    R1: "bg-emerald-400", T1: "bg-emerald-500",
    R2: "bg-emerald-600", T2: "bg-emerald-700",
  };
  const highlightLabels = new Set(["SL", "T1", "T2", "Entry"]);

  const rawPoints = [
    { v: levels.support_2,    label: "S2" },
    { v: levels.support_1,    label: "S1" },
    { v: levels.stop_loss,    label: "SL" },
    { v: levels.entry_zone,   label: "Entry" },
    { v: current,             label: "LTP" },
    { v: levels.resistance_1, label: "R1" },
    { v: levels.target_1,     label: "T1" },
    { v: levels.resistance_2, label: "R2" },
    { v: levels.target_2,     label: "T2" },
  ].filter((p) => p.v != null) as Array<{ v: number; label: string }>;

  // 1) Merge exact-value collisions (rounded to paise so 1321.9 ≡ 1321.90).
  const merged = new Map<string, { v: number; labels: string[] }>();
  for (const p of rawPoints) {
    const key = p.v.toFixed(2);
    const slot = merged.get(key);
    if (slot) slot.labels.push(p.label);
    else merged.set(key, { v: p.v, labels: [p.label] });
  }
  // Sort each merged group's labels by priority for stable display order.
  const points = Array.from(merged.values())
    .map((g) => {
      g.labels.sort((a, b) => (priorityIndex[a] ?? 9) - (priorityIndex[b] ?? 9));
      return g;
    })
    .sort((a, b) => a.v - b.v);

  if (points.length < 2) {
    return <p className="text-sm text-muted-foreground italic">Insufficient level data for visualization.</p>;
  }

  const min = points[0].v;
  const max = points[points.length - 1].v;
  const span = max - min || 1;

  // 2) Magnetic spacing → vertical stagger fallback.
  // Compute side (above/below) and an extra tier offset for each label.
  const MIN_GAP_PCT = 9; // empirically large enough for 5-char "₹1,321"
  type Slot = { v: number; labels: string[]; x: number; side: "top" | "bottom"; tier: 0 | 1 };
  const slots: Slot[] = points.map((p, i) => ({
    v: p.v,
    labels: p.labels,
    x: ((p.v - min) / span) * 100,
    side: i % 2 === 0 ? "top" : "bottom",
    tier: 0,
  }));
  // Walk neighbours within MIN_GAP_PCT and push the second one to the opposite
  // side. If still colliding on the SAME side as the previous-previous, escalate
  // to tier 1 (further offset + leader line).
  for (let i = 1; i < slots.length; i++) {
    const prev = slots[i - 1];
    const cur = slots[i];
    if (Math.abs(cur.x - prev.x) < MIN_GAP_PCT && cur.side === prev.side) {
      cur.side = prev.side === "top" ? "bottom" : "top";
    }
    if (i >= 2) {
      const prev2 = slots[i - 2];
      if (cur.side === prev2.side && Math.abs(cur.x - prev2.x) < MIN_GAP_PCT) {
        cur.tier = 1;
      }
    }
  }

  return (
    <div ref={ref} className="relative my-6 h-24 print:h-24">
      <motion.div
        className="absolute top-1/2 left-0 right-0 h-px origin-left bg-gradient-to-r from-rose-300 via-border to-emerald-300"
        variants={priceBandLine}
        initial={reduce ? "visible" : "hidden"}
        animate={inView ? "visible" : undefined}
      />
      {slots.map((s, i) => {
        const primary = s.labels[0];
        const order = priorityIndex[primary] ?? 9;
        const delay = reduce ? 0 : 0.35 + order * 0.04;
        const emphasized = s.labels.some((l) => highlightLabels.has(l));
        const colorCls = dotColor[primary] ?? "bg-foreground";
        const labelText = s.labels.join(" / ");
        const isTop = s.side === "top";
        // Label vertical offset: tier 0 sits close to the band, tier 1 is pushed
        // further away with a subtle leader line.
        const topPx = isTop ? (s.tier === 0 ? -2 : -22) : (s.tier === 0 ? 50 : 70);
        const showLeader = s.tier === 1;
        return (
          <motion.div
            key={`${primary}-${i}`}
            className="absolute -translate-x-1/2"
            style={{ left: `${s.x}%`, top: 0 }}
            initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: duration.fast, ease: ease.entrance, delay }}
          >
            <motion.div
              className={`mx-auto h-3 w-3 rounded-full ${colorCls} ring-2 ring-background`}
              style={{ marginTop: "38px" }}
              whileHover={emphasized ? { scale: 1.25, boxShadow: "0 0 0 4px hsl(var(--accent) / 0.15)" } : { scale: 1.1 }}
              transition={{ duration: duration.fast, ease: ease.standard }}
            />
            {showLeader && (
              <div
                className="absolute left-1/2 w-px bg-border"
                style={{
                  top: isTop ? `${topPx + 28}px` : "44px",
                  height: isTop ? `${-topPx - 6}px` : `${topPx - 44}px`,
                }}
                aria-hidden
              />
            )}
            <div
              className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center"
              style={{ top: `${topPx}px` }}
            >
              <div className="font-mono text-[10px] uppercase text-muted-foreground">{labelText}</div>
              <div className="font-display text-xs tabular-nums">{fmtPrice(s.v)}</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

export function StockAnalysisReport({ data, printMode = false }: { data: StockAnalysisPayload; printMode?: boolean }) {
  const {
    stock, query_context, final_verdict, score_breakdown, price_context,
    levels, returns_snapshot, technical_snapshot, fundamental_snapshot,
    risk_snapshot, momentum_snapshot, sentiment_snapshot, flags,
    report_modules, audit_meta, as_of_date,
  } = data;

  const tier = query_context.query_type;
  const verdictStyle = VERDICT_STYLES[final_verdict.action];
  const nudge = useMemo(() => behavioralNudge(final_verdict.action, tier, final_verdict.risk_label), [final_verdict.action, tier, final_verdict.risk_label]);
  const weights = audit_meta.tier_weights;
  const pulsePillars = TIER_PULSE_PILLARS[tier];

  // Trade-plan validation: omission reasons keyed by level
  const tradePlanReasons = useMemo(() => {
    const map: Partial<Record<keyof typeof levels, string>> = {};
    for (const o of audit_meta.trade_plan_validation ?? []) {
      if (!map[o.level]) map[o.level] = o.reason;
    }
    return map;
  }, [audit_meta.trade_plan_validation, levels]);
  const tradePlanFromEngine = audit_meta.trade_plan_source === "compute-trade-plan";
  const highVol = (audit_meta.trade_plan_vol_1y ?? risk_snapshot.volatility_1y ?? 0) > 35;

  const [activeTab, setActiveTab] = useState<"holding" | "fresh" | "exploring">(TIER_DEFAULT_TAB[tier]);

  // R:R from levels (ratio + rupee breakdown for the dual-format display).
  const { rr, riskRupee, rewardRupee } = useMemo(() => {
    const e = levels.entry_zone, sl = levels.stop_loss, t = levels.target_1;
    if (e == null || sl == null || t == null) return { rr: null, riskRupee: null, rewardRupee: null };
    const risk = Math.abs(e - sl), reward = Math.abs(t - e);
    if (risk === 0) return { rr: null, riskRupee: null, rewardRupee: null };
    return { rr: reward / risk, riskRupee: Math.round(risk), rewardRupee: Math.round(reward) };
  }, [levels]);

  // Presentation-only verdict label. PDF (printMode) always shows the raw
  // orchestrator action verbatim so SEBI audit trails stay unchanged.
  const displayVerdict = printMode
    ? verdictRawLabel(final_verdict.action)
    : verdictUILabel(final_verdict.action);


  // Print mode: disable all motion deterministically. MotionConfig forces
  // useReducedMotion()=true throughout the tree, snapping initial states
  // to final values (count-ups, score ring, score bars, price band all
  // honor reduced motion via their existing branches).
  const content = (
    <TooltipProvider delayDuration={150}>
      <motion.article
        className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 md:px-6 print:max-w-none print:py-0"
        variants={pageContainer}
        initial="hidden"
        animate="visible"
      >


        {/* ═══ 1. HEADER STRIP ═══ */}
        <motion.header variants={sectionFadeUp} className="rounded-2xl border border-border bg-card px-6 py-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">{stock.exchange}: {stock.symbol}</Badge>
                {stock.sector && <Badge variant="secondary" className="text-[10px]">{stock.sector}</Badge>}
                {stock.industry && stock.industry !== stock.sector && (
                  <span className="text-[11px] text-muted-foreground">· {stock.industry}</span>
                )}
              </div>
              <h1 className="mt-2 font-display text-3xl text-foreground md:text-4xl truncate">{stock.company_name || stock.symbol}</h1>
            </div>
            <div className="text-right">
              <div className="font-display text-3xl tabular-nums text-foreground">{fmtPrice(price_context.current_price)}</div>
              {(() => {
                const src = formatPriceSource(price_context.price_source);
                const ts = price_context.as_of || as_of_date;
                const when = src.isLive ? `${fmtTimeIST(ts)} IST` : fmtDateShort(ts);
                return (
                  <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                    {src.isLive && (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      </span>
                    )}
                    <span className="font-mono">{src.label}</span>
                    <span>·</span>
                    <span>as of {when}</span>
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> SEBI-aligned analysis</span>
            <span>·</span>
            <span>{TIER_LABEL[tier]}</span>
            <span>·</span>
            <span>{final_verdict.time_horizon}</span>
          </div>
        </motion.header>

        {/* ═══ 2. VERDICT HERO ═══ */}
        <motion.section variants={sectionFadeUp} className={`rounded-2xl border border-border bg-gradient-to-br ${verdictStyle.ring} px-6 py-8 md:px-10 md:py-10`}>
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Final verdict</p>
                <InfoTip
                  title="How the verdict is set"
                  body={
                    <>
                      <p>The verdict (Buy / Hold / Watchlist / Reduce / Avoid) is derived from the composite score with tier-specific guardrails layered on top.</p>
                      <p className="italic">Action = mapScoreToAction(overall) → demote on weak risk/fundamentals or missing modules.</p>
                    </>
                  }
                  formula={`overall = Σ(pillar × weight) / Σ(weight present)\naction = score≥70 BUY · ≥55 HOLD · ≥40 WATCHLIST · ≥25 REDUCE · else AVOID\n+ tier guardrails (e.g. long-term missing fund → WATCHLIST)`}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-4">
                <motion.h2
                  variants={verdictScale}
                  initial="hidden"
                  animate="visible"
                  className={`font-display text-5xl md:text-6xl ${verdictStyle.accent}`}
                >
                  {displayVerdict}
                </motion.h2>
                <motion.div variants={tierBadgeSlide} initial="hidden" animate="visible">
                  <Badge variant="outline" className={`text-xs ${verdictStyle.chip}`}>{TIER_LABEL[tier]}</Badge>
                </motion.div>
              </div>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-foreground/85">{final_verdict.summary_reason}</p>
              <p className="mt-3 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Based on tier-aware analysis · model {audit_meta.verdict_model_version}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl border border-border/60 bg-background/70 px-6 py-5 backdrop-blur">
              <div className="flex items-center gap-1.5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</p>
                <ConfidenceInfo audit={audit_meta} />
              </div>
              <p className="font-display text-5xl tabular-nums text-foreground">
                <AnimatedNumber value={final_verdict.confidence_pct} duration={900} decimals={0} />
                <span className="text-2xl text-muted-foreground">%</span>
              </p>
              {audit_meta.confidence_band && (
                <p className="mt-1 max-w-[180px] text-center text-[11px] leading-tight text-muted-foreground">
                  {audit_meta.confidence_band}
                </p>
              )}
            </div>
          </div>
        </motion.section>

        {/* ═══ 3. CONFIDENCE / RISK / REWARD TRIAD ═══ */}
        <motion.section variants={gridContainer} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <TriadCard
            icon={Gauge}
            eyebrow="Confidence"
            value={<><AnimatedNumber value={final_verdict.confidence_pct} decimals={0} duration={800} />%</>}
            sub={audit_meta.confidence_band ?? "Model conviction"}
            info={<ConfidenceInfo audit={audit_meta} />}
          />
          <TriadCard
            icon={ShieldCheck}
            eyebrow="Risk profile"
            value={labelize(final_verdict.risk_label)}
            sub={`Score ${score_breakdown.risk_score ?? DASH}${score_breakdown.risk_score != null ? " / 100" : ""}`}
            info={
              <InfoTip
                title="Risk profile"
                body={
                  <>
                    <p>A 0–100 reading of the stock's risk character. Higher = lower realised risk.</p>
                    <p className="italic">Blends beta, 1Y volatility, Sharpe/Sortino, max drawdown, VaR-95 and liquidity.</p>
                  </>
                }
              />
            }
          />
          <TriadCard
            icon={Target}
            eyebrow="Reward potential"
            value={rr != null ? `${rr.toFixed(2)} : 1 R:R` : DASH}
            sub={rr != null && riskRupee != null && rewardRupee != null
              ? `Risk ₹${riskRupee.toLocaleString("en-IN")} / Reward ₹${rewardRupee.toLocaleString("en-IN")} per share`
              : "Insufficient levels — entry, stop loss or target unavailable"}
            info={
              <InfoTip
                title="Reward potential (R:R)"
                body={
                  <>
                    <p>Ratio of expected upside to defined downside on the proposed trade plan.</p>
                    <p className="italic">A 2:1 setup means a winner pays twice what a loss costs.</p>
                  </>
                }
                formula={`reward = |target_1 - entry|\nrisk   = |entry - stop_loss|\nR:R    = reward / risk`}
              />
            }
          />

        </motion.section>

        {/* ═══ 4 + 5. SCORE RING + BREAKDOWN ═══ */}
        {report_modules.show_score_ring && (
          <motion.section variants={sectionFadeUp} className="rounded-2xl border border-border bg-card px-6 py-7">
            <div className="mb-4 flex items-start justify-between gap-3">
              <SectionTitle eyebrow="Composite score" title="Stockera Score & Pillars" icon={BarChart3} />
              <MethodologyChip tier={tier} weights={weights} />
            </div>
            <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
              <ScoreRing score={final_verdict.overall_score} action={final_verdict.action} />
              <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} className="space-y-3">
                {SECTION_ORDER[tier].map((k) => {
                  const map: Record<typeof k, { label: string; key: keyof ScoreBreakdown; methodology: string }> = {
                    technical:   { label: "Technical",   key: "technical_score",   methodology: PILLAR_METHODOLOGY.technical },
                    fundamental: { label: "Fundamental", key: "fundamental_score", methodology: PILLAR_METHODOLOGY.fundamental },
                    risk:        { label: "Risk",        key: "risk_score",        methodology: PILLAR_METHODOLOGY.risk },
                    momentum:    { label: "Momentum",    key: "momentum_score",    methodology: PILLAR_METHODOLOGY.momentum },
                  };
                  const m = map[k];
                  const s = score_breakdown[m.key];
                  return (
                    <motion.div key={k} variants={innerStaggerItem}>
                      <ScoreBar
                        label={m.label}
                        value={s ?? null}
                        weighted={(weights[k] ?? 0) >= 0.25}
                        pulse={pulsePillars.has(k)}
                        methodology={m.methodology}
                      />
                    </motion.div>
                  );
                })}
                <motion.div variants={innerStaggerItem}>
                  <ScoreBar
                    label="Sentiment"
                    value={score_breakdown.sentiment_score ?? null}
                    weighted={(weights.sentiment ?? 0) >= 0.15}
                    methodology={PILLAR_METHODOLOGY.sentiment}
                    note={
                      score_breakdown.sentiment_score == null
                        ? (query_context.include_news
                            ? "Sentiment data unavailable for this stock"
                            : "Sentiment not included in this view")
                        : undefined
                    }
                  />
                </motion.div>
                <p className="pt-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  <span className="inline-block h-1 w-1 rounded-full bg-accent align-middle" /> tier-weighted pillar for {TIER_LABEL[tier].toLowerCase()}
                </p>
              </motion.div>
            </div>
          </motion.section>
        )}

        {/* ═══ 6. 4-CARD METRIC GRID ═══ */}
        <motion.section
          variants={gridContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          className="grid gap-4 md:grid-cols-2"
        >
          {SECTION_ORDER[tier].map((kind) => {
            if (kind === "technical") {
              return (
                <DimensionCard key={kind} eyebrow="Trend & technicals" title="Technical pulse" icon={LineChart} score={score_breakdown.technical_score}>
                  <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-3 gap-3">
                    <Metric label="RSI(14)" value={<AnimatedNumber value={technical_snapshot.rsi} decimals={2} duration={700} />} tone={technical_snapshot.rsi != null && (technical_snapshot.rsi > 70 || technical_snapshot.rsi < 30) ? "text-amber-700" : ""} />
                    <Metric label="MACD" value={labelize(technical_snapshot.macd_signal)} />
                    <Metric label="ADX" value={<AnimatedNumber value={technical_snapshot.adx} decimals={2} duration={700} />} />
                    <Metric label="Trend" value={labelize(technical_snapshot.trend_label)} />
                    <Metric label="EMA stack" value={labelize(technical_snapshot.ema_stack)} />
                    <Metric label="Bollinger" value={labelize(technical_snapshot.bollinger_position)} />
                  </motion.div>
                  <CardFootline tone={score_breakdown.technical_score} dim="technicals" />
                </DimensionCard>
              );
            }
            if (kind === "momentum") {
              return (
                <DimensionCard key={kind} eyebrow="Momentum" title="Momentum & strength" icon={Activity} score={score_breakdown.momentum_score}>
                  <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-3 gap-3">
                    <Metric label="RS vs NIFTY" value={momentum_snapshot.relative_strength_vs_nifty != null ? <AnimatedNumber value={momentum_snapshot.relative_strength_vs_nifty} decimals={2} suffix="%" signed duration={700} /> : DASH} />
                    <Metric label="Trend strength" value={labelize(momentum_snapshot.trend_strength)} />
                    <Metric label="Regime" value={labelize(momentum_snapshot.momentum_label)} />
                    {momentum_snapshot.volume_confirmation && (
                      <Metric label="Volume" value={labelize(momentum_snapshot.volume_confirmation)} />
                    )}
                  </motion.div>
                  <CardFootline tone={score_breakdown.momentum_score} dim="momentum" />
                </DimensionCard>
              );
            }
            if (kind === "fundamental") {
              return (
                <DimensionCard key={kind} eyebrow="Fundamentals" title="Quality & valuation" icon={Building2} score={score_breakdown.fundamental_score} muted={flags.banking_override_applied && (fundamental_snapshot.altman_z_score == null)}>
                  <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-3 gap-3">
                    <Metric label="P/E" value={<AnimatedNumber value={fundamental_snapshot.pe_ratio} decimals={2} duration={700} />} />
                    <Metric label="ROE" value={fundamental_snapshot.roe != null ? <AnimatedNumber value={fundamental_snapshot.roe} decimals={2} suffix="%" duration={700} /> : DASH} />
                    <Metric label="F-Score" value={fundamental_snapshot.piotroski_f_score != null ? `${fundamental_snapshot.piotroski_f_score}/9` : DASH} />
                    <Metric label="Altman Z" value={<AnimatedNumber value={fundamental_snapshot.altman_z_score} decimals={2} duration={700} />} hint={flags.banking_override_applied ? "Banks use regulatory CAR; Altman Z is not meaningful for financials." : undefined} />
                    <Metric label="DCF upside" value={fundamental_snapshot.dcf_upside_pct != null && fundamental_snapshot.dcf_upside_pct > -95 ? <AnimatedNumber value={fundamental_snapshot.dcf_upside_pct} decimals={1} suffix="%" signed duration={700} /> : DASH} />
                    <Metric label="Valuation" value={labelize(fundamental_snapshot.valuation_label)} />
                  </motion.div>
                  {flags.banking_override_applied && (
                    <p className="mt-3 text-[11px] italic text-muted-foreground">Banking sector — Altman Z & DCF de-emphasized; regulatory frameworks govern solvency.</p>
                  )}
                  <CardFootline tone={score_breakdown.fundamental_score} dim="fundamentals" />
                </DimensionCard>
              );
            }
            // risk
            return (
              <DimensionCard key={kind} eyebrow="Risk" title="Risk character" icon={ShieldCheck} score={score_breakdown.risk_score}>
                <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-3 gap-3">
                  <Metric label="Beta" value={<AnimatedNumber value={risk_snapshot.beta} decimals={2} duration={700} />} tone={riskTone("beta", risk_snapshot.beta)} />
                  <Metric label="Vol (1Y)" value={risk_snapshot.volatility_1y != null ? <AnimatedNumber value={risk_snapshot.volatility_1y} decimals={1} suffix="%" duration={700} /> : DASH} tone={riskTone("vol", risk_snapshot.volatility_1y)} />
                  <Metric label="Sharpe" value={<AnimatedNumber value={risk_snapshot.sharpe_ratio} decimals={2} duration={700} />} tone={riskTone("sharpe", risk_snapshot.sharpe_ratio)} />
                  <Metric label="Sortino" value={<AnimatedNumber value={risk_snapshot.sortino_ratio} decimals={2} duration={700} />} tone={riskTone("sortino", risk_snapshot.sortino_ratio)} />
                  <Metric label="Max DD" value={risk_snapshot.max_drawdown != null ? <AnimatedNumber value={risk_snapshot.max_drawdown} decimals={1} suffix="%" signed duration={700} /> : DASH} tone={riskTone("dd", risk_snapshot.max_drawdown)} />
                  <Metric label="Liquidity" value={labelize(risk_snapshot.liquidity_label)} />
                </motion.div>
                <CardFootline tone={score_breakdown.risk_score} dim="risk" />
              </DimensionCard>
            );
          })}
        </motion.section>

        {/* ═══ 7. WHAT TO DO NOW ═══ */}
        <motion.section variants={sectionFadeUp} className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="Action zone" title="What to do now" icon={Compass} />
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="holding">I'm holding</TabsTrigger>
              <TabsTrigger value="fresh">Fresh entry</TabsTrigger>
              <TabsTrigger value="exploring">Just exploring</TabsTrigger>
            </TabsList>
            <div className="mt-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  variants={tabContent}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <TabsContent value={activeTab} forceMount>
                    <ActionPanel action={final_verdict.action} mode={activeTab} tier={tier} levels={levels} />
                  </TabsContent>
                </motion.div>
              </AnimatePresence>
            </div>
          </Tabs>
        </motion.section>

        {/* ═══ 8. TRADE LEVELS ═══ */}
        <motion.section variants={sectionFadeUp} className="rounded-2xl border border-border bg-card px-6 py-7">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionTitle eyebrow="Trade levels" title="Key price zones" icon={Target} info={<InfoTip title="How trade levels are derived" body={<><p>Entry / stop / targets / supports / resistances come from the tier-aware trade-plan engine.</p><p className="italic">Validated against ATR, structural levels and a minimum R:R per tier.</p></>} />} />
            {tradePlanFromEngine && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="cursor-help border-emerald-500/40 bg-emerald-500/5 font-mono text-[10px] uppercase tracking-wider text-emerald-700">
                    <ShieldCheck className="mr-1 h-3 w-3" /> Validated by Stockera Engine
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Trade plan validated by tier-aware engine with mandatory R:R, ATR and structural checks.</TooltipContent>
              </Tooltip>
            )}
          </div>
          <PriceBand levels={levels} current={price_context.current_price} />
          <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-4">
            <LevelCell label="Entry" value={levels.entry_zone} tone="text-primary" reason={tradePlanReasons.entry_zone} />
            <LevelCell label="Stop loss" value={levels.stop_loss} tone="text-red-700" reason={tradePlanReasons.stop_loss} />
            <LevelCell label="Target 1" value={levels.target_1} tone="text-emerald-700" reason={tradePlanReasons.target_1} />
            <LevelCell label="Target 2" value={levels.target_2} tone="text-emerald-700" reason={tradePlanReasons.target_2} />
            <LevelCell label="Support 1" value={levels.support_1} reason={tradePlanReasons.support_1} />
            <LevelCell label="Support 2" value={levels.support_2} reason={tradePlanReasons.support_2} />
            <LevelCell label="Resistance 1" value={levels.resistance_1} reason={tradePlanReasons.resistance_1} />
            <LevelCell label="Resistance 2" value={levels.resistance_2} reason={tradePlanReasons.resistance_2} />
          </motion.div>
          {highVol && (
            <motion.p variants={nudgeReveal} className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>High-volatility stock — wider stop loss recommended, smaller position size advised.</span>
            </motion.p>
          )}
        </motion.section>


        {/* ═══ 9. RETURNS SNAPSHOT ═══ */}
        {report_modules.show_returns_strip && (
          <motion.section variants={sectionFadeUp} className="rounded-2xl border border-border bg-card px-6 py-7">
            <SectionTitle eyebrow="Performance" title="Returns snapshot" icon={TrendingUp} info={<InfoTip title="Returns snapshot" body={<><p>Trailing total-return % over 1W / 1M / 3M / 1Y, plus relative performance vs NIFTY for 1M and 3M.</p><p className="italic">Computed from adjusted close prices.</p></>} />} />
            <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-2 gap-2 md:grid-cols-6">
              <ReturnChip label="1W" value={returns_snapshot.one_week} />
              <ReturnChip label="1M" value={returns_snapshot.one_month} />
              <ReturnChip label="3M" value={returns_snapshot.three_month} />
              <ReturnChip label="1Y" value={returns_snapshot.one_year} />
              <ReturnChip label="vs NIFTY 1M" value={returns_snapshot.vs_nifty_one_month} />
              <ReturnChip label="vs NIFTY 3M" value={returns_snapshot.vs_nifty_three_month} />
            </motion.div>
          </motion.section>
        )}

        {/* ═══ 10. FUNDAMENTAL DEEP-DIVE ═══ */}
        <motion.section variants={sectionFadeUp} className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="Fundamental analysis" title="Quality of business & valuation" icon={Building2} />
          <p className="mb-5 max-w-3xl leading-relaxed text-foreground/85">
            {fundamentalProse(fundamental_snapshot, flags.banking_override_applied)}
          </p>
          <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
            <Metric label="P/E ratio" value={<AnimatedNumber value={fundamental_snapshot.pe_ratio} decimals={2} duration={700} />} hint="Price relative to earnings; sector context matters." />
            <Metric label="Return on equity" value={fundamental_snapshot.roe != null ? <AnimatedNumber value={fundamental_snapshot.roe} decimals={2} suffix="%" duration={700} /> : DASH} />
            <Metric label="Piotroski F-Score" value={fundamental_snapshot.piotroski_f_score != null ? `${fundamental_snapshot.piotroski_f_score} / 9` : DASH} hint="0–9 quality score: 7+ is strong, 3 or less is weak." />
            <Metric label="Altman Z-Score" value={<AnimatedNumber value={fundamental_snapshot.altman_z_score} decimals={2} duration={700} />} hint="Bankruptcy risk: >2.99 safe, 1.81–2.99 grey, <1.81 distress. Not meaningful for banks." />
            <Metric label="DCF upside" value={fundamental_snapshot.dcf_upside_pct != null && fundamental_snapshot.dcf_upside_pct > -95 ? <AnimatedNumber value={fundamental_snapshot.dcf_upside_pct} decimals={1} suffix="%" signed duration={700} /> : DASH} hint="Discounted-cash-flow intrinsic value vs current price." />
            <Metric label="Valuation tag" value={labelize(fundamental_snapshot.valuation_label)} />
          </motion.div>
          {flags.banking_override_applied && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-900">
              Banking-sector override: solvency assessed via regulatory CAR rather than Altman Z, and DCF is replaced by dividend-discount frameworks in deeper analyst review.
            </div>
          )}
        </motion.section>

        {/* ═══ 11. TECHNICAL DEEP-DIVE ═══ */}
        <motion.section variants={sectionFadeUp} className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="Technical analysis" title="Trend, momentum & structure" icon={LineChart} />
          <p className="mb-5 max-w-3xl leading-relaxed text-foreground/85">
            {technicalProse(technical_snapshot)}
          </p>
          <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
            <Metric label="RSI (14)" value={<AnimatedNumber value={technical_snapshot.rsi} decimals={2} duration={700} />} hint="Overbought >70, oversold <30." />
            <Metric label="MACD signal" value={labelize(technical_snapshot.macd_signal)} />
            <Metric label="ADX (trend strength)" value={<AnimatedNumber value={technical_snapshot.adx} decimals={2} duration={700} />} hint=">25 indicates a trending market." />
            <Metric label="Trend direction" value={labelize(technical_snapshot.trend_label)} />
            <Metric label="EMA stack" value={labelize(technical_snapshot.ema_stack)} hint="Stacked EMAs (20>50>200) signal trend alignment." />
            <Metric label="Bollinger band" value={labelize(technical_snapshot.bollinger_position)} />
          </motion.div>
        </motion.section>

        {/* ═══ 12. RISK RADAR ═══ */}
        <motion.section variants={sectionFadeUp} className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="Risk radar" title="What could go wrong" icon={AlertTriangle} />
          <p className="mb-5 max-w-3xl leading-relaxed text-foreground/85">
            {riskProse(risk_snapshot)}
          </p>
          <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
            <Metric label="Beta" value={<AnimatedNumber value={risk_snapshot.beta} decimals={2} duration={700} />} tone={riskTone("beta", risk_snapshot.beta)} hint="Sensitivity to NIFTY; >1 amplifies market moves." />
            <Metric label="Annualized volatility" value={risk_snapshot.volatility_1y != null ? <AnimatedNumber value={risk_snapshot.volatility_1y} decimals={1} suffix="%" duration={700} /> : DASH} tone={riskTone("vol", risk_snapshot.volatility_1y)} />
            <Metric label="Sharpe ratio" value={<AnimatedNumber value={risk_snapshot.sharpe_ratio} decimals={2} duration={700} />} tone={riskTone("sharpe", risk_snapshot.sharpe_ratio)} hint="Risk-adjusted return vs risk-free rate." />
            <Metric label="Sortino ratio" value={<AnimatedNumber value={risk_snapshot.sortino_ratio} decimals={2} duration={700} />} tone={riskTone("sortino", risk_snapshot.sortino_ratio)} hint="Penalises only downside volatility." />
            <Metric label="Max drawdown" value={risk_snapshot.max_drawdown != null ? <AnimatedNumber value={risk_snapshot.max_drawdown} decimals={1} suffix="%" signed duration={700} /> : DASH} tone={riskTone("dd", risk_snapshot.max_drawdown)} />
            <Metric label="VaR 95%" value={risk_snapshot.var_95 != null ? <AnimatedNumber value={risk_snapshot.var_95} decimals={2} suffix="%" signed duration={700} /> : DASH} tone={riskTone("var", risk_snapshot.var_95)} hint="Daily loss not expected to exceed in 95% of cases." />
          </motion.div>
          {flags.benchmark_fallback_used && (
            <p className="mt-4 text-[11px] italic text-muted-foreground">Benchmark fallback was applied for relative measures — interpret beta and RS with care.</p>
          )}
        </motion.section>

        {/* ═══ 13. MOMENTUM ═══ */}
        <motion.section variants={sectionFadeUp} className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="Momentum" title="Relative strength & regime" icon={Flame} />
          <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Metric label="RS vs NIFTY (3M)" value={momentum_snapshot.relative_strength_vs_nifty != null ? <AnimatedNumber value={momentum_snapshot.relative_strength_vs_nifty} decimals={2} suffix="%" signed duration={700} /> : DASH} />
            <Metric label="Trend strength" value={labelize(momentum_snapshot.trend_strength)} />
            <Metric label="Regime" value={labelize(momentum_snapshot.momentum_label)} />
            {momentum_snapshot.volume_confirmation
              ? <Metric label="Volume" value={labelize(momentum_snapshot.volume_confirmation)} />
              : <Metric label="Volume" value={DASH} hint="Volume confirmation not available for this period." />}
          </motion.div>
        </motion.section>

        {/* ═══ 14. NEWS & SENTIMENT ═══ */}
        <motion.section variants={sectionFadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="News & sentiment" title="Narrative pulse" icon={Newspaper} />
          {report_modules.show_news_widget && sentiment_snapshot.news_sentiment_score != null ? (
            <div className="grid items-start gap-6 md:grid-cols-[auto_1fr]">
              <div className="rounded-xl border border-border bg-background/60 px-5 py-4 text-center">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Sentiment</p>
                <p className="mt-1 font-display text-3xl tabular-nums">
                  <AnimatedNumber value={sentiment_snapshot.news_sentiment_score} decimals={0} duration={800} />
                </p>
                <Badge variant="outline" className="mt-2 text-[10px]">{labelize(sentiment_snapshot.sentiment_label)}</Badge>
              </div>
              <div className="space-y-3">
                <Metric label="Articles (30d)" value={<AnimatedNumber value={sentiment_snapshot.article_count} decimals={0} duration={700} />} />
                {sentiment_snapshot.top_news_driver && (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Top driver</p>
                    <p className="mt-1 text-sm italic text-foreground/85">"{sentiment_snapshot.top_news_driver}"</p>
                  </div>
                )}
                {flags.news_data_limited && (
                  <p className="text-[11px] italic text-muted-foreground">News coverage is sparse for this window — treat sentiment as directional, not decisive.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-5 py-4">
              <Eye className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">News & sentiment not included in this view</p>
                <p className="text-[11px] text-muted-foreground">{query_context.include_news ? "Insufficient recent coverage to compute a sentiment score." : "Sentiment was excluded at request time."}</p>
              </div>
            </div>
          )}
        </motion.section>

        {/* ═══ 15. BEHAVIORAL FINANCE ALERT ═══ */}
        {nudge && (
          <motion.section
            variants={nudgeReveal}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/10 to-gold/5 px-6 py-5"
          >
            <div className="flex items-start gap-3">
              <Brain className="mt-0.5 h-5 w-5 text-[hsl(var(--gold-foreground))]" />
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--gold-foreground))]">Behavioral nudge</p>
                <h3 className="mt-0.5 font-display text-lg text-foreground">{nudge.title}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-foreground/85">{nudge.body}</p>
              </div>
            </div>
          </motion.section>
        )}

        {/* ═══ 16. STOCKS IN FOCUS (scaffolded) ═══ */}
        <motion.section variants={sectionFadeUp} className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-7">
          <SectionTitle eyebrow="Also consider" title="Peers in the same sector" icon={Sparkles} />
          {report_modules.show_stocks_in_focus ? (
            <p className="text-sm text-muted-foreground">Loading peer set…</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Peer comparison rolling out in the next release — we'll surface 3 alternative names in {stock.sector || "this sector"} with side-by-side scores.</p>
          )}
        </motion.section>

        {/* ═══ 17. SUMMARY RECOMMENDATION ═══ */}
        <motion.section variants={sectionFadeUp} className="rounded-2xl border border-border bg-gradient-brand-soft px-6 py-7 text-white">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">In summary</p>
          <h2 className="mt-1 font-display text-2xl">Analyst-style recap</h2>
          <ol className="mt-4 max-w-3xl space-y-2 text-[15px] leading-relaxed text-white/95">
            <li><span className="font-mono text-white/60">01 ·</span> Final view: <strong>{displayVerdict}</strong> with {final_verdict.confidence_pct}% confidence on a {final_verdict.time_horizon.toLowerCase()} horizon.</li>
            <li><span className="font-mono text-white/60">02 ·</span> {recapDriverLine(score_breakdown, tier)}</li>
            <li><span className="font-mono text-white/60">03 ·</span> Risk profile is <strong>{labelize(final_verdict.risk_label)}</strong>{rr != null ? ` — current setup offers ${rr.toFixed(2)}:1 reward-to-risk` : ""}.</li>
          </ol>
        </motion.section>

        {/* ═══ 18. AUDIT & TRUST FOOTER ═══ */}
        <motion.footer
          variants={footerFade}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="rounded-2xl border border-border bg-muted/30 px-6 py-5 text-[11px] text-muted-foreground"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-mono uppercase tracking-wider">Curated by Stockera · {audit_meta.formula_version} · {audit_meta.verdict_model_version}</p>
              <p>Generated {fmtDate(as_of_date)} IST · Tier applied: {TIER_LABEL[tier]}</p>
              <p>
                Modules:{" "}
                {audit_meta.source_trace.map((t, i) => (
                  <span key={t.module} className="inline-flex items-center gap-1">
                    {i > 0 && <span>·</span>}
                    {t.ok ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-amber-600" />}
                    {t.module.replace("compute-", "")}
                  </span>
                ))}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]"><ShieldCheck className="mr-1 h-3 w-3" /> SEBI-aligned</Badge>
          </div>
          <p className="mt-3 border-t border-border/60 pt-3 leading-relaxed">
            This is an AI-generated educational analysis, not personalised SEBI investment advice. A SEBI-Registered Research Analyst follows up with a personalised video opinion within 24 hours. Markets carry risk; please read all scheme-related documents carefully.
          </p>
        </motion.footer>
        {/* Browserless waits for this marker before snapshotting. */}
        {printMode && <div id="print-ready" data-print-ready="1" />}
      </motion.article>
    </TooltipProvider>
  );

  if (printMode) {
    return <MotionConfig reducedMotion="always">{content}</MotionConfig>;
  }
  return content;
}


// ─────────────────────────────────────────────────────────────────
// Small composed components & prose generators
// ─────────────────────────────────────────────────────────────────

function MethodologyChip({ tier, weights }: { tier: QueryType; weights: Record<string, number> }) {
  const rows: Array<{ key: keyof typeof PILLAR_METHODOLOGY; label: string }> = [
    { key: "technical",   label: "Technical" },
    { key: "fundamental", label: "Fundamental" },
    { key: "risk",        label: "Risk" },
    { key: "momentum",    label: "Momentum" },
    { key: "sentiment",   label: "Sentiment" },
  ];
  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground">
        <Info className="h-3 w-3" /> How this is calculated
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] text-xs leading-snug">
        <p className="mb-2 font-display text-sm text-foreground">Stockera Score methodology</p>
        <p className="mb-3 text-muted-foreground">
          Each pillar is scored 0–100 by a deterministic compute module. The composite is a
          tier-weighted average — weights below are tuned for the <span className="font-semibold text-foreground">{TIER_LABEL[tier].toLowerCase()}</span>.
        </p>
        <ul className="space-y-2">
          {rows.map((r) => {
            const w = weights[r.key] ?? 0;
            return (
              <li key={r.key} className="flex gap-2">
                <span className="mt-0.5 inline-block w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {r.label}
                  <span className="ml-1 text-foreground/70">{Math.round(w * 100)}%</span>
                </span>
                <span className="text-muted-foreground">{PILLAR_METHODOLOGY[r.key]}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 border-t border-border pt-2 text-[10px] text-muted-foreground">
          Final action (Buy / Hold / Watchlist / Reduce / Avoid) layers tier guardrails on top of the composite.
        </p>
      </PopoverContent>
    </Popover>
  );
}


function TriadCard({ icon: Icon, eyebrow, value, sub, info }: { icon: React.ComponentType<{ className?: string }>; eyebrow: string; value: React.ReactNode; sub: string; info?: React.ReactNode }) {
  return (
    <motion.div
      variants={cardItem}
      whileHover={{ y: -2 }}
      transition={{ duration: duration.fast, ease: ease.standard }}
      className="rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-accent/50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
          {info}
        </div>
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <p className="mt-2 font-display text-2xl text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </motion.div>
  );
}

// "How confidence is calculated" — surfaces the 5-factor breakdown from audit_meta.
function ConfidenceInfo({ audit }: { audit: StockAnalysisPayload["audit_meta"] }) {
  const b = audit.confidence_breakdown;
  return (
    <InfoTip
      title="How confidence is calculated"
      body={
        <>
          <p>Confidence is a 0–100 reading of how trustworthy this verdict is, built from five deterministic signals:</p>
          <ol className="ml-4 list-decimal space-y-0.5">
            <li>How well the pillars <strong>agree</strong> on direction</li>
            <li>How <strong>strong</strong> the signals are (distance from neutral)</li>
            <li>How <strong>stable</strong> the stock is (volatility & drawdown)</li>
            <li>How <strong>complete</strong> the underlying data is</li>
            <li>How well-<strong>covered</strong> the stock is in recent news</li>
          </ol>
          {b && (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 rounded bg-muted/40 px-2 py-1.5 font-mono text-[10px] text-foreground/80">
              <span>Alignment</span><span className="text-right">{b.alignment} / 40</span>
              <span>Strength</span><span className="text-right">{b.strength} / 25</span>
              <span>Stability</span><span className="text-right">{b.stability} / 15</span>
              <span>Data quality</span><span className="text-right">{b.data_quality} / 10</span>
              <span>Coverage</span><span className="text-right">{b.coverage} / 10</span>
              <span className="border-t border-border pt-0.5">Total</span>
              <span className="border-t border-border pt-0.5 text-right">{b.raw_total} → <strong>{b.clamped}</strong></span>
            </div>
          )}
          {audit.confidence_band && (
            <p className="italic">Band: {audit.confidence_band}</p>
          )}
        </>
      }
      formula={`alignment (≤40) + strength (≤25) + stability (≤15)\n+ data_quality (≤10) + coverage (≤10)\n→ clamp [10, 95]\n80+ High · 60–79 Moderate · 40–59 Cautious · <40 Low`}
    />
  );
}

function DimensionCard({
  eyebrow, title, icon: Icon, score, muted, children,
}: { eyebrow: string; title: string; icon: React.ComponentType<{ className?: string }>; score: number | null; muted?: boolean; children: React.ReactNode }) {
  const tone = SCORE_TONE(score);
  return (
    <motion.div
      variants={cardItem}
      whileHover={{ y: -2, scale: 1.003 }}
      transition={{ duration: duration.fast, ease: ease.standard }}
      className={`rounded-2xl border border-border bg-card px-5 py-5 transition-colors hover:border-accent/50 ${muted ? "opacity-90" : ""}`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-accent" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
            <h3 className="font-display text-lg text-foreground leading-tight">{title}</h3>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-display text-2xl tabular-nums ${tone.color}`}>
            {score == null ? DASH : <AnimatedNumber value={score} decimals={0} duration={700} />}
          </p>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{tone.label}</p>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

function CardFootline({ tone, dim }: { tone: number | null; dim: string }) {
  const t = SCORE_TONE(tone);
  return (
    <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${t.color === "text-emerald-700" ? "bg-emerald-500" : t.color === "text-amber-700" ? "bg-amber-500" : t.color === "text-rose-700" ? "bg-rose-500" : "bg-muted-foreground"} align-middle`} />{" "}
      {t.label === "no data" ? `Insufficient data on ${dim}.` : `${t.label[0].toUpperCase() + t.label.slice(1)} ${dim} reading.`}
    </p>
  );
}

function LevelCell({ label, value, tone, reason }: { label: string; value: number | null; tone?: string; reason?: string }) {
  const copy = value == null ? omissionCopy(reason) : null;
  return (
    <motion.div
      variants={innerStaggerItem}
      whileHover={{ y: -1 }}
      transition={{ duration: duration.fast, ease: ease.standard }}
      className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 transition-colors hover:border-accent/50"
    >
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
      {value == null && copy ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="flex cursor-help items-center gap-1 font-display text-lg text-muted-foreground decoration-dotted underline-offset-4 hover:underline">
              {DASH}
              <Info className="h-3 w-3 opacity-60" aria-hidden />
            </p>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">
            <p className="leading-snug">{copy.friendly}</p>
            <p className="mt-1.5 border-t border-border/40 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Why? <span className="normal-case text-foreground/70">{copy.raw}</span>
            </p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <p className={`font-display text-lg tabular-nums ${tone || "text-foreground"}`}>{fmtPrice(value)}</p>
      )}
    </motion.div>
  );
}


function ActionPanel({ action, mode, tier, levels }: {
  action: VerdictAction; mode: "holding" | "fresh" | "exploring"; tier: QueryType; levels: StockAnalysisPayload["levels"];
}) {
  const verb = VERDICT_STYLES[action].label;
  let statement = "";
  const bullets: string[] = [];
  const triggers: string[] = [];

  if (mode === "holding") {
    statement = action === "BUY" || action === "HOLD"
      ? `Stay with the position — current data supports continuing to hold.`
      : action === "WATCHLIST"
      ? `Hold with discipline — define an exit level rather than acting reactively.`
      : `Trim or exit on strength — the setup no longer favours continued holding.`;
    bullets.push("Re-validate your original thesis against the latest scores.", "Right-size, don't double down on a weakening setup.");
    if (levels.stop_loss != null) triggers.push(`Re-evaluate decisively below ${fmtPrice(levels.stop_loss)}.`);
    if (levels.target_1 != null) triggers.push(`Consider partial profits near ${fmtPrice(levels.target_1)}.`);
  } else if (mode === "fresh") {
    statement = action === "BUY"
      ? `Constructive setup for a fresh, defined-risk entry.`
      : action === "HOLD"
      ? `Wait for a cleaner entry — the current setup is borderline.`
      : action === "WATCHLIST"
      ? `Add to watchlist — wait for an explicit confirmation trigger before entering.`
      : `Avoid initiating a fresh position here.`;
    if (levels.entry_zone != null) bullets.push(`Reference entry around ${fmtPrice(levels.entry_zone)}.`);
    if (levels.stop_loss != null) bullets.push(`Predefined stop near ${fmtPrice(levels.stop_loss)}.`);
    if (levels.target_1 != null) triggers.push(`First objective: ${fmtPrice(levels.target_1)}.`);
    if (tier === "intraday") triggers.push("Confirm with intraday volume before committing.");
  } else {
    statement = `Educational view — no action recommended without your own due diligence.`;
    bullets.push("Read the technical and fundamental sections below for context.", "Compare against 1–2 peers in the same sector before forming a view.");
    triggers.push("Post a query to your SEBI-registered analyst for a personalised opinion.");
  }
  return (
    <div className="grid gap-5 md:grid-cols-3">
      <div className="md:col-span-2 space-y-3">
        <p className="text-[15px] leading-relaxed text-foreground"><strong>{verb}. </strong>{statement}</p>
        <ul className="space-y-2">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground/85"><span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{b}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Triggers to watch</p>
        <ul className="mt-2 space-y-1.5 text-[13px]">
          {triggers.length > 0 ? triggers.map((t, i) => <li key={i} className="text-foreground/85">· {t}</li>) : <li className="italic text-muted-foreground">No explicit price triggers — re-check after the next session close.</li>}
        </ul>
      </div>
    </div>
  );
}

// Deterministic prose generators (no LLM, no randomness)
function fundamentalProse(f: StockAnalysisPayload["fundamental_snapshot"], banking: boolean): string {
  if (banking) {
    return `Financial-sector business — quality is governed by capital adequacy, asset quality and ROE rather than industrial-style Altman/DCF frameworks. ROE of ${fmtPct(f.roe)} and a P/E of ${fmtNum(f.pe_ratio)} frame the valuation context; Piotroski stands at ${f.piotroski_f_score ?? DASH}/9.`;
  }
  const peTag = f.valuation_label ? `Valuation reads as ${labelize(f.valuation_label).toLowerCase()}.` : "";
  const fzTag = f.piotroski_f_score != null ? ` Piotroski F-Score at ${f.piotroski_f_score}/9 ${f.piotroski_f_score >= 7 ? "signals high-quality fundamentals" : f.piotroski_f_score <= 3 ? "flags deteriorating fundamentals" : "indicates middling quality"}.` : "";
  const zTag = f.altman_z_score != null ? ` Altman Z at ${fmtNum(f.altman_z_score)} ${f.altman_z_score > 2.99 ? "places solvency in the safe zone" : f.altman_z_score > 1.81 ? "is in the grey zone" : "warrants caution on solvency"}.` : "";
  return `P/E of ${fmtNum(f.pe_ratio)} with ROE of ${fmtPct(f.roe)} frames the quality of compounding. ${peTag}${fzTag}${zTag}`.trim();
}
function technicalProse(t: StockAnalysisPayload["technical_snapshot"]): string {
  const rsiTag = t.rsi != null ? `RSI at ${fmtNum(t.rsi, 0)} ${t.rsi > 70 ? "is in overbought territory" : t.rsi < 30 ? "is in oversold territory" : "is neutral"}.` : "";
  const macdTag = t.macd_signal ? ` MACD reads ${labelize(t.macd_signal).toLowerCase()}.` : "";
  const emaTag = t.ema_stack ? ` EMA stack is ${labelize(t.ema_stack).toLowerCase().replace(" stack", "")}.` : "";
  const adxTag = t.adx != null ? ` ADX at ${fmtNum(t.adx, 0)} ${t.adx > 25 ? "confirms a trending regime" : "suggests a range-bound regime"}.` : "";
  return `${rsiTag}${macdTag}${emaTag}${adxTag}`.trim() || "Technical signals are inconclusive at this window.";
}
function riskProse(r: StockAnalysisPayload["risk_snapshot"]): string {
  const betaTag = r.beta != null ? `Beta of ${fmtNum(r.beta)} ${r.beta > 1.2 ? "amplifies market moves" : r.beta < 0.8 ? "dampens market moves" : "moves broadly in line with NIFTY"}.` : "";
  const volTag = r.volatility_1y != null ? ` Annualised volatility sits at ${fmtPct(r.volatility_1y, 1)}.` : "";
  const ddTag = r.max_drawdown != null ? ` Worst peak-to-trough drawdown was ${fmtPct(r.max_drawdown, 1)} — historically, this is the kind of loss the position can absorb before structurally breaking.` : "";
  const sharpeTag = r.sharpe_ratio != null ? ` Sharpe of ${fmtNum(r.sharpe_ratio)} ${r.sharpe_ratio > 1 ? "indicates strong risk-adjusted returns" : r.sharpe_ratio < 0 ? "indicates poor risk-adjusted returns" : "is middling"}.` : "";
  return `${betaTag}${volTag}${sharpeTag}${ddTag}`.trim() || "Risk metrics are limited for this window.";
}
function recapDriverLine(s: ScoreBreakdown, tier: QueryType): string {
  const order: Array<[keyof ScoreBreakdown, string]> =
    tier === "intraday"   ? [["technical_score","technicals"],["momentum_score","momentum"],["risk_score","risk profile"]] :
    tier === "long-term"  ? [["fundamental_score","business quality"],["risk_score","risk profile"],["technical_score","technical structure"]] :
                             [["technical_score","technicals"],["fundamental_score","fundamentals"],["risk_score","risk profile"]];
  const driver = order.find(([k]) => (s[k] ?? 0) >= 50);
  if (driver) return `Primary driver is ${driver[1]} (score ${s[driver[0]]}); secondary pillars frame the conviction.`;
  const weakest = order.reduce((a, b) => (s[a[0]] ?? 100) < (s[b[0]] ?? 100) ? a : b);
  return `No single pillar carries the call; weakest factor is ${weakest[1]} (${s[weakest[0]] ?? DASH}), which caps the confidence.`;
}
