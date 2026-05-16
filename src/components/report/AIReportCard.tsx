import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, BadgeCheck, Brain, CheckCircle2, Download, Lightbulb, MessageCircle, Quote, Share2, Sparkles, TrendingUp, Video } from "lucide-react";
import { AddToPortfolioButton } from "@/components/portfolio/AddToPortfolioButton";

export interface AIReport {
  verdict: string;
  verdictColor?: string;
  tagline: string;
  confidence: number;
  riskScore: number;
  rewardPotential: number;
  fundamentals: string;
  technical: string;
  risk: string;
  trend: string;
  momentum: string;
  supportZone: string;
  resistanceZone: string;
  stopLoss: string;
  target1: string;
  target2: string;
  timeHorizon: string;
  fundamentalPoints: string[];
  technicalPoints: string[];
  ifHoldingAction: string;
  ifAveragingRecommended: boolean;
  averagingZone: string;
  freshEntryZone: string;
  freshEntryTrigger: string;
  whatCanGoWrong: string[];
  expertQuote: string;
  closingInsight: string;
  behavioralReminder: string;
  pnlContext?: string;
  tags?: string[];
}

export interface ReportMeta {
  id: string;
  createdAt: string;
  stockName: string;
  stockSymbol: string | null;
  buyPrice: number | null;
  currentPrice: number | null;
}

const VERDICT_STYLES: Record<string, { bg: string; ring: string; text: string }> = {
  BUY: { bg: "bg-emerald-500/10", ring: "ring-emerald-500/40", text: "text-emerald-600 dark:text-emerald-400" },
  SELL: { bg: "bg-red-500/10", ring: "ring-red-500/40", text: "text-red-600 dark:text-red-400" },
  HOLD: { bg: "bg-orange-500/10", ring: "ring-orange-500/40", text: "text-orange-600 dark:text-orange-400" },
  AVERAGE: { bg: "bg-blue-500/10", ring: "ring-blue-500/40", text: "text-blue-600 dark:text-blue-400" },
  WAIT: { bg: "bg-yellow-500/10", ring: "ring-yellow-500/40", text: "text-yellow-700 dark:text-yellow-300" },
  PARTIAL_EXIT: { bg: "bg-purple-500/10", ring: "ring-purple-500/40", text: "text-purple-600 dark:text-purple-400" },
};

function pnlPct(buy: number | null, cur: number | null) {
  if (!buy || !cur) return null;
  return ((cur - buy) / buy) * 100;
}

export function AIReportCard({ report, meta }: { report: AIReport; meta: ReportMeta }) {
  const v = VERDICT_STYLES[report.verdict] ?? VERDICT_STYLES.HOLD;
  const pnl = pnlPct(meta.buyPrice, meta.currentPrice);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `${meta.stockName} — AI Report`, text: report.tagline, url }); return; } catch { /* ignore */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${meta.stockName} — ${report.verdict}: ${report.tagline} ${url}`)}`, "_blank");
  };

  return (
    <article className="mx-auto max-w-4xl space-y-6 print:max-w-none">
      {/* HEADER */}
      <header className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-accent">AI Analysis Report</p>
            <h1 className="font-display text-3xl md:text-4xl mt-1">{meta.stockName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {meta.stockSymbol && <Badge variant="outline" className="font-mono text-[11px]">NSE: {meta.stockSymbol}</Badge>}
              {(report.tags ?? []).map((t) => <Badge key={t} variant="secondary" className="text-[11px]">{t}</Badge>)}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground font-mono">
            <div>ID: {meta.id.slice(0, 8).toUpperCase()}</div>
            <div>{new Date(meta.createdAt).toLocaleString("en-IN")}</div>
          </div>
        </div>

        <div className="mt-5 grid sm:grid-cols-3 gap-3">
          <Stat label="Buy Price" value={meta.buyPrice ? `₹${meta.buyPrice}` : "—"} />
          <Stat label="Current Price" value={meta.currentPrice ? `₹${meta.currentPrice}` : "—"} />
          <Stat label="P&L"
            value={pnl !== null ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%` : "—"}
            className={pnl === null ? "" : pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
          />
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>AI-Generated Educational Report. Not SEBI Investment Advice. Consult a SEBI-registered Research Analyst before acting.</p>
        </div>
      </header>

      {/* VERDICT HERO */}
      <section className={`rounded-2xl border ring-1 ${v.ring} ${v.bg} p-8 text-center`}>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Our Verdict</p>
        <h2 className={`font-display tracking-tight ${v.text}`} style={{ fontSize: "clamp(48px, 9vw, 80px)", lineHeight: 1 }}>
          {report.verdict.replace("_", " ")}
        </h2>
        <p className="mt-3 text-base md:text-lg text-foreground/80 max-w-xl mx-auto">{report.tagline}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Pill icon={<Sparkles className="h-3.5 w-3.5" />} label="Confidence" value={`${report.confidence}%`} />
          <Pill icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Risk" value={report.risk} />
          <Pill icon={<TrendingUp className="h-3.5 w-3.5" />} label="Reward" value={`${report.rewardPotential}/10`} />
        </div>
        <blockquote className="mt-6 mx-auto max-w-2xl border-l-2 border-primary/40 pl-4 text-left text-sm italic text-foreground/80">
          <Quote className="h-4 w-4 inline mr-1 text-primary/60" />
          {report.expertQuote}
        </blockquote>
      </section>

      {/* METRICS GRID */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Metric label="Trend" value={report.trend} />
        <Metric label="Momentum" value={report.momentum} />
        <Metric label="Fundamentals" value={report.fundamentals} />
        <Metric label="Technical" value={report.technical} />
        <Metric label="Support Zone" value={report.supportZone} />
        <Metric label="Resistance Zone" value={report.resistanceZone} />
      </section>

      {/* WHAT TO DO NOW */}
      <Card className="p-6">
        <h3 className="font-display text-2xl">What To Do Now</h3>
        <Tabs defaultValue="holding" className="mt-4">
          <TabsList>
            <TabsTrigger value="holding">I'm Holding</TabsTrigger>
            <TabsTrigger value="fresh">Fresh Entry</TabsTrigger>
          </TabsList>
          <TabsContent value="holding" className="mt-4 space-y-3">
            <p className="text-sm font-medium">{report.ifHoldingAction}</p>
            <div className="grid sm:grid-cols-3 gap-2">
              <Chip color="red" label="Stop Loss" value={report.stopLoss} />
              <Chip color="green" label="Target 1" value={report.target1} />
              <Chip color="green" label="Target 2" value={report.target2} />
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>⏱ Time Horizon: <span className="text-foreground font-medium">{report.timeHorizon}</span></span>
              <span>📊 Averaging: <span className="text-foreground font-medium">{report.ifAveragingRecommended ? `Yes (${report.averagingZone})` : "Not recommended"}</span></span>
            </div>
          </TabsContent>
          <TabsContent value="fresh" className="mt-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-2">
              <Chip color="blue" label="Entry Zone" value={report.freshEntryZone} />
              <Chip color="amber" label="Trigger" value={report.freshEntryTrigger} />
            </div>
            <p className="text-xs text-red-600 dark:text-red-400">⚠ Do NOT enter below {report.stopLoss}</p>
          </TabsContent>
        </Tabs>
      </Card>

      {/* FUNDAMENTAL & TECHNICAL */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-display text-xl flex items-center gap-2"><BadgeCheck className="h-5 w-5 text-primary" /> Fundamental Analysis</h3>
          <ul className="mt-4 space-y-2">
            {report.fundamentalPoints.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /><span>{p}</span></li>
            ))}
          </ul>
        </Card>
        <Card className="p-6">
          <h3 className="font-display text-xl flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Technical Analysis</h3>
          <ul className="mt-4 space-y-2">
            {report.technicalPoints.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /><span>{p}</span></li>
            ))}
          </ul>
          <Separator className="my-4" />
          <table className="w-full text-xs">
            <tbody>
              <tr><td className="py-1 text-muted-foreground">Support</td><td className="text-right font-mono">{report.supportZone}</td></tr>
              <tr><td className="py-1 text-muted-foreground">Resistance</td><td className="text-right font-mono">{report.resistanceZone}</td></tr>
              <tr><td className="py-1 text-muted-foreground">Stop Loss</td><td className="text-right font-mono text-red-600 dark:text-red-400">{report.stopLoss}</td></tr>
              <tr><td className="py-1 text-muted-foreground">Target 1 / 2</td><td className="text-right font-mono text-emerald-600 dark:text-emerald-400">{report.target1} / {report.target2}</td></tr>
            </tbody>
          </table>
        </Card>
      </div>

      {/* RISK RADAR */}
      <Card className="p-6">
        <h3 className="font-display text-xl flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Risk Radar</h3>
        <ul className="mt-4 space-y-2">
          {report.whatCanGoWrong.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /><span>{r}</span></li>
          ))}
        </ul>
      </Card>

      {/* BEHAVIORAL */}
      <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-6">
        <h4 className="font-display text-lg flex items-center gap-2"><Brain className="h-5 w-5 text-amber-600" /> Behavioral Finance Alert</h4>
        <p className="mt-2 text-sm text-foreground/85">{report.behavioralReminder}</p>
      </div>

      {/* CLOSING */}
      <blockquote className="rounded-2xl border border-border bg-card p-6">
        <Lightbulb className="h-5 w-5 text-primary mb-2" />
        <p className="font-display text-lg leading-snug">{report.closingInsight}</p>
      </blockquote>

      {/* ACTIONS */}
      <div className="grid sm:grid-cols-2 gap-3 print:hidden">
        <AddToPortfolioButton
          queryId={meta.id}
          stockName={meta.stockName}
          stockSymbol={meta.stockSymbol}
          buyPrice={meta.buyPrice}
          currentPrice={meta.currentPrice}
          target1={report.target1}
          stopLoss={report.stopLoss}
        />
        <Button variant="outline" onClick={() => window.print()}><Download className="h-4 w-4 mr-2" /> Download PDF</Button>
        <Button variant="outline" onClick={handleShare}><Share2 className="h-4 w-4 mr-2" /> Share Report</Button>
        <Button className="bg-gradient-to-r from-primary to-accent text-primary-foreground"><Video className="h-4 w-4 mr-2" /> Book Video Answer →</Button>
        <Button variant="secondary"><MessageCircle className="h-4 w-4 mr-2" /> Ask Follow-up Question</Button>
      </div>

      <footer className="rounded-xl border border-border bg-muted/30 p-4 text-[11px] text-muted-foreground space-y-2">
        <p><strong>SEBI Disclaimer:</strong> This report is generated by AI based on publicly available market data. It is educational in nature and does not constitute investment advice under SEBI (Research Analysts) Regulations, 2014. Stockera connects users with SEBI-registered Research Analysts for personalized recommendations. Past performance is not indicative of future returns.</p>
        <p>Powered by Google Gemini AI · Curated by Stockera</p>
      </footer>
    </article>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl mt-0.5 ${className}`}>{value}</p>
    </div>
  );
}

function Pill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 border border-border px-3 py-1 text-xs">
      {icon}<span className="text-muted-foreground">{label}:</span><span className="font-semibold">{value}</span>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-semibold mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function Chip({ color, label, value }: { color: "red" | "green" | "blue" | "amber"; label: string; value: string }) {
  const styles = {
    red: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    blue: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  }[color];
  return (
    <div className={`rounded-lg border px-3 py-2 ${styles}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
      <p className="font-mono text-sm font-semibold">{value}</p>
    </div>
  );
}
