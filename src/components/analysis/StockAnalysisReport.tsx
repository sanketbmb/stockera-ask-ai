// Stockera Brain v2 — God-tier Stock Analysis Report
// Renders the orchestrator JSON contract from `generate-stock-analysis`.
// Premium, editorial, tier-aware. No backend logic, pure presentation.

import { useMemo } from "react";
import {
  Activity, AlertTriangle, BarChart3, Brain, Building2, CheckCircle2,
  Compass, Eye, Flame, Gauge, HelpCircle, LineChart, Newspaper,
  ShieldCheck, Sparkles, Target, TrendingDown, TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  StockAnalysisPayload, VerdictAction, QueryType, ScoreBreakdown,
} from "@/types/stock-analysis";

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
const labelize = (s: string | null | undefined): string =>
  !s ? DASH : s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Verdict palette — refined, never alarmist.
const VERDICT_STYLES: Record<VerdictAction, { label: string; ring: string; chip: string; accent: string; dot: string }> = {
  BUY:       { label: "Buy",        ring: "from-emerald-500/30 to-teal-500/10",  chip: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",   accent: "text-emerald-700", dot: "bg-emerald-500" },
  HOLD:      { label: "Hold",       ring: "from-amber-400/30 to-amber-200/10",   chip: "bg-amber-400/10 text-amber-800 border-amber-500/30",         accent: "text-amber-700",   dot: "bg-amber-500" },
  WATCHLIST: { label: "Watchlist",  ring: "from-sky-500/25 to-sky-200/10",       chip: "bg-sky-500/10 text-sky-800 border-sky-500/30",               accent: "text-sky-700",     dot: "bg-sky-500" },
  SELL:      { label: "Reduce",     ring: "from-rose-500/30 to-rose-200/10",     chip: "bg-rose-500/10 text-rose-800 border-rose-500/30",            accent: "text-rose-700",    dot: "bg-rose-500" },
  AVOID:     { label: "Avoid",      ring: "from-red-700/30 to-red-300/10",       chip: "bg-red-700/10 text-red-900 border-red-700/30",               accent: "text-red-800",     dot: "bg-red-700" },
};

const TIER_LABEL: Record<QueryType, string> = {
  "intraday": "Intraday view",
  "medium-term": "Medium-term view",
  "long-term": "Long-term view",
};

const SCORE_TONE = (s: number | null | undefined): { color: string; label: string } => {
  if (s == null) return { color: "text-muted-foreground", label: "no data" };
  if (s >= 70) return { color: "text-emerald-700", label: "strong" };
  if (s >= 50) return { color: "text-amber-700", label: "moderate" };
  if (s >= 30) return { color: "text-rose-700", label: "weak" };
  return { color: "text-red-800", label: "very weak" };
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

function SectionTitle({ eyebrow, title, icon: Icon }: { eyebrow: string; title: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 border-b border-border/60 pb-3">
      <div className="flex items-center gap-3">
        {Icon && <Icon className="h-5 w-5 text-accent" />}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
          <h2 className="font-display text-2xl text-foreground leading-tight">{title}</h2>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "", hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
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
    </div>
  );
}

function ScoreBar({ label, value, weighted }: { label: string; value: number | null; weighted: boolean }) {
  const v = value ?? 0;
  const tone = SCORE_TONE(value);
  const isMissing = value == null || value === 0;
  return (
    <div className={isMissing ? "opacity-50" : ""}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {label}
          {weighted && <span className="inline-block h-1 w-1 rounded-full bg-accent" title="Tier-weighted" />}
        </span>
        <span className={`font-mono tabular-nums font-semibold ${tone.color}`}>
          {isMissing ? DASH : v}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
          style={{ width: `${isMissing ? 0 : Math.max(0, Math.min(100, v))}%` }}
        />
      </div>
    </div>
  );
}

function ReturnChip({ label, value }: { label: string; value: number | null }) {
  const isMissing = value == null;
  const pos = value != null && value >= 0;
  return (
    <div className="flex flex-col items-start rounded-md border border-border/60 bg-card px-3 py-2">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-display text-base tabular-nums ${isMissing ? "text-muted-foreground" : pos ? "text-emerald-700" : "text-rose-700"}`}>
        {isMissing ? DASH : fmtPct(value, 2, true)}
      </span>
    </div>
  );
}

// Score ring (SVG)
function ScoreRing({ score, action }: { score: number; action: VerdictAction }) {
  const r = 64, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * c;
  const stroke = action === "BUY" ? "#0e9f6e" : action === "AVOID" || action === "SELL" ? "#c0392b" : action === "WATCHLIST" ? "#3498db" : "#d68910";
  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
        <circle
          cx="80" cy="80" r={r} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 700ms ease" }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl tabular-nums text-foreground">{score}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Stockera Score</span>
      </div>
    </div>
  );
}

// Price band visual for trade levels
function PriceBand({ levels, current }: { levels: StockAnalysisPayload["levels"]; current: number | null }) {
  const points = [
    { v: levels.support_2, label: "S2", color: "bg-rose-500" },
    { v: levels.support_1, label: "S1", color: "bg-rose-400" },
    { v: levels.stop_loss, label: "SL", color: "bg-red-700" },
    { v: current,          label: "LTP", color: "bg-primary" },
    { v: levels.resistance_1, label: "R1", color: "bg-emerald-400" },
    { v: levels.target_1, label: "T1", color: "bg-emerald-500" },
    { v: levels.resistance_2, label: "R2", color: "bg-emerald-600" },
    { v: levels.target_2, label: "T2", color: "bg-emerald-700" },
  ].filter((p) => p.v != null) as Array<{ v: number; label: string; color: string }>;
  if (points.length < 2) {
    return <p className="text-sm text-muted-foreground italic">Insufficient level data for visualization.</p>;
  }
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const span = max - min || 1;
  return (
    <div className="relative my-6 h-16">
      <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-rose-300 via-border to-emerald-300" />
      {points.map((p, i) => {
        const x = ((p.v - min) / span) * 100;
        const flip = i % 2 === 0;
        return (
          <div key={p.label} className="absolute -translate-x-1/2" style={{ left: `${x}%`, top: 0 }}>
            <div className={`mx-auto h-3 w-3 rounded-full ${p.color} ring-2 ring-background`} style={{ marginTop: "26px" }} />
            <div className={`absolute left-1/2 ${flip ? "-top-1" : "top-12"} -translate-x-1/2 whitespace-nowrap text-center`}>
              <div className="font-mono text-[10px] uppercase text-muted-foreground">{p.label}</div>
              <div className="font-display text-xs tabular-nums">{fmtPrice(p.v)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

export function StockAnalysisReport({ data }: { data: StockAnalysisPayload }) {
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

  // R:R from levels
  const rr = useMemo(() => {
    const e = levels.entry_zone, sl = levels.stop_loss, t = levels.target_1;
    if (e == null || sl == null || t == null) return null;
    const risk = Math.abs(e - sl), reward = Math.abs(t - e);
    if (risk === 0) return null;
    return reward / risk;
  }, [levels]);

  return (
    <TooltipProvider delayDuration={150}>
      <article className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 md:px-6 print:max-w-none print:py-0">

        {/* ═══ 1. HEADER STRIP ═══ */}
        <header className="rounded-2xl border border-border bg-card px-6 py-5 shadow-card">
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
              <div className="mt-1 text-[11px] text-muted-foreground">
                <span className="font-mono">via {price_context.price_source || "live feed"}</span> · as of {fmtDateShort(as_of_date)}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> SEBI-aligned analysis</span>
            <span>·</span>
            <span>{TIER_LABEL[tier]}</span>
            <span>·</span>
            <span>{final_verdict.time_horizon}</span>
          </div>
        </header>

        {/* ═══ 2. VERDICT HERO ═══ */}
        <section className={`rounded-2xl border border-border bg-gradient-to-br ${verdictStyle.ring} px-6 py-8 md:px-10 md:py-10`}>
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Final verdict</p>
              <div className="mt-2 flex flex-wrap items-baseline gap-4">
                <h2 className={`font-display text-5xl md:text-6xl ${verdictStyle.accent}`}>{verdictStyle.label.toUpperCase()}</h2>
                <Badge variant="outline" className={`text-xs ${verdictStyle.chip}`}>{TIER_LABEL[tier]}</Badge>
              </div>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-foreground/85">{final_verdict.summary_reason}</p>
              <p className="mt-3 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Based on tier-aware analysis · model {audit_meta.verdict_model_version}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl border border-border/60 bg-background/70 px-6 py-5 backdrop-blur">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</p>
              <p className="font-display text-5xl tabular-nums text-foreground">{final_verdict.confidence_pct}<span className="text-2xl text-muted-foreground">%</span></p>
            </div>
          </div>
        </section>

        {/* ═══ 3. CONFIDENCE / RISK / REWARD TRIAD ═══ */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <TriadCard icon={Gauge} eyebrow="Confidence" value={`${final_verdict.confidence_pct}%`} sub="Model conviction" />
          <TriadCard icon={ShieldCheck} eyebrow="Risk profile" value={labelize(final_verdict.risk_label)} sub={`Score ${score_breakdown.risk_score || DASH}`} />
          <TriadCard icon={Target} eyebrow="Reward potential" value={rr != null ? `${rr.toFixed(2)} : 1 R:R` : DASH} sub={rr != null ? "Entry → T1 vs Stop" : "Insufficient levels"} />
        </section>

        {/* ═══ 4 + 5. SCORE RING + BREAKDOWN ═══ */}
        {report_modules.show_score_ring && (
          <section className="rounded-2xl border border-border bg-card px-6 py-7">
            <SectionTitle eyebrow="Composite score" title="Stockera Score & Pillars" icon={BarChart3} />
            <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
              <ScoreRing score={final_verdict.overall_score} action={final_verdict.action} />
              <div className="space-y-3">
                {SECTION_ORDER[tier].map((k) => {
                  const map: Record<typeof k, { label: string; key: keyof ScoreBreakdown }> = {
                    technical:   { label: "Technical",   key: "technical_score" },
                    fundamental: { label: "Fundamental", key: "fundamental_score" },
                    risk:        { label: "Risk",        key: "risk_score" },
                    momentum:    { label: "Momentum",    key: "momentum_score" },
                  };
                  const m = map[k];
                  const s = score_breakdown[m.key];
                  return <ScoreBar key={k} label={m.label} value={s || null} weighted={(weights[k] ?? 0) >= 0.25} />;
                })}
                <ScoreBar label="Sentiment" value={score_breakdown.sentiment_score || null} weighted={(weights.sentiment ?? 0) >= 0.15} />
                <p className="pt-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  <span className="inline-block h-1 w-1 rounded-full bg-accent align-middle" /> tier-weighted pillar for {TIER_LABEL[tier].toLowerCase()}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ═══ 6. 4-CARD METRIC GRID ═══ */}
        <section className="grid gap-4 md:grid-cols-2">
          {SECTION_ORDER[tier].map((kind) => {
            if (kind === "technical") {
              return (
                <DimensionCard key={kind} eyebrow="Trend & technicals" title="Technical pulse" icon={LineChart} score={score_breakdown.technical_score}>
                  <div className="grid grid-cols-3 gap-3">
                    <Metric label="RSI(14)" value={fmtNum(technical_snapshot.rsi)} tone={technical_snapshot.rsi != null && (technical_snapshot.rsi > 70 || technical_snapshot.rsi < 30) ? "text-amber-700" : ""} />
                    <Metric label="MACD" value={labelize(technical_snapshot.macd_signal)} />
                    <Metric label="ADX" value={fmtNum(technical_snapshot.adx)} />
                    <Metric label="Trend" value={labelize(technical_snapshot.trend_label)} />
                    <Metric label="EMA stack" value={labelize(technical_snapshot.ema_stack)} />
                    <Metric label="Bollinger" value={labelize(technical_snapshot.bollinger_position)} />
                  </div>
                  <CardFootline tone={score_breakdown.technical_score} dim="technicals" />
                </DimensionCard>
              );
            }
            if (kind === "momentum") {
              return (
                <DimensionCard key={kind} eyebrow="Momentum" title="Momentum & strength" icon={Activity} score={score_breakdown.momentum_score}>
                  <div className="grid grid-cols-3 gap-3">
                    <Metric label="RS vs NIFTY" value={fmtPct(momentum_snapshot.relative_strength_vs_nifty, 2, true)} />
                    <Metric label="Trend strength" value={labelize(momentum_snapshot.trend_strength)} />
                    <Metric label="Regime" value={labelize(momentum_snapshot.momentum_label)} />
                    {momentum_snapshot.volume_confirmation && (
                      <Metric label="Volume" value={labelize(momentum_snapshot.volume_confirmation)} />
                    )}
                  </div>
                  <CardFootline tone={score_breakdown.momentum_score} dim="momentum" />
                </DimensionCard>
              );
            }
            if (kind === "fundamental") {
              return (
                <DimensionCard key={kind} eyebrow="Fundamentals" title="Quality & valuation" icon={Building2} score={score_breakdown.fundamental_score} muted={flags.banking_override_applied && (fundamental_snapshot.altman_z_score == null)}>
                  <div className="grid grid-cols-3 gap-3">
                    <Metric label="P/E" value={fmtNum(fundamental_snapshot.pe_ratio)} />
                    <Metric label="ROE" value={fmtPct(fundamental_snapshot.roe)} />
                    <Metric label="F-Score" value={fundamental_snapshot.piotroski_f_score != null ? `${fundamental_snapshot.piotroski_f_score}/9` : DASH} />
                    <Metric label="Altman Z" value={fmtNum(fundamental_snapshot.altman_z_score)} hint={flags.banking_override_applied ? "Banks use regulatory CAR; Altman Z is not meaningful for financials." : undefined} />
                    <Metric label="DCF upside" value={fundamental_snapshot.dcf_upside_pct != null && fundamental_snapshot.dcf_upside_pct > -95 ? fmtPct(fundamental_snapshot.dcf_upside_pct, 1, true) : DASH} />
                    <Metric label="Valuation" value={labelize(fundamental_snapshot.valuation_label)} />
                  </div>
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
                <div className="grid grid-cols-3 gap-3">
                  <Metric label="Beta" value={fmtNum(risk_snapshot.beta)} tone={riskTone("beta", risk_snapshot.beta)} />
                  <Metric label="Vol (1Y)" value={fmtPct(risk_snapshot.volatility_1y, 1)} tone={riskTone("vol", risk_snapshot.volatility_1y)} />
                  <Metric label="Sharpe" value={fmtNum(risk_snapshot.sharpe_ratio)} tone={riskTone("sharpe", risk_snapshot.sharpe_ratio)} />
                  <Metric label="Sortino" value={fmtNum(risk_snapshot.sortino_ratio)} tone={riskTone("sortino", risk_snapshot.sortino_ratio)} />
                  <Metric label="Max DD" value={fmtPct(risk_snapshot.max_drawdown, 1, true)} tone={riskTone("dd", risk_snapshot.max_drawdown)} />
                  <Metric label="Liquidity" value={labelize(risk_snapshot.liquidity_label)} />
                </div>
                <CardFootline tone={score_breakdown.risk_score} dim="risk" />
              </DimensionCard>
            );
          })}
        </section>

        {/* ═══ 7. WHAT TO DO NOW ═══ */}
        <section className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="Action zone" title="What to do now" icon={Compass} />
          <Tabs defaultValue={TIER_DEFAULT_TAB[tier]} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="holding">I'm holding</TabsTrigger>
              <TabsTrigger value="fresh">Fresh entry</TabsTrigger>
              <TabsTrigger value="exploring">Just exploring</TabsTrigger>
            </TabsList>
            <TabsContent value="holding" className="mt-5">
              <ActionPanel action={final_verdict.action} mode="holding" tier={tier} levels={levels} />
            </TabsContent>
            <TabsContent value="fresh" className="mt-5">
              <ActionPanel action={final_verdict.action} mode="fresh" tier={tier} levels={levels} />
            </TabsContent>
            <TabsContent value="exploring" className="mt-5">
              <ActionPanel action={final_verdict.action} mode="exploring" tier={tier} levels={levels} />
            </TabsContent>
          </Tabs>
        </section>

        {/* ═══ 8. TRADE LEVELS ═══ */}
        <section className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="Trade levels" title="Key price zones" icon={Target} />
          <PriceBand levels={levels} current={price_context.current_price} />
          <div className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-4">
            <LevelCell label="Entry" value={levels.entry_zone} tone="text-primary" />
            <LevelCell label="Stop loss" value={levels.stop_loss} tone="text-red-700" />
            <LevelCell label="Target 1" value={levels.target_1} tone="text-emerald-700" />
            <LevelCell label="Target 2" value={levels.target_2} tone="text-emerald-700" />
            <LevelCell label="Support 1" value={levels.support_1} />
            <LevelCell label="Support 2" value={levels.support_2} />
            <LevelCell label="Resistance 1" value={levels.resistance_1} />
            <LevelCell label="Resistance 2" value={levels.resistance_2} />
          </div>
        </section>

        {/* ═══ 9. RETURNS SNAPSHOT ═══ */}
        {report_modules.show_returns_strip && (
          <section className="rounded-2xl border border-border bg-card px-6 py-7">
            <SectionTitle eyebrow="Performance" title="Returns snapshot" icon={TrendingUp} />
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              <ReturnChip label="1W" value={returns_snapshot.one_week} />
              <ReturnChip label="1M" value={returns_snapshot.one_month} />
              <ReturnChip label="3M" value={returns_snapshot.three_month} />
              <ReturnChip label="1Y" value={returns_snapshot.one_year} />
              <ReturnChip label="vs NIFTY 1M" value={returns_snapshot.vs_nifty_one_month} />
              <ReturnChip label="vs NIFTY 3M" value={returns_snapshot.vs_nifty_three_month} />
            </div>
          </section>
        )}

        {/* ═══ 10. FUNDAMENTAL DEEP-DIVE ═══ */}
        <section className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="Fundamental analysis" title="Quality of business & valuation" icon={Building2} />
          <p className="mb-5 max-w-3xl leading-relaxed text-foreground/85">
            {fundamentalProse(fundamental_snapshot, flags.banking_override_applied)}
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
            <Metric label="P/E ratio" value={fmtNum(fundamental_snapshot.pe_ratio)} hint="Price relative to earnings; sector context matters." />
            <Metric label="Return on equity" value={fmtPct(fundamental_snapshot.roe)} />
            <Metric label="Piotroski F-Score" value={fundamental_snapshot.piotroski_f_score != null ? `${fundamental_snapshot.piotroski_f_score} / 9` : DASH} hint="0–9 quality score: 7+ is strong, 3 or less is weak." />
            <Metric label="Altman Z-Score" value={fmtNum(fundamental_snapshot.altman_z_score)} hint="Bankruptcy risk: >2.99 safe, 1.81–2.99 grey, <1.81 distress. Not meaningful for banks." />
            <Metric label="DCF upside" value={fundamental_snapshot.dcf_upside_pct != null && fundamental_snapshot.dcf_upside_pct > -95 ? fmtPct(fundamental_snapshot.dcf_upside_pct, 1, true) : DASH} hint="Discounted-cash-flow intrinsic value vs current price." />
            <Metric label="Valuation tag" value={labelize(fundamental_snapshot.valuation_label)} />
          </div>
          {flags.banking_override_applied && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-900">
              Banking-sector override: solvency assessed via regulatory CAR rather than Altman Z, and DCF is replaced by dividend-discount frameworks in deeper analyst review.
            </div>
          )}
        </section>

        {/* ═══ 11. TECHNICAL DEEP-DIVE ═══ */}
        <section className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="Technical analysis" title="Trend, momentum & structure" icon={LineChart} />
          <p className="mb-5 max-w-3xl leading-relaxed text-foreground/85">
            {technicalProse(technical_snapshot)}
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
            <Metric label="RSI (14)" value={fmtNum(technical_snapshot.rsi)} hint="Overbought >70, oversold <30." />
            <Metric label="MACD signal" value={labelize(technical_snapshot.macd_signal)} />
            <Metric label="ADX (trend strength)" value={fmtNum(technical_snapshot.adx)} hint=">25 indicates a trending market." />
            <Metric label="Trend direction" value={labelize(technical_snapshot.trend_label)} />
            <Metric label="EMA stack" value={labelize(technical_snapshot.ema_stack)} hint="Stacked EMAs (20>50>200) signal trend alignment." />
            <Metric label="Bollinger band" value={labelize(technical_snapshot.bollinger_position)} />
          </div>
        </section>

        {/* ═══ 12. RISK RADAR ═══ */}
        <section className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="Risk radar" title="What could go wrong" icon={AlertTriangle} />
          <p className="mb-5 max-w-3xl leading-relaxed text-foreground/85">
            {riskProse(risk_snapshot)}
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
            <Metric label="Beta" value={fmtNum(risk_snapshot.beta)} tone={riskTone("beta", risk_snapshot.beta)} hint="Sensitivity to NIFTY; >1 amplifies market moves." />
            <Metric label="Annualized volatility" value={fmtPct(risk_snapshot.volatility_1y, 1)} tone={riskTone("vol", risk_snapshot.volatility_1y)} />
            <Metric label="Sharpe ratio" value={fmtNum(risk_snapshot.sharpe_ratio)} tone={riskTone("sharpe", risk_snapshot.sharpe_ratio)} hint="Risk-adjusted return vs risk-free rate." />
            <Metric label="Sortino ratio" value={fmtNum(risk_snapshot.sortino_ratio)} tone={riskTone("sortino", risk_snapshot.sortino_ratio)} hint="Penalises only downside volatility." />
            <Metric label="Max drawdown" value={fmtPct(risk_snapshot.max_drawdown, 1, true)} tone={riskTone("dd", risk_snapshot.max_drawdown)} />
            <Metric label="VaR 95%" value={fmtPct(risk_snapshot.var_95, 2, true)} tone={riskTone("var", risk_snapshot.var_95)} hint="Daily loss not expected to exceed in 95% of cases." />
          </div>
          {flags.benchmark_fallback_used && (
            <p className="mt-4 text-[11px] italic text-muted-foreground">Benchmark fallback was applied for relative measures — interpret beta and RS with care.</p>
          )}
        </section>

        {/* ═══ 13. MOMENTUM ═══ */}
        <section className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="Momentum" title="Relative strength & regime" icon={Flame} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Metric label="RS vs NIFTY (3M)" value={fmtPct(momentum_snapshot.relative_strength_vs_nifty, 2, true)} />
            <Metric label="Trend strength" value={labelize(momentum_snapshot.trend_strength)} />
            <Metric label="Regime" value={labelize(momentum_snapshot.momentum_label)} />
            {momentum_snapshot.volume_confirmation
              ? <Metric label="Volume" value={labelize(momentum_snapshot.volume_confirmation)} />
              : <Metric label="Volume" value={DASH} hint="Volume confirmation not available for this period." />}
          </div>
        </section>

        {/* ═══ 14. NEWS & SENTIMENT ═══ */}
        <section className="rounded-2xl border border-border bg-card px-6 py-7">
          <SectionTitle eyebrow="News & sentiment" title="Narrative pulse" icon={Newspaper} />
          {report_modules.show_news_widget && sentiment_snapshot.news_sentiment_score != null ? (
            <div className="grid items-start gap-6 md:grid-cols-[auto_1fr]">
              <div className="rounded-xl border border-border bg-background/60 px-5 py-4 text-center">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Sentiment</p>
                <p className="mt-1 font-display text-3xl tabular-nums">{fmtNum(sentiment_snapshot.news_sentiment_score, 0)}</p>
                <Badge variant="outline" className="mt-2 text-[10px]">{labelize(sentiment_snapshot.sentiment_label)}</Badge>
              </div>
              <div className="space-y-3">
                <Metric label="Articles (30d)" value={String(sentiment_snapshot.article_count)} />
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
        </section>

        {/* ═══ 15. BEHAVIORAL FINANCE ALERT ═══ */}
        {nudge && (
          <section className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/10 to-gold/5 px-6 py-5">
            <div className="flex items-start gap-3">
              <Brain className="mt-0.5 h-5 w-5 text-[hsl(var(--gold-foreground))]" />
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--gold-foreground))]">Behavioral nudge</p>
                <h3 className="mt-0.5 font-display text-lg text-foreground">{nudge.title}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-foreground/85">{nudge.body}</p>
              </div>
            </div>
          </section>
        )}

        {/* ═══ 16. STOCKS IN FOCUS (scaffolded) ═══ */}
        <section className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-7">
          <SectionTitle eyebrow="Also consider" title="Peers in the same sector" icon={Sparkles} />
          {report_modules.show_stocks_in_focus ? (
            <p className="text-sm text-muted-foreground">Loading peer set…</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Peer comparison rolling out in the next release — we'll surface 3 alternative names in {stock.sector || "this sector"} with side-by-side scores.</p>
          )}
        </section>

        {/* ═══ 17. SUMMARY RECOMMENDATION ═══ */}
        <section className="rounded-2xl border border-border bg-gradient-brand-soft px-6 py-7 text-white">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">In summary</p>
          <h2 className="mt-1 font-display text-2xl">Analyst-style recap</h2>
          <ol className="mt-4 max-w-3xl space-y-2 text-[15px] leading-relaxed text-white/95">
            <li><span className="font-mono text-white/60">01 ·</span> Final view: <strong>{verdictStyle.label}</strong> with {final_verdict.confidence_pct}% confidence on a {final_verdict.time_horizon.toLowerCase()} horizon.</li>
            <li><span className="font-mono text-white/60">02 ·</span> {recapDriverLine(score_breakdown, tier)}</li>
            <li><span className="font-mono text-white/60">03 ·</span> Risk profile is <strong>{labelize(final_verdict.risk_label)}</strong>{rr != null ? ` — current setup offers ${rr.toFixed(2)}:1 reward-to-risk` : ""}.</li>
          </ol>
        </section>

        {/* ═══ 18. AUDIT & TRUST FOOTER ═══ */}
        <footer className="rounded-2xl border border-border bg-muted/30 px-6 py-5 text-[11px] text-muted-foreground">
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
        </footer>
      </article>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────
// Small composed components & prose generators
// ─────────────────────────────────────────────────────────────────

function TriadCard({ icon: Icon, eyebrow, value, sub }: { icon: React.ComponentType<{ className?: string }>; eyebrow: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <p className="mt-2 font-display text-2xl text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function DimensionCard({
  eyebrow, title, icon: Icon, score, muted, children,
}: { eyebrow: string; title: string; icon: React.ComponentType<{ className?: string }>; score: number | null; muted?: boolean; children: React.ReactNode }) {
  const tone = SCORE_TONE(score);
  return (
    <div className={`rounded-2xl border border-border bg-card px-5 py-5 ${muted ? "opacity-90" : ""}`}>
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-accent" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
            <h3 className="font-display text-lg text-foreground leading-tight">{title}</h3>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-display text-2xl tabular-nums ${tone.color}`}>{score || DASH}</p>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{tone.label}</p>
        </div>
      </div>
      {children}
    </div>
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

function LevelCell({ label, value, tone }: { label: string; value: number | null; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
      {value == null ? (
        <Tooltip>
          <TooltipTrigger asChild><p className="font-display text-lg cursor-help text-muted-foreground">{DASH}</p></TooltipTrigger>
          <TooltipContent>Level not derivable from current data window.</TooltipContent>
        </Tooltip>
      ) : (
        <p className={`font-display text-lg tabular-nums ${tone || "text-foreground"}`}>{fmtPrice(value)}</p>
      )}
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
