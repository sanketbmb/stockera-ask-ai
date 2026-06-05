// Stockera Brain v2 — God-tier Stock Analysis Report
// Renders the orchestrator JSON contract from `generate-stock-analysis`.
// Premium, editorial, tier-aware. No backend logic, pure presentation.
// Motion layer: framer-motion + useCountUp. Honors prefers-reduced-motion.

import { useMemo } from "react";
import {
  Activity, AlertTriangle, BarChart3, Brain, Building2, Calendar, CheckCircle2,
  Clock, Compass, Eye, Gauge, HelpCircle, Info, LineChart, Newspaper,
  ShieldCheck, Sparkles, Target, TrendingDown, TrendingUp, Waves,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion, useInView, MotionConfig } from "framer-motion";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  StockAnalysisPayload, VerdictAction, QueryType, ScoreBreakdown, AuditMeta,
  IntradayMicrostructureSnapshot, LongTermQualitySnapshot,
} from "@/types/stock-analysis";
import { AnimatedNumber, useCountUp } from "@/hooks/useCountUp";
import { omissionCopy } from "@/lib/trade-plan-copy";
import { verdictUILabel, verdictRawLabel } from "@/lib/verdict-labels";

import { METRIC_COPY, type MetricCopy } from "@/lib/metric-copy";
import { getUpcomingCorporateActions, type UpcomingCorporateAction } from "@/lib/corporate-actions.functions";
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

// Neutral gray styling for INSUFFICIENT_DATA — never alarmist; never red.
const INSUFFICIENT_DATA_STYLE = {
  label: "Insufficient Data",
  ring:  "from-slate-400/20 to-slate-200/5",
  chip:  "bg-slate-500/10 text-slate-700 border-slate-400/40",
  accent:"text-slate-700",
  dot:   "bg-slate-500",
  stroke:"#64748b",
} as const;

const TIER_LABEL: Record<QueryType, string> = {
  "intraday": "Intraday view",
  "short-term": "Short-term swing view",
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
  "short-term":  ["technical", "momentum", "risk", "fundamental"],
  "medium-term": ["technical", "fundamental", "risk", "momentum"],
  "long-term":   ["fundamental", "risk", "technical", "momentum"],
};

// Tier-aware pulse: which pillars deserve the gentle one-shot emphasis.
const TIER_PULSE_PILLARS: Record<QueryType, Set<"technical" | "fundamental" | "risk" | "momentum">> = {
  "intraday":    new Set(["technical", "momentum"]),
  "short-term":  new Set(["technical", "momentum"]),
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

// Modules that are not relevant for a given tier — hidden from the audit
// footer module strip. The underlying source_trace (PDF JSON, DB audit) is
// untouched; this is a presentation-only filter.
const TIER_IRRELEVANT_MODULES: Record<QueryType, string[]> = {
  "intraday":    ["compute-long-term-quality"],
  "short-term":  ["compute-long-term-quality", "compute-intraday-microstructure"],
  "medium-term": ["compute-intraday-microstructure"],
  "long-term":   ["compute-intraday-microstructure"],
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

  // Phase 4C — zone-mode rendering. Render a translucent band between
  // entry_zone_lower/upper when the engine emits mode="zone" AND the band is
  // visually meaningful (≥0.5% wide vs preferred_entry). Otherwise the Entry
  // single dot stays exactly as before.
  const es = levels.entry_strategy ?? null;
  const zoneLo = es?.mode === "zone" ? es.entry_zone_lower : null;
  const zoneUp = es?.mode === "zone" ? es.entry_zone_upper : null;
  const zonePref = es?.mode === "zone" ? es.preferred_entry : null;
  const zoneWidePct = (zoneLo != null && zoneUp != null && zonePref != null && zonePref > 0)
    ? (zoneUp - zoneLo) / zonePref
    : 0;
  const showZoneBand = es?.mode === "zone" && zoneLo != null && zoneUp != null && zonePref != null && zoneWidePct >= 0.005;

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

  // When the zone band is shown, drop the single Entry dot (the band + a small
  // preferred-entry marker take its place). Otherwise keep Entry as today.
  const rawPoints = [
    { v: levels.support_2,    label: "S2" },
    { v: levels.support_1,    label: "S1" },
    { v: levels.stop_loss,    label: "SL" },
    ...(showZoneBand ? [] : [{ v: levels.entry_zone, label: "Entry" }]),
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

  // Zone-band geometry (Phase 4C). Position the translucent band between
  // entry_zone_lower/upper on the same horizontal scale as the markers, clamped
  // to the visible strip so wider zones do not bleed off.
  const xPct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));
  const bandLeft = showZoneBand ? xPct(zoneLo!) : 0;
  const bandRight = showZoneBand ? xPct(zoneUp!) : 0;
  const bandWidth = Math.max(0, bandRight - bandLeft);
  const prefX = showZoneBand ? xPct(zonePref!) : 0;

  return (
    <div ref={ref} className="relative my-6 h-24 print:h-24">
      {showZoneBand && (
        <div
          aria-label="Entry accumulation zone"
          className="absolute rounded-md bg-primary/20 ring-1 ring-primary/30"
          style={{
            left: `${bandLeft}%`,
            width: `${bandWidth}%`,
            top: "calc(50% - 12px)",
            height: "24px",
          }}
        />
      )}
      <motion.div
        className="absolute top-1/2 left-0 right-0 h-px origin-left bg-gradient-to-r from-rose-300 via-border to-emerald-300"
        variants={priceBandLine}
        initial={reduce ? "visible" : "hidden"}
        animate={inView ? "visible" : undefined}
      />
      {showZoneBand && (
        <div
          className="absolute -translate-x-1/2"
          style={{ left: `${prefX}%`, top: 0 }}
        >
          <div
            className="mx-auto h-3 w-3 rotate-45 bg-primary ring-2 ring-background"
            style={{ marginTop: "38px" }}
            aria-label={`Preferred entry ${fmtPrice(zonePref)}`}
          />
          <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center" style={{ top: "-2px" }}>
            <div className="font-mono text-[10px] uppercase text-primary">Entry</div>
            <div className="font-display text-xs tabular-nums">{fmtPrice(zonePref)}</div>
          </div>
        </div>
      )}
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

export function StockAnalysisReport({
  data,
  printMode = false,
  topBanner,
  addendum,
  suppressFreshTab = false,
  defaultActionTab,
}: {
  data: StockAnalysisPayload;
  printMode?: boolean;
  // Phase 1 slot props (Mission 1.5). All optional, render contract unchanged
  // when undefined. `topBanner` mounts above the header strip, `addendum`
  // mounts between section 14 (trade levels / what to do) and section 15
  // (behavioral nudge). Both must be PDF-safe — no motion dependence.
  topBanner?: React.ReactNode;
  addendum?: React.ReactNode;
  // Phase 2 — Existing Position / Averaging flows hide the Fresh entry tab
  // and force the holding default. PDF-safe; nothing else changes.
  suppressFreshTab?: boolean;
  defaultActionTab?: "holding" | "fresh" | "exploring";
}) {
  const {
    stock, query_context, final_verdict, score_breakdown, price_context,
    levels, returns_snapshot, technical_snapshot, fundamental_snapshot,
    risk_snapshot, momentum_snapshot, sentiment_snapshot, flags,
    report_modules, audit_meta, as_of_date,
  } = data;

  const tier = query_context.query_type;
  const isInsufficient = final_verdict.verdict_reason === "INSUFFICIENT_DATA";
  const verdictStyle = isInsufficient ? INSUFFICIENT_DATA_STYLE : VERDICT_STYLES[final_verdict.action];
  const nudge = useMemo(
    () => (isInsufficient ? null : behavioralNudge(final_verdict.action, tier, final_verdict.risk_label)),
    [isInsufficient, final_verdict.action, tier, final_verdict.risk_label],
  );
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
  const targetsMeta = audit_meta.targets_meta ?? null;

  const initialTab = defaultActionTab ?? (suppressFreshTab ? "holding" : "fresh");
  const [activeTab, setActiveTab] = useState<"holding" | "fresh" | "exploring">(initialTab);

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
  const displayVerdict = isInsufficient
    ? "Insufficient Data"
    : (printMode ? verdictRawLabel(final_verdict.action) : verdictUILabel(final_verdict.action));


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


        {topBanner}

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
              {isInsufficient ? (
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-foreground/85">
                  We don't have enough recent data to issue a reliable verdict for this horizon.
                </p>
              ) : (
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-foreground/85">{final_verdict.summary_reason}</p>
              )}
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

        {/* ═══ 6. TIER-SHAPED METRIC GRID ═══ */}
        <TierShapedGrid data={data} />


        {/* ═══ 7. WHAT TO DO NOW ═══ */}
        <motion.section variants={sectionFadeUp} className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="Action zone" title="What to do now" icon={Compass} />
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
            <TabsList className={`grid w-full ${suppressFreshTab ? "grid-cols-2" : "grid-cols-3"}`}>
              <TabsTrigger value="holding">I'm holding</TabsTrigger>
              {!suppressFreshTab && <TabsTrigger value="fresh">Fresh entry</TabsTrigger>}
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
            <div className="flex flex-wrap items-center gap-2">
              <HowTargetsComputedChip />
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
          </div>
          {targetsMeta?.sector_aggregate_source === "default_fallback" && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="mt-3 inline-flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-xs leading-relaxed text-amber-900 transition-colors hover:bg-amber-500/15">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Sector benchmarks unavailable — targets use generic defaults. Click to learn more.</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="max-w-sm text-xs leading-relaxed">
                <p className="font-semibold text-foreground">Why generic defaults?</p>
                <p className="mt-1 text-muted-foreground">
                  We could not match this stock's sector ("{targetsMeta.sector_used ?? "unknown"}") to our peer-group benchmark table.
                  Targets fall back to a market-average P/E ({"PE 22, PB 3"}) which is less precise than a true sector comp.
                </p>
                <p className="mt-2 text-muted-foreground">Interpret T1/T2 as directional, not precise.</p>
              </PopoverContent>
            </Popover>
          )}
          {targetsMeta && (targetsMeta.t1.method !== "dcf" || targetsMeta.t2.method !== "dcf") && (targetsMeta.t1.value != null || targetsMeta.t2.value != null) && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs leading-relaxed text-sky-900">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {targetsMeta.t1.value != null && targetsMeta.t1.method !== "dcf"
                  ? <>Target 1 derived from <strong>{TARGET_METHOD_COPY[targetsMeta.t1.method]?.short ?? targetsMeta.t1.method}</strong> (DCF unavailable or out of band).</>
                  : targetsMeta.t2.value != null && targetsMeta.t2.method !== "dcf"
                  ? <>Target 2 derived from <strong>{TARGET_METHOD_COPY[targetsMeta.t2.method]?.short ?? targetsMeta.t2.method}</strong>.</>
                  : null}
                {targetsMeta.sector_used && targetsMeta.sector_used !== "__default__" && <> Sector benchmark: <em>{targetsMeta.sector_used}</em>.</>}
              </span>
            </div>
          )}
          {targetsMeta?.guardrails.guardrail_breach && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Long-term targets omitted — {targetsMeta.guardrails.guardrail_breach}.</span>
            </div>
          )}
          <PriceBand levels={levels} current={price_context.current_price} />
          <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-4">
            <EntryZoneCell levels={levels} reason={tradePlanReasons.entry_zone} />
            <LevelCell label="Stop loss" value={levels.stop_loss} tone="text-red-700" reason={tradePlanReasons.stop_loss} footer={<SlMethodFooter method={targetsMeta?.sl_method ?? null} />} />
            <LevelCell label="Target 1" value={levels.target_1} tone="text-emerald-700" reason={tradePlanReasons.target_1} methodTip={<TargetMethodTip targetMeta={targetsMeta?.t1 ?? null} label="Target 1" sectorSource={targetsMeta?.sector_aggregate_source ?? null} sectorMethodVersion={targetsMeta?.sector_method_version ?? null} />} />
            <LevelCell label="Target 2" value={levels.target_2} tone="text-emerald-700" reason={tradePlanReasons.target_2} methodTip={<TargetMethodTip targetMeta={targetsMeta?.t2 ?? null} label="Target 2" sectorSource={targetsMeta?.sector_aggregate_source ?? null} sectorMethodVersion={targetsMeta?.sector_method_version ?? null} />} />
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
          {tier === "long-term" && levels.entry_strategy?.staggered_plan && levels.entry_strategy.staggered_plan.length > 0 && (
            <StaggeredPlanCard plan={levels.entry_strategy.staggered_plan} />
          )}
        </motion.section>






        {addendum}

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
                {audit_meta.source_trace
                  .filter((t) => !TIER_IRRELEVANT_MODULES[tier].includes(t.module))
                  .map((t, i) => (
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




const TARGET_METHOD_COPY: Record<string, { short: string; long: string }> = {
  dcf:                 { short: "DCF fair value",          long: "Discounted cash-flow intrinsic value per share." },
  sector_multiple:     { short: "Sector-multiple fair value", long: "Trailing EPS multiplied by the peer-group median P/E for the company's sector." },
  historical_multiple: { short: "Historical multiple",     long: "Trailing EPS multiplied by the stock's own 5-year average P/E." },
  vol_band:            { short: "Volatility-band drift",   long: "Spot multiplied by an expected 12-month drift (clamped to an 18–24% sector-aware band)." },
  none:                { short: "No method available",     long: "Every fallback in the hierarchy failed; target omitted." },
};

const SL_METHOD_COPY: Record<string, string> = {
  vol_adaptive: "Tightened to match this stock's volatility",
  dma200_anchor: "Anchored 8% below the 200-day moving average",
  max_distance_cap: "Capped at 20% from spot (max long-term loss tolerance)",
  min_distance_floor: "Floored at 10% from spot (avoids noise stops)",
};

function SlMethodFooter({ method }: { method: string | null }) {
  if (!method) return null;
  const copy = SL_METHOD_COPY[method];
  if (!copy) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="mt-1 inline-flex cursor-help items-center gap-1 rounded border border-border/60 bg-background/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {method.replace(/_/g, " ")} <Info className="h-2.5 w-2.5 opacity-60" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-xs">
        <p className="font-semibold">SL method: {method}</p>
        <p className="mt-1 leading-snug text-muted-foreground">{copy}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function HowTargetsComputedChip() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex cursor-help items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground">
          <Info className="h-3 w-3" /> How targets are computed
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-sm text-xs leading-relaxed">
        <p className="font-semibold text-foreground">4-tier fallback hierarchy</p>
        <ol className="mt-2 space-y-1.5 text-muted-foreground">
          <li><span className="font-mono text-foreground">1. DCF</span> — preferred when fair value is within ±60% of spot.</li>
          <li><span className="font-mono text-foreground">2. Sector multiple</span> — trailing EPS × peer-group median P/E.</li>
          <li><span className="font-mono text-foreground">3. Historical multiple</span> — EPS × stock's 5-yr avg P/E (when available).</li>
          <li><span className="font-mono text-foreground">4. Volatility band</span> — spot × (1 + expected 12-month drift, 18–24%).</li>
        </ol>
        <p className="mt-2 text-muted-foreground">T2 falls back to <em>T1 + 5%</em> as a final guard. Every target is then validated for R:R ≥ 1.5 (T1) / 2.0 (T2).</p>
      </PopoverContent>
    </Popover>
  );
}

function TargetMethodTip({ targetMeta, label, sectorSource, sectorMethodVersion }: { targetMeta: NonNullable<AuditMeta["targets_meta"]>["t1"] | NonNullable<AuditMeta["targets_meta"]>["t2"] | null; label: string; sectorSource?: string | null; sectorMethodVersion?: string | null }) {
  if (!targetMeta || targetMeta.method === "none" || targetMeta.value == null) return null;
  const copy = TARGET_METHOD_COPY[targetMeta.method] ?? TARGET_METHOD_COPY.none;
  const inputs = Object.entries(targetMeta.inputs ?? {}).filter(([, v]) => v != null);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="mt-1 inline-flex cursor-help items-center gap-1 rounded border border-border/60 bg-background/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {copy.short.split(" ")[0]} <Info className="h-2.5 w-2.5 opacity-60" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-xs">
        <p className="font-semibold">{label}: {copy.short}</p>
        <p className="mt-1 leading-snug text-muted-foreground">{copy.long}</p>
        {inputs.length > 0 && (
          <div className="mt-2 border-t border-border/40 pt-1.5 space-y-0.5">
            {inputs.map(([k, v]) => (
              <p key={k} className="font-mono text-[10px]">
                <span className="text-muted-foreground">{k}:</span>{" "}
                <span className="text-foreground/80">{typeof v === "number" ? v.toFixed(2) : String(v)}</span>
              </p>
            ))}
          </div>
        )}
        {sectorSource && (
          <p className="mt-2 border-t border-border/40 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Sector data: <span className="normal-case text-foreground/70">{sectorSource}{sectorMethodVersion ? ` (${sectorMethodVersion})` : ""}</span>
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function LevelCell({ label, value, tone, reason, methodTip, footer }: { label: string; value: number | null; tone?: string; reason?: string; methodTip?: React.ReactNode; footer?: React.ReactNode }) {
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
        <>
          <p className={`font-display text-lg tabular-nums ${tone || "text-foreground"}`}>{fmtPrice(value)}</p>
          {methodTip}
          {footer}
        </>
      )}
    </motion.div>
  );
}

// Phase 4C — entry-zone-aware card. Replaces the single Entry LevelCell.
// • Zone mode: "Accumulate ₹A – ₹B, ideally near ₹P" + anchor chip + tooltip.
// • Single mode (intraday/breakout): "Enter near ₹P".
// • Tight-zone cosmetic guard mirrors the PriceBand: < 0.5% width collapses
//   visually to a single line with a "tight zone" subtext.
const ENTRY_ANCHOR_LABEL: Record<string, string> = {
  LTP: "Last traded price",
  DMA20: "20-day moving avg",
  DMA50: "50-day moving avg",
  DMA200: "200-day moving avg",
  S1: "Support 1",
  S1_DMA50_BLEND: "S1 + DMA50 blend",
  DMA200_52WL_BLEND: "DMA200 + 52W low blend",
};

function EntryZoneCell({ levels, reason }: { levels: StockAnalysisPayload["levels"]; reason?: string }) {
  const es = levels.entry_strategy ?? null;
  const value = levels.entry_zone;

  if (value == null) {
    return <LevelCell label="Entry" value={null} tone="text-primary" reason={reason} />;
  }

  const isZone = es?.mode === "zone" && es.entry_zone_lower != null && es.entry_zone_upper != null && es.preferred_entry > 0;
  const widthPct = isZone ? (es!.entry_zone_upper! - es!.entry_zone_lower!) / es!.preferred_entry : 0;
  const tight = isZone && widthPct < 0.005;
  const anchorLabel = es?.entry_anchor ? (ENTRY_ANCHOR_LABEL[es.entry_anchor] ?? es.entry_anchor) : null;

  return (
    <motion.div
      variants={innerStaggerItem}
      whileHover={{ y: -1 }}
      transition={{ duration: duration.fast, ease: ease.standard }}
      className="col-span-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 transition-colors hover:border-primary/50 md:col-span-2"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Entry</p>
        {anchorLabel && (
          <span className="rounded-full border border-primary/30 bg-background/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
            {anchorLabel}
          </span>
        )}
      </div>
      {isZone && !tight ? (
        <p className="mt-0.5 font-display text-base leading-tight text-primary">
          Accumulate <span className="tabular-nums">{fmtPrice(es!.entry_zone_lower)}</span>{" – "}
          <span className="tabular-nums">{fmtPrice(es!.entry_zone_upper)}</span>
          <span className="block text-xs font-normal text-muted-foreground">
            Ideally near <span className="tabular-nums text-foreground/80">{fmtPrice(es!.preferred_entry)}</span>
          </span>
        </p>
      ) : isZone && tight ? (
        <>
          <p className="mt-0.5 font-display text-lg tabular-nums text-primary">{fmtPrice(es!.preferred_entry)}</p>
          <p className="text-[10px] italic text-muted-foreground">Tight zone — single reference price</p>
        </>
      ) : (
        <p className="mt-0.5 font-display text-lg tabular-nums text-primary">Enter near {fmtPrice(value)}</p>
      )}
      {es?.reasoning_text && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground decoration-dotted underline-offset-2 hover:underline">
              Why this entry? <Info className="h-3 w-3 opacity-60" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs leading-snug">
            {es.reasoning_text}
          </TooltipContent>
        </Tooltip>
      )}
    </motion.div>
  );
}

function StaggeredPlanCard({ plan }: { plan: NonNullable<NonNullable<StockAnalysisPayload["levels"]["entry_strategy"]>["staggered_plan"]> }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-background/60 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Phased buying plan</p>
      <p className="mt-0.5 text-xs text-foreground/75">For long-term accumulation, spread your entry across three tranches:</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {plan.map((p, i) => (
          <div key={i} className="rounded-md border border-border/60 bg-card px-3 py-2">
            <p className="font-display text-base text-primary">{p.pct}%</p>
            <p className="text-xs tabular-nums text-foreground/80">@ {fmtPrice(p.price)}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{p.note}</p>
          </div>
        ))}
      </div>
    </div>
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

// ─────────────────────────────────────────────────────────────────
// Tier-shaped metric grid (Mission 1 — Part B.2)
// Renders a different card set per tier (intraday / medium / long).
// Backed by the new B.1 snapshots when available; degrades gracefully.
// ─────────────────────────────────────────────────────────────────

function TierMethodologyChip({ copyKey }: { copyKey: string }) {
  const copy = METRIC_COPY[copyKey];
  if (!copy) return null;
  return <CardMethodologyChip copy={copy} />;
}

function CardMethodologyChip({ copy }: { copy: MetricCopy }) {
  const [showFormula, setShowFormula] = useState(false);
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Methodology"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground"
      >
        <Info className="h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] text-xs leading-snug">
        <p className="mb-1.5 font-display text-sm text-foreground">What this measures</p>
        <p className="text-muted-foreground">{copy.measures}</p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">How it&apos;s computed</p>
        <p className="text-muted-foreground">{copy.how}</p>
        {copy.scale && (
          <p className="mt-2 text-[11px] text-foreground/80"><span className="font-mono uppercase tracking-wider text-muted-foreground">Scale · </span>{copy.scale}</p>
        )}
        {copy.interpretation && (
          <p className="mt-2 text-[11px] italic text-foreground/80">{copy.interpretation}</p>
        )}
        {copy.formula && (
          <div className="mt-3 border-t border-border pt-2">
            <button
              type="button"
              onClick={() => setShowFormula((s) => !s)}
              className="text-[10px] font-mono uppercase tracking-wider text-accent hover:underline"
            >
              {showFormula ? "Hide formula" : "Show formula"}
            </button>
            {showFormula && (
              <pre className="mt-1.5 whitespace-pre-wrap rounded bg-muted/40 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-foreground/80">{copy.formula}</pre>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TierCard({
  eyebrow, title, icon: Icon, score, copyKey, summary, footnote, muted, children,
}: {
  eyebrow: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  score: number | null;
  copyKey: string;
  summary?: React.ReactNode;
  footnote?: React.ReactNode;
  muted?: boolean;
  children: React.ReactNode;
}) {
  const tone = SCORE_TONE(score);
  return (
    <motion.div
      variants={cardItem}
      whileHover={{ y: -2, scale: 1.003 }}
      transition={{ duration: duration.fast, ease: ease.standard }}
      className={`rounded-2xl border border-border bg-card px-5 py-5 transition-colors hover:border-accent/50 ${muted ? "opacity-90" : ""}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 text-accent" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
            <h3 className="font-display text-lg text-foreground leading-tight">{title}</h3>
          </div>
          <div className="ml-1 mt-0.5"><TierMethodologyChip copyKey={copyKey} /></div>
        </div>
        <div className="text-right">
          <p className={`font-display text-2xl tabular-nums ${tone.color}`}>
            {score == null ? DASH : <AnimatedNumber value={score} decimals={0} duration={700} />}
            {score != null && <span className="ml-0.5 text-xs text-muted-foreground">/100</span>}
          </p>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{tone.label}</p>
        </div>
      </div>
      <motion.div variants={innerStaggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-3 gap-3">
        {children}
      </motion.div>
      {summary && <p className="mt-3 text-[12px] leading-relaxed text-foreground/80">{summary}</p>}
      {footnote && <div className="mt-3 text-[11px] italic text-muted-foreground">{footnote}</div>}
    </motion.div>
  );
}

const MICROSTRUCTURE_VOL_LABEL: Record<string, string> = {
  ABOVE_AVERAGE: "Above average",
  AVERAGE: "Average",
  BELOW_AVERAGE: "Below average",
};
const GAP_LABEL: Record<string, string> = {
  FLAT: "Flat open",
  GAP_UP: "Gap up (unfilled)",
  GAP_DOWN: "Gap down (unfilled)",
  GAP_FILLED_UP: "Gap up · filled",
  GAP_FILLED_DOWN: "Gap down · filled",
};
const RS_TODAY_LABEL: Record<string, string> = {
  OUTPERFORMING: "Outperforming",
  INLINE: "In line",
  UNDERPERFORMING: "Underperforming",
};
const QUALITY_LABEL: Record<string, string> = {
  HIGH_QUALITY: "High quality",
  AVERAGE: "Average",
  WEAK: "Weak",
  BANKING_ADJUSTED: "Banking-adjusted",
};

// ─────────────────────────────────────────────────────────────────────
// Mission 6.1B — Recent News block. Reads from sentiment_snapshot.top_articles
// (persisted by generate-stock-analysis from compute-sentiment). Pure
// information; no advice logic. Three states:
//   • coverage + score   → "Sentiment label" + top 3 headlines
//   • coverage, no score → "Limited recent coverage" + top 3 headlines
//   • no coverage        → "No recent coverage" block
// ─────────────────────────────────────────────────────────────────────
function fmtArticleDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
function sentimentTone(s: number): string {
  if (s > 0.15) return "text-emerald-700 dark:text-emerald-300";
  if (s < -0.15) return "text-rose-700 dark:text-rose-300";
  return "text-muted-foreground";
}
function RecentNewsBlock({ sent }: { sent: StockAnalysisPayload["sentiment_snapshot"] }) {
  const articles = sent.top_articles ?? [];
  const hasArticles = articles.length > 0;
  const hasScore = sent.news_sentiment_score != null;
  const articleCount = sent.article_count ?? 0;

  let headline: string;
  if (!hasArticles && articleCount === 0) {
    headline = "No recent coverage in the last 30 days.";
  } else if (!hasScore) {
    headline = "Limited recent coverage — score withheld.";
  } else {
    headline = `Sentiment: ${labelize(sent.sentiment_label)}`;
  }

  return (
    <div className="col-span-3 mt-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Recent news · last 30d</p>
        <p className="font-mono text-[10px] text-muted-foreground">{articleCount} article{articleCount === 1 ? "" : "s"}</p>
      </div>
      <p className="mt-1 text-[12px] text-foreground/85">{headline}</p>
      {hasArticles ? (
        <ul className="mt-2 space-y-1.5">
          {articles.map((a, i) => (
            <li key={i} className="text-[12px] leading-snug">
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/90 hover:text-accent hover:underline underline-offset-2"
              >
                {a.title || "(untitled)"}
              </a>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
                <span>{a.source || "—"}</span>
                {a.published_at && <><span>·</span><span>{fmtArticleDate(a.published_at)}</span></>}
                <span>·</span>
                <span className={sentimentTone(a.sentiment)}>
                  sent {a.sentiment > 0 ? "+" : ""}{a.sentiment.toFixed(2)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] italic text-muted-foreground">
          News-aware modules will activate once coverage picks up.
        </p>
      )}
      <p className="mt-2 text-[10px] italic text-muted-foreground">
        Source: Marketaux news API · for context only, not a recommendation.
      </p>
    </div>
  );
}


function TierShapedGrid({ data }: { data: StockAnalysisPayload }) {
  const tier = data.query_context.query_type;
  if (tier === "intraday")    return <IntradayGrid data={data} />;
  if (tier === "long-term")   return <LongTermGrid data={data} />;
  return <MediumTermGrid data={data} />;
}

function IntradayGrid({ data }: { data: StockAnalysisPayload }) {
  const {
    technical_snapshot: t, risk_snapshot: r, sentiment_snapshot: sent,
    score_breakdown: s, intraday_microstructure_snapshot,
  } = data;
  const m: IntradayMicrostructureSnapshot | null = intraday_microstructure_snapshot ?? null;
  const freshness = m?.data_freshness ?? "stale";

  return (
    <motion.section variants={gridContainer} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} className="grid gap-4 md:grid-cols-2">
      {/* Card 1 — Trend & Levels */}
      <TierCard
        eyebrow="Intraday · Card 1"
        title="Trend & Levels"
        icon={LineChart}
        score={s.technical_score}
        copyKey="card_intraday_trend_levels"
        summary={technicalProse(t)}
      >
        <Metric label="RSI(14)" value={<AnimatedNumber value={t.rsi} decimals={1} duration={700} />} tone={t.rsi != null && (t.rsi > 70 || t.rsi < 30) ? "text-amber-700" : ""} />
        <Metric label="MACD" value={labelize(t.macd_signal)} />
        <Metric label="ADX" value={<AnimatedNumber value={t.adx} decimals={1} duration={700} />} hint="Above 25 = trending" />
        <Metric label="EMA stack" value={labelize(t.ema_stack)} />
        <Metric label="VWAP signal" value={labelize(t.vwap_signal)} />
        <Metric label="Bollinger" value={labelize(t.bollinger_position)} />
      </TierCard>

      {/* Card 2 — Intraday Microstructure */}
      <TierCard
        eyebrow="Intraday · Card 2"
        title="Intraday Microstructure"
        icon={Waves}
        score={s.technical_score}
        copyKey="card_intraday_microstructure"
        summary={microstructureProse(m)}
        footnote={
          freshness === "post_market"
            ? <span><Clock className="mr-1 inline-block h-3 w-3 align-[-2px]" />Refreshed at market close — live intraday tape not connected yet.</span>
            : freshness === "stale"
            ? <span><AlertTriangle className="mr-1 inline-block h-3 w-3 align-[-2px]" />Last bar is stale; values reflect the most recent EOD candle.</span>
            : null
        }
      >
        <Metric label="ATR(14)" value={m?.atr_14 != null ? <AnimatedNumber value={m.atr_14} decimals={2} duration={700} /> : DASH} hint={METRIC_COPY.m_atr_14.measures} />
        <Metric label="Realised vol" value={m?.daily_realized_volatility != null ? <AnimatedNumber value={m.daily_realized_volatility} decimals={1} suffix="%" duration={700} /> : DASH} hint={METRIC_COPY.m_realized_vol.measures} />
        <Metric label="VWAP" value={m?.vwap != null ? fmtPrice(m.vwap) : DASH} hint={METRIC_COPY.m_vwap.measures} />
        <Metric label="Vs VWAP" value={m?.price_vs_vwap_pct != null ? fmtPct(m.price_vs_vwap_pct, 2, true) : DASH} />
        <Metric label="Session H/L" value={m?.session_high != null && m?.session_low != null ? `${fmtPrice(m.session_high)} / ${fmtPrice(m.session_low)}` : DASH} />
        <Metric label="Volume" value={m?.intraday_volume_profile_label ? MICROSTRUCTURE_VOL_LABEL[m.intraday_volume_profile_label] : DASH} hint={METRIC_COPY.m_volume_profile.measures} />
        <Metric label="Gap" value={m?.gap_behavior_label ? GAP_LABEL[m.gap_behavior_label] : DASH} hint={METRIC_COPY.m_gap_behavior.measures} />
        <Metric label="Sector RS" value={m?.sector_rs_today_label ? RS_TODAY_LABEL[m.sector_rs_today_label] : DASH} hint={METRIC_COPY.m_sector_rs_today.measures} />
      </TierCard>

      {/* Card 3 — Risk Profile (intraday) */}
      <TierCard
        eyebrow="Intraday · Card 3"
        title="Risk Profile"
        icon={ShieldCheck}
        score={s.risk_score}
        copyKey="card_intraday_risk"
        summary={`Beta ${fmtNum(r.beta)} with annualised vol ${fmtPct(r.volatility_1y, 1)} sets the size envelope for a day trade.`}
      >
        <Metric label="Beta" value={<AnimatedNumber value={r.beta} decimals={2} duration={700} />} tone={riskTone("beta", r.beta)} hint={METRIC_COPY.m_beta.measures} />
        <Metric label="Realised vol" value={r.volatility_1y != null ? <AnimatedNumber value={r.volatility_1y} decimals={1} suffix="%" duration={700} /> : DASH} tone={riskTone("vol", r.volatility_1y)} />
        <Metric label="Daily ATR%" value={m?.atr_14 != null && data.price_context.current_price ? fmtPct((m.atr_14 / data.price_context.current_price) * 100, 2) : DASH} hint="ATR-14 as % of current price." />
        <Metric label="Liquidity" value={labelize(r.liquidity_label)} hint={METRIC_COPY.m_liquidity.measures} />
      </TierCard>

      {/* Card 4 — Today's Catalysts */}
      <TierCard
        eyebrow="Intraday · Card 4"
        title="Today's Catalysts"
        icon={Newspaper}
        score={s.sentiment_score}
        copyKey="card_today_catalysts"
        summary={
          m?.intraday_news_catalysts && m.intraday_news_catalysts.length > 0
            ? `Top driver: ${m.intraday_news_catalysts[0]}`
            : sent.top_news_driver
              ? `Most-cited driver: ${sent.top_news_driver}`
              : "No standout catalysts in the last 24 hours."
        }
      >
        <Metric label="Sentiment" value={sent.news_sentiment_score != null ? <AnimatedNumber value={sent.news_sentiment_score} decimals={0} duration={700} /> : DASH} hint={METRIC_COPY.m_news_sentiment.measures} />
        <Metric label="Articles today" value={String(m?.intraday_news_catalysts?.length ?? 0)} />
        <Metric label="Sentiment tag" value={labelize(sent.sentiment_label)} />
        {m?.intraday_news_catalysts && m.intraday_news_catalysts.length > 0 && (
          <div className="col-span-3 mt-1 space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Today&apos;s headlines</p>
            <ul className="space-y-1 text-[12px] text-foreground/85">
              {m.intraday_news_catalysts.slice(0, 3).map((h, i) => (
                <li key={i} className="flex gap-2"><span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />{h}</li>
              ))}
            </ul>
          </div>
        )}
        <RecentNewsBlock sent={sent} />

      </TierCard>
    </motion.section>
  );
}

function microstructureProse(m: IntradayMicrostructureSnapshot | null): string {
  if (!m) return "Microstructure snapshot pending — intraday module did not return data for this stock.";
  const gap = m.gap_behavior_label ? GAP_LABEL[m.gap_behavior_label] : "no clear gap";
  const vol = m.intraday_volume_profile_label ? MICROSTRUCTURE_VOL_LABEL[m.intraday_volume_profile_label].toLowerCase() : "average";
  const atr = m.atr_14 != null ? `ATR-14 at ${fmtNum(m.atr_14)}` : "ATR unavailable";
  return `${gap} on ${vol} volume; ${atr}.`;
}

function MediumTermGrid({ data }: { data: StockAnalysisPayload }) {
  const {
    technical_snapshot: t, fundamental_snapshot: f, momentum_snapshot: mom,
    returns_snapshot: ret, sentiment_snapshot: sent, score_breakdown: s,
    flags, stock,
  } = data;

  return (
    <motion.section variants={gridContainer} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} className="grid gap-4 md:grid-cols-2">
      <TierCard
        eyebrow="Medium · Card 1"
        title="Trend & Structure"
        icon={LineChart}
        score={s.technical_score}
        copyKey="card_medium_trend_structure"
        summary={technicalProse(t)}
      >
        <Metric label="RSI" value={<AnimatedNumber value={t.rsi} decimals={1} duration={700} />} />
        <Metric label="EMA stack" value={labelize(t.ema_stack)} hint="50DMA vs 200DMA position" />
        <Metric label="Trend" value={labelize(t.trend_label)} />
        <Metric label="ADX" value={<AnimatedNumber value={t.adx} decimals={1} duration={700} />} />
        <Metric label="3M return" value={ret.three_month != null ? fmtPct(ret.three_month, 1, true) : DASH} hint={METRIC_COPY.m_returns_window.measures} />
        <Metric label="1M vs Nifty" value={ret.vs_nifty_one_month != null ? fmtPct(ret.vs_nifty_one_month, 1, true) : DASH} />
      </TierCard>

      <TierCard
        eyebrow="Medium · Card 2"
        title="Momentum & Relative Strength"
        icon={Activity}
        score={s.momentum_score}
        copyKey="card_medium_momentum_rs"
        summary={`Trend strength reads ${labelize(mom.trend_strength).toLowerCase()}; momentum regime is ${labelize(mom.momentum_label).toLowerCase()}.`}
      >
        <Metric label="RS vs Nifty" value={mom.relative_strength_vs_nifty != null ? fmtPct(mom.relative_strength_vs_nifty, 2, true) : DASH} hint={METRIC_COPY.m_rs_vs_nifty.measures} />
        <Metric label="Trend strength" value={labelize(mom.trend_strength)} />
        <Metric label="Regime" value={labelize(mom.momentum_label)} />
        <Metric label="Volume" value={labelize(mom.volume_confirmation) || DASH} hint="Volume confirmation of the move" />
        <Metric label="1M return" value={ret.one_month != null ? fmtPct(ret.one_month, 1, true) : DASH} />
        <Metric label="3M vs Nifty" value={ret.vs_nifty_three_month != null ? fmtPct(ret.vs_nifty_three_month, 1, true) : DASH} />
      </TierCard>

      <TierCard
        eyebrow="Medium · Card 3"
        title="Light Fundamentals"
        icon={Building2}
        score={s.fundamental_score}
        copyKey="card_medium_fundamentals_lite"
        summary={`P/E ${fmtNum(f.pe_ratio)} reads as ${labelize(f.valuation_label).toLowerCase()}. ROE ${fmtPct(f.roe)}.`}
        muted={flags.banking_override_applied && (f.altman_z_score == null)}
        footnote={
          f.derivation === "sector_fallback"
            ? `Sector-derived fallback · company fundamentals unavailable${f.sector_fallback_meta?.sector_display ? ` · sector: ${f.sector_fallback_meta.sector_display}` : ""}.`
            : (flags.banking_override_applied ? "Banking sector — Altman Z & DCF de-emphasised." : null)
        }
      >
        <Metric label="P/E" value={<AnimatedNumber value={f.pe_ratio} decimals={2} duration={700} />} hint={METRIC_COPY.m_pe_ratio.measures} />
        <Metric label="ROE" value={f.roe != null ? <AnimatedNumber value={f.roe} decimals={2} suffix="%" duration={700} /> : DASH} />
        <Metric label="F-Score" value={f.piotroski_f_score != null ? `${f.piotroski_f_score} / 9` : DASH} hint={METRIC_COPY.m_piotroski.measures} />
        <Metric label="Valuation" value={labelize(f.valuation_label)} hint={METRIC_COPY.m_valuation_label.measures} />
        <Metric label="DCF upside" value={f.dcf_upside_pct != null && f.dcf_upside_pct > -95 ? fmtPct(f.dcf_upside_pct, 1, true) : DASH} />
      </TierCard>

      <CatalystCalendarCard symbol={stock.symbol} sent={sent} score={s.sentiment_score} />
    </motion.section>
  );
}

function CatalystCalendarCard({ symbol, sent, score }: { symbol: string; sent: StockAnalysisPayload["sentiment_snapshot"]; score: number | null }) {
  const fetcher = useServerFn(getUpcomingCorporateActions);
  const { data: ca, isLoading } = useQuery({
    queryKey: ["corporate-actions", symbol],
    queryFn: () => fetcher({ data: { symbol } }),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
  const actions: UpcomingCorporateAction[] = ca?.actions ?? [];

  return (
    <TierCard
      eyebrow="Medium · Card 4"
      title="Catalyst Calendar & Sentiment"
      icon={Calendar}
      score={score}
      copyKey="card_medium_catalysts"
      summary={
        sent.top_news_driver
          ? `Most-cited recent driver: ${sent.top_news_driver}`
          : "No standout news driver this fortnight."
      }
    >
      <Metric label="Sentiment" value={sent.news_sentiment_score != null ? <AnimatedNumber value={sent.news_sentiment_score} decimals={0} duration={700} /> : DASH} hint={METRIC_COPY.m_news_sentiment.measures} />
      <Metric label="Articles (14d)" value={String(sent.article_count ?? 0)} />
      <Metric label="Tag" value={labelize(sent.sentiment_label)} />
      <div className="col-span-3 mt-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Upcoming actions · next 90 days</p>
        {isLoading ? (
          <p className="mt-1 text-[12px] italic text-muted-foreground">Loading corporate actions…</p>
        ) : actions.length === 0 ? (
          <p className="mt-1 text-[12px] italic text-muted-foreground">No upcoming corporate actions on record.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-[12px]">
            {actions.slice(0, 5).map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="text-foreground/85"><span className="font-mono text-[10px] uppercase tracking-wider text-accent">{labelize(a.type)}</span> · {a.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{new Date(a.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] italic text-muted-foreground">Earnings calendar — coming soon. Only corporate actions FinEdge confirms are shown.</p>
      </div>
      <RecentNewsBlock sent={sent} />
    </TierCard>
  );
}

function LongTermGrid({ data }: { data: StockAnalysisPayload }) {
  const {
    fundamental_snapshot: f, risk_snapshot: r, momentum_snapshot: mom,
    returns_snapshot: ret, sentiment_snapshot: sent, score_breakdown: s,
    flags, long_term_quality_snapshot, audit_meta,
  } = data;
  const q: LongTermQualitySnapshot | null = long_term_quality_snapshot ?? null;
  const sectorSource = audit_meta.targets_meta?.sector_aggregate_source ?? null;
  const dcfDegenerate = f.dcf_upside_pct == null || f.dcf_upside_pct <= -95;

  return (
    <motion.section variants={gridContainer} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} className="grid gap-4 md:grid-cols-2">
      {/* Card 1 — Business Quality */}
      <TierCard
        eyebrow="Long-term · Card 1"
        title="Business Quality"
        icon={Sparkles}
        score={s.fundamental_score}
        copyKey="card_long_business_quality"
        summary={businessQualityProse(q, flags.banking_override_applied)}
        footnote={
          q?.quality_label === "BANKING_ADJUSTED"
            ? "Banking-adjusted view: EPS volatility suppressed; quality governed by ROE, leverage & promoter holding."
            : null
        }
      >
        <Metric label="ROE (5y)" value={q?.roe_5y_avg != null ? <AnimatedNumber value={q.roe_5y_avg} decimals={1} suffix="%" duration={700} /> : DASH} hint={METRIC_COPY.m_roe_5y.measures} />
        <Metric label="ROCE (5y)" value={q?.roce_5y_avg != null && q.roce_5y_avg !== 0 ? <AnimatedNumber value={q.roce_5y_avg} decimals={1} suffix="%" duration={700} /> : DASH} hint={METRIC_COPY.m_roce_5y.measures} />
        <Metric label="Debt / Equity" value={q?.debt_to_equity_current != null ? <AnimatedNumber value={q.debt_to_equity_current} decimals={2} duration={700} /> : DASH} hint={METRIC_COPY.m_debt_equity.measures} />
        <Metric label="FCF yield" value={q?.fcf_yield != null ? fmtPct(q.fcf_yield, 1) : DASH} hint={METRIC_COPY.m_fcf_yield.measures} />
        <Metric label="EPS CAGR (5y)" value={q?.eps_cagr_5y != null ? fmtPct(q.eps_cagr_5y, 1, true) : DASH} hint={METRIC_COPY.m_eps_cagr_5y.measures} />
        <Metric label="Promoter %" value={q?.promoter_holding_pct != null ? fmtPct(q.promoter_holding_pct, 1) : DASH} hint={METRIC_COPY.m_promoter_holding.measures} />
        {/* Move 4a — F-Score raw fallback. The long-quality composite suppresses Piotroski for the
            banking carveout, but the raw 0–9 score should still surface here for transparency. */}
        <Metric label="F-Score" value={(q?.piotroski_f_score ?? f.piotroski_f_score) != null ? `${q?.piotroski_f_score ?? f.piotroski_f_score} / 9` : DASH} hint={METRIC_COPY.m_piotroski.measures} />
        <Metric label="Quality" value={q?.quality_label ? QUALITY_LABEL[q.quality_label] : DASH} hint={METRIC_COPY.m_quality_label.measures} />
        <Metric label="Completeness" value={q?.data_completeness_pct != null ? `${q.data_completeness_pct}%` : DASH} hint="Share of quality fields populated for this stock." />
      </TierCard>

      {/* Card 2 — Valuation & Fair Value */}
      <TierCard
        eyebrow="Long-term · Card 2"
        title="Valuation & Fair Value"
        icon={Target}
        score={s.fundamental_score}
        copyKey="card_long_valuation"
        summary={fundamentalProse(f, flags.banking_override_applied)}
        footnote={
          f.derivation === "sector_fallback"
            ? `Sector-derived fallback · company fundamentals unavailable${f.sector_fallback_meta?.sector_display ? ` · sector: ${f.sector_fallback_meta.sector_display}` : ""}. Only sector medians shown; company-level quality scores withheld.`
            : (dcfDegenerate || flags.banking_override_applied)
              ? `Sector-multiple fair value used (DCF unavailable${sectorSource === "bootstrap" ? " · sector data: bootstrap" : sectorSource === "default_fallback" ? " · using default fallback" : ""}).`
              : null
        }
      >
        <Metric label="P/E" value={<AnimatedNumber value={f.pe_ratio} decimals={2} duration={700} />} hint={METRIC_COPY.m_pe_ratio.measures} />
        <Metric label="ROE" value={f.roe != null ? <AnimatedNumber value={f.roe} decimals={1} suffix="%" duration={700} /> : DASH} />
        <Metric label="DCF upside" value={!dcfDegenerate ? fmtPct(f.dcf_upside_pct, 1, true) : DASH} />
        <Metric label="Valuation" value={labelize(f.valuation_label)} hint={METRIC_COPY.m_valuation_label.measures} />
        <Metric label="Sector basis" value={sectorSource ? labelize(sectorSource) : DASH} hint="Source of the sector aggregate used for fair value." />
      </TierCard>

      {/* Card 3 — Risk Profile (long-term) */}
      <TierCard
        eyebrow="Long-term · Card 3"
        title="Risk Profile"
        icon={ShieldCheck}
        score={s.risk_score}
        copyKey="card_long_risk"
        summary={riskProse(r)}
      >
        <Metric label="Vol (1Y)" value={r.volatility_1y != null ? <AnimatedNumber value={r.volatility_1y} decimals={1} suffix="%" duration={700} /> : DASH} tone={riskTone("vol", r.volatility_1y)} hint={METRIC_COPY.m_vol_1y.measures} />
        <Metric label="Max DD" value={r.max_drawdown != null ? fmtPct(r.max_drawdown, 1, true) : DASH} tone={riskTone("dd", r.max_drawdown)} hint={METRIC_COPY.m_max_dd.measures} />
        <Metric label="Beta" value={<AnimatedNumber value={r.beta} decimals={2} duration={700} />} tone={riskTone("beta", r.beta)} hint={METRIC_COPY.m_beta.measures} />
        <Metric label="Sharpe" value={<AnimatedNumber value={r.sharpe_ratio} decimals={2} duration={700} />} tone={riskTone("sharpe", r.sharpe_ratio)} hint={METRIC_COPY.m_sharpe.measures} />
        <Metric label="Liquidity" value={labelize(r.liquidity_label)} hint={METRIC_COPY.m_liquidity.measures} />
      </TierCard>

      {/* Card 4 — Long-Term Returns */}
      <TierCard
        eyebrow="Long-term · Card 4"
        title="Long-Term Returns"
        icon={TrendingUp}
        score={s.momentum_score}
        copyKey="card_long_returns"
        summary={`1Y return ${fmtPct(ret.one_year, 1, true)}; 3M ${fmtPct(ret.three_month, 1, true)}.`}
      >
        <Metric label="1Y return" value={ret.one_year != null ? fmtPct(ret.one_year, 1, true) : DASH} hint={METRIC_COPY.m_returns_window.measures} />
        <Metric label="3M return" value={ret.three_month != null ? fmtPct(ret.three_month, 1, true) : DASH} />
        <Metric label="1M return" value={ret.one_month != null ? fmtPct(ret.one_month, 1, true) : DASH} />
        <Metric label="1M vs Nifty" value={ret.vs_nifty_one_month != null ? fmtPct(ret.vs_nifty_one_month, 1, true) : DASH} hint={METRIC_COPY.m_rs_vs_nifty.measures} />
        <Metric label="3M vs Nifty" value={ret.vs_nifty_three_month != null ? fmtPct(ret.vs_nifty_three_month, 1, true) : DASH} />
        <Metric label="RS vs Nifty" value={mom.relative_strength_vs_nifty != null ? fmtPct(mom.relative_strength_vs_nifty, 2, true) : DASH} />
        <RecentNewsBlock sent={sent} />
      </TierCard>
    </motion.section>
  );
}

function businessQualityProse(q: LongTermQualitySnapshot | null, banking: boolean): string {
  if (!q) return "Business-quality module did not return data for this stock.";
  if (banking || q.quality_label === "BANKING_ADJUSTED") {
    return `Banking-adjusted read: ROE ${fmtPct(q.roe_5y_avg)} with debt-to-equity ${fmtNum(q.debt_to_equity_current)} and Piotroski ${q.piotroski_f_score ?? DASH}/9. EPS-growth signals suppressed by design.`;
  }
  const lead = q.quality_label === "HIGH_QUALITY" ? "High-quality compounder profile" : q.quality_label === "WEAK" ? "Quality flags warrant caution" : "Average-quality profile";
  return `${lead}: ROE ${fmtPct(q.roe_5y_avg)}, D/E ${fmtNum(q.debt_to_equity_current)}, Piotroski ${q.piotroski_f_score ?? DASH}/9, promoter holding ${fmtPct(q.promoter_holding_pct, 1)}.`;
}
