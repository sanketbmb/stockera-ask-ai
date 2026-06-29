import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle, BadgeCheck, Brain, Clock, Download, HelpCircle,
  Info, MessageCircle, Newspaper, Share2, TrendingUp, Video,
} from "lucide-react";
import { AddToPortfolioButton } from "@/components/portfolio/AddToPortfolioButton";
import { ReportCtaStrip } from "@/components/report/ReportCtaStrip";
import { BookAnalystVideoButton } from "@/components/payment/BookAnalystVideoButton";
import { useAuth } from "@/contexts/AuthContext";

// v1.0 schema (canonical) — older keys kept optional for backward compat
export interface AIReportV2 {
  // v1.0 fields
  report_version?: string;
  intent_acknowledged?: string;
  position_snapshot?: { summary_line?: string; key_metric_observed?: string };
  what_ai_can_observe?: string[];
  context_relevant_to_user_question?: string;
  risks_to_monitor?: string[];
  what_only_analyst_can_decide?: string[];
  data_confidence?: {
    data_coverage?: "high" | "medium" | "low";
    data_recency?: "high" | "medium" | "low";
    specificity?: "high" | "medium" | "low";
    overall_label?: string;
  };
  requires_analyst_review?: boolean;
  sources_used?: Array<{ type: string; reference: string; date?: string }>;
  // legacy fields (fallback)
  ai_position_observation?: string;
  confidence_label?: "data_rich" | "limited_data" | "needs_analyst_review";
  confidence_breakdown?: { data_coverage: number; recency: number; specificity: number };
  what_ai_can_tell_you?: string[];
  what_only_analyst_can_tell_you?: string[];
  recent_news_context?: string[];
  stock_specific_risks?: string[];
  behavioral_note?: string;
  tags?: string[];
  // meta
  stock_symbol?: string | null;
  stock_name?: string;
  ltp_value?: number | null;
  ltp_timestamp?: string | null;
  ltp_source?: string | null;
  ltp_exchange?: string | null;
  pnl_state?: string;
  intent?: string;
  report_id?: string;
  generated_at?: string;
}

const QUAL_TO_PCT: Record<string, number> = { high: 90, medium: 60, low: 30 };

export interface ReportMetaV2 {
  id: string;
  createdAt: string;
  stockName: string;
  stockSymbol: string | null;
  buyPrice: number | null;
  currentPrice: number | null;
  analystName?: string | null;
  analystSebi?: string | null;
  analystAvatar?: string | null;
}

const FIRM = {
  raReg: "INH000000000 (pending)",
  baslReg: "BASL-0000 (pending)",
  grievanceEmail: "grievance@stockera.in",
  scoresUrl: "https://scores.sebi.gov.in",
};

const ANALYST_COVERS = [
  "Specific entry/exit levels for your position",
  "Stop-loss calibrated to your risk profile",
  "Position sizing & sector outlook",
];

function pnlPct(buy: number | null, cur: number | null) {
  if (!buy || !cur) return null;
  return ((cur - buy) / buy) * 100;
}

function useCountdown(deadline: Date) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, deadline.getTime() - now.getTime());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return { hours: h, mins: m, secs: s, done: ms === 0 };
}

function timeHeld(buyAt: string | null | undefined): string {
  if (!buyAt) return "—";
  const days = Math.floor((Date.now() - new Date(buyAt).getTime()) / 86_400_000);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function AIReportCardV2({ report, meta }: { report: AIReportV2; meta: ReportMetaV2 }) {
  const { user } = useAuth();
  const ltp = report.ltp_value ?? meta.currentPrice;
  const pnl = pnlPct(meta.buyPrice, ltp);
  const deadline = useMemo(() => new Date(new Date(meta.createdAt).getTime() + 24 * 3_600_000), [meta.createdAt]);
  const { hours, mins, secs, done } = useCountdown(deadline);

  // ---- Normalize v1.0 schema with legacy fallback ----
  const observation =
    report.position_snapshot?.summary_line
    ?? report.ai_position_observation
    ?? "";
  const contextLine = report.context_relevant_to_user_question ?? "";
  const aiBullets = report.what_ai_can_observe ?? report.what_ai_can_tell_you ?? [];
  const analystBullets = report.what_only_analyst_can_decide ?? report.what_only_analyst_can_tell_you ?? [];
  const riskBullets = report.risks_to_monitor ?? report.stock_specific_risks ?? [];
  const newsBullets = (report.recent_news_context ?? []) as string[];
  const dc = report.data_confidence;
  const coverPct = report.confidence_breakdown?.data_coverage ?? QUAL_TO_PCT[dc?.data_coverage ?? "medium"];
  const recencyPct = report.confidence_breakdown?.recency ?? QUAL_TO_PCT[dc?.data_recency ?? "medium"];
  const specPct = report.confidence_breakdown?.specificity ?? QUAL_TO_PCT[dc?.specificity ?? "medium"];
  const confLabelKey: "data_rich" | "limited_data" | "needs_analyst_review" =
    report.confidence_label
    ?? (dc?.overall_label?.startsWith("Data-rich") ? "data_rich"
      : dc?.overall_label?.startsWith("Insufficient") ? "needs_analyst_review"
      : "limited_data");

  const confLabel = {
    data_rich: { text: "Confidence: Data-rich", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
    limited_data: { text: "Confidence: Limited data", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
    needs_analyst_review: { text: "Confidence: Needs analyst review", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  }[confLabelKey];

  const handleShare = async () => {
    const url = window.location.href;
    const txt = `${meta.stockName} — AI context report from Stockera`;
    if (navigator.share) { try { await navigator.share({ title: txt, url }); return; } catch {} }
    window.open(`https://wa.me/?text=${encodeURIComponent(txt + " " + url)}`, "_blank");
  };

  return (
    <TooltipProvider>
      <article className="mx-auto max-w-4xl space-y-6 print:max-w-none pb-24 md:pb-8">
        {/* ===== HEADER ===== */}
        <header className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-accent">AI Context Report</p>
              <h1 className="font-display text-3xl md:text-4xl mt-1">{meta.stockName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {meta.stockSymbol && <Badge variant="outline" className="font-mono text-[11px]">{report.ltp_exchange ?? "NSE"}: {meta.stockSymbol}</Badge>}
                <Badge variant="outline" className={`${confLabel.color} text-[11px]`}>{confLabel.text}</Badge>
                {(report.tags ?? []).map((t) => <Badge key={t} variant="secondary" className="text-[11px]">{t}</Badge>)}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground font-mono">
              <div>Report ID: {meta.id.slice(0, 8).toUpperCase()}</div>
              <div>{new Date(meta.createdAt).toLocaleString("en-IN")}</div>
            </div>
          </div>
        </header>

        {/* ===== LIVE PRICE CARD ===== */}
        <section className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Live Market Price</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display text-4xl">{ltp ? `₹${Number(ltp).toFixed(2)}` : "—"}</span>
                {report.ltp_exchange && <Badge variant="outline" className="text-[10px]">{report.ltp_exchange}</Badge>}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-0.5">
              <p>via {report.ltp_source ?? "—"}</p>
              <p className="font-mono">{report.ltp_timestamp ? new Date(report.ltp_timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "—"}</p>
            </div>
          </div>
        </section>

        {/* ===== POSITION SNAPSHOT (replaces verdict) ===== */}
        <section className="rounded-2xl border border-border bg-gradient-to-br from-slate-500/5 to-teal-500/5 p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Position Snapshot</p>
              <h2 className="font-display text-2xl mt-1">AI Position Observation</h2>
            </div>
            <Badge className="bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">Awaiting Analyst Review</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <SnapStat label="Entry" value={meta.buyPrice ? `₹${meta.buyPrice}` : "—"} />
            <SnapStat label="LTP" value={ltp ? `₹${Number(ltp).toFixed(2)}` : "—"} />
            <SnapStat label="P&L"
              value={pnl !== null ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%` : "—"}
              className={pnl === null ? "" : pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} />
            <SnapStat label="Held" value={timeHeld(meta.createdAt)} />
            <SnapStat label="Intent" value={report.intent?.replace(/_/g, " ") ?? "—"} />
          </div>
          <p className="text-base md:text-lg leading-relaxed text-foreground/90">{observation}</p>
          {report.position_snapshot?.key_metric_observed && (
            <p className="mt-2 text-sm text-muted-foreground italic">{report.position_snapshot.key_metric_observed}</p>
          )}
          {contextLine && (
            <p className="mt-3 text-sm text-foreground/85 border-l-2 border-primary/40 pl-3">{contextLine}</p>
          )}
        </section>

        {/* ===== ANALYST VIDEO COUNTDOWN ===== */}
        <section className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-accent/5 to-transparent p-6 md:p-7">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-primary/15 p-3"><Video className="h-6 w-6 text-primary" /></div>
            <div className="flex-1">
              <p className="font-mono text-[10px] uppercase tracking-wider text-primary">Your Premium Deliverable</p>
              <h3 className="font-display text-2xl mt-0.5">Analyst Video Arriving</h3>
              <div className="mt-3 flex items-baseline gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <span className="font-display text-4xl md:text-5xl tabular-nums">
                  {done ? "Soon" : `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`}
                </span>
              </div>
              <div className="mt-4 rounded-lg border border-border bg-background/60 p-3">
                <div className="flex items-center gap-3">
                  {meta.analystAvatar ? (
                    <img src={meta.analystAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold">{(meta.analystName ?? "A")[0]}</div>
                  )}
                  <div>
                    <p className="font-semibold text-sm">{meta.analystName ?? "Analyst being assigned…"}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{meta.analystSebi ? `SEBI ${meta.analystSebi}` : "SEBI-Registered Research Analyst"}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {ANALYST_COVERS.map((c, i) => (
                    <li key={i} className="flex gap-2 text-xs"><BadgeCheck className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" /><span>{c}</span></li>
                  ))}
                </ul>
              </div>
              <div className="mt-4">
                <BookAnalystVideoButton queryId={meta.id} stockName={meta.stockName} className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground" />
                <p className="text-[10px] text-center text-muted-foreground mt-1.5">One-time ₹100 · Refund if unanswered in 24h</p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== CONFIDENCE BAR ===== */}
        <Card className="p-5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Analysis Confidence</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <ConfBar label="Data Coverage" value={coverPct} />
            <ConfBar label="Recency" value={recencyPct} />
            <ConfBar label="Specificity" value={specPct} />
          </div>
        </Card>

        {/* ===== WHAT AI / WHAT ANALYST ===== */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-5 border-blue-500/20">
            <h3 className="font-display text-lg flex items-center gap-2"><Info className="h-5 w-5 text-blue-500" /> What the AI can tell you</h3>
            <p className="text-[11px] text-muted-foreground mt-1">Factual observations from live data — no predictions.</p>
            <ul className="mt-3 space-y-2">
              {aiBullets.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm"><span className="text-blue-500 mt-1">•</span><span>{p}</span></li>
              ))}
            </ul>
          </Card>
          <Card className="p-5 border-primary/30 bg-primary/5">
            <h3 className="font-display text-lg flex items-center gap-2"><Video className="h-5 w-5 text-primary" /> What only your analyst can tell you</h3>
            <p className="text-[11px] text-muted-foreground mt-1">Personal recommendations arriving in your 24h video.</p>
            <ul className="mt-3 space-y-2">
              {analystBullets.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm"><span className="text-primary mt-1">→</span><span>{p}</span></li>
              ))}
            </ul>
            <div className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                    <HelpCircle className="h-3 w-3" /> Why we can't give you a target
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Specific buy/sell/target/stop-loss recommendations require a SEBI-registered Research Analyst's review of your full position and risk profile. Your analyst will provide these in the 24-hour video.
                </TooltipContent>
              </Tooltip>
            </div>
          </Card>
        </div>

        {/* ===== RECENT NEWS ===== */}
        {newsBullets.length > 0 && (
          <Card className="p-5">
            <h3 className="font-display text-lg flex items-center gap-2"><Newspaper className="h-5 w-5 text-accent" /> Recent News Context</h3>
            <ul className="mt-3 space-y-2">
              {newsBullets.map((n, i) => <li key={i} className="text-sm text-foreground/85">• {n}</li>)}
            </ul>
          </Card>
        )}

        {/* ===== STOCK-SPECIFIC RISKS ===== */}
        <Card className="p-5">
          <h3 className="font-display text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Stock-Specific Risks</h3>
          <ul className="mt-3 space-y-2">
            {riskBullets.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /><span>{r}</span></li>
            ))}
          </ul>
        </Card>

        {/* ===== BEHAVIORAL ===== */}
        {report.behavioral_note && (
          <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-5">
            <h4 className="font-display flex items-center gap-2"><Brain className="h-5 w-5 text-amber-600" /> Behavioral Note <span className="text-[10px] font-mono uppercase text-muted-foreground">({report.pnl_state})</span></h4>
            <p className="mt-2 text-sm">{report.behavioral_note}</p>
          </div>
        )}

        {/* ===== FOLLOW-UP CHAT ===== */}
        <Card className="p-5">
          <h3 className="font-display text-lg flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" /> Ask a follow-up about this stock</h3>
          <p className="text-xs text-muted-foreground mt-1">Your question will be added to the analyst's review queue.</p>
          <Textarea className="mt-3" rows={3} placeholder="e.g. What's the impact of the recent RBI guidelines on this stock?" />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="outline">Send to Analyst</Button>
          </div>
        </Card>

        {/* ===== ACTIONS ===== */}
        <div className="grid sm:grid-cols-2 gap-3 print:hidden">
          <AddToPortfolioButton
            queryId={meta.id}
            stockName={meta.stockName}
            stockSymbol={meta.stockSymbol}
            buyPrice={meta.buyPrice}
            currentPrice={ltp}
            target1=""
            stopLoss=""
          />
          <Button variant="outline" onClick={() => window.print()}><Download className="h-4 w-4 mr-2" /> Download PDF</Button>
          <Button variant="outline" onClick={handleShare}><Share2 className="h-4 w-4 mr-2" /> Share Report</Button>
        </div>

        {/* ===== COMPLIANCE FOOTER (sticky on mobile) ===== */}
        <footer className="rounded-xl border border-border bg-muted/30 p-4 text-[11px] text-muted-foreground space-y-1.5 md:static fixed bottom-0 left-0 right-0 md:relative z-30 backdrop-blur md:backdrop-blur-none">
          <p><strong>SEBI Compliance:</strong> RA Reg {FIRM.raReg} · BASL {FIRM.baslReg} · Grievance: <a href={`mailto:${FIRM.grievanceEmail}`} className="underline">{FIRM.grievanceEmail}</a> · <a href={FIRM.scoresUrl} target="_blank" rel="noopener" className="underline">SCORES</a></p>
          <p className="font-mono">Report ID: {meta.id} · Generated {new Date(report.generated_at ?? meta.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · Market data {report.ltp_timestamp ? new Date(report.ltp_timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "n/a"}</p>
          <p>AI-generated educational content. Not SEBI investment advice. Personalized recommendations come from your assigned SEBI-Registered Research Analyst within 24 hours.</p>
          <p className="print:block hidden italic">For {user?.email ?? "registered user"} only · Not for redistribution · Report ID {meta.id}</p>
        </footer>
      </article>
    </TooltipProvider>
  );
}

function SnapStat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display text-lg mt-0.5 ${className}`}>{value}</p>
    </div>
  );
}

function ConfBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold">{v}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
