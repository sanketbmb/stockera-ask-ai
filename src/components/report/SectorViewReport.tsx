// Phase 3B — Sector View report variant. Renders inside the unified
// /report/$queryId route when query_type === "sector_view".

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Navbar } from "@/components/layout/Navbar";
import { Logo } from "@/components/common/Logo";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { freezeOrReadSectorReport } from "@/lib/sector-report.functions";
import type { SectorReportPayload } from "@/lib/sector-context";
import { SectorSummaryHero } from "@/components/report/SectorSummaryHero";
import { SectorMetricGrid } from "@/components/report/SectorMetricGrid";
import { SEBIDisclaimerInline } from "@/components/common/SEBIDisclaimer";
import { SUPPORTED_SECTOR_CHIPS } from "@/lib/sector-alias-map";
import type { RouterOutput } from "@/lib/intent-router-schema";
import { confidenceBand } from "@/lib/intent-router-schema";
import { FIRM } from "@/lib/firm-details";
import { DownloadPdfButton } from "@/components/report/DownloadPdfButton";
import { MotionConfig } from "framer-motion";

const LOADING_STEPS = [
  "Resolving sector…",
  "Loading sector aggregates…",
  "Composing macro view…",
  "Finalizing report…",
];

function LoadingScreen() {
  const [progress, setProgress] = useState(8);
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => Math.min(p + 6, 92));
      setStepIdx((i) => (i + 1) % LOADING_STEPS.length);
    }, 700);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="min-h-screen bg-mesh flex flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="animate-pulse"><Logo size="lg" linkTo={null} /></div>
      <div className="w-full max-w-sm">
        <Progress value={progress} className="h-2" />
        <p className="mt-3 text-sm text-muted-foreground font-mono">{LOADING_STEPS[stepIdx]}</p>
      </div>
    </div>
  );
}

function ReflectiveSectorBanner({
  rawQuestion,
  display,
  horizon,
  routerMeta,
}: {
  rawQuestion: string;
  display: string;
  horizon: string;
  routerMeta: RouterOutput | null;
}) {
  return (
    <section
      aria-label="Your question, preserved verbatim"
      className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 px-6 py-5 shadow-card"
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Your question</p>
      <blockquote className="mt-2 font-serif italic text-lg leading-relaxed text-foreground">
        &ldquo;{rawQuestion}&rdquo;
      </blockquote>
      <p className="mt-3 text-xs text-muted-foreground italic">
        Interpreted as: <span className="font-medium not-italic text-foreground/80">Sector View</span>
        {" · "}
        <span className="not-italic">{display}</span>
        {" · "}
        <span className="not-italic">{horizon.replace("-", " ")}</span>
      </p>
      {routerMeta && confidenceBand(routerMeta.confidence_score) === "high" && (
        <p className="mt-1 text-[11px] text-muted-foreground italic">
          Auto-routed via free-text router · confidence: high
        </p>
      )}
    </section>
  );
}

function FallbackPanel({
  reason,
  rawQuestion,
  unresolvedHint,
}: {
  reason: "not_resolved" | "not_covered";
  rawQuestion: string;
  unresolvedHint?: string | null;
}) {
  return (
    <div className="min-h-screen bg-mesh">
      <Navbar />
      <main className="px-4 sm:px-6 lg:px-8 py-10">
        <div className="mx-auto max-w-2xl space-y-6">
          <section className="rounded-2xl border border-border bg-card px-6 py-5 shadow-card">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Your question</p>
            <blockquote className="mt-2 font-serif italic text-lg text-foreground">&ldquo;{rawQuestion}&rdquo;</blockquote>
            {unresolvedHint && (
              <p className="mt-2 text-xs text-muted-foreground">
                We tried to interpret this as a sector view but couldn&rsquo;t confidently match it
                {unresolvedHint ? <> ({unresolvedHint})</> : null}.
              </p>
            )}
          </section>
          <section className="rounded-2xl border border-primary/30 bg-primary/5 px-6 py-5">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Sector coverage not available yet
            </p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {reason === "not_covered"
                ? "We don't have a populated sector profile for that sector yet."
                : "We couldn't match your question to a supported sector."}
              {" "}Try one of these sectors instead:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUPPORTED_SECTOR_CHIPS.map((c) => (
                <Button key={c.canonical} asChild size="sm" variant="outline" className="text-xs">
                  <Link to="/post-query">{c.display}</Link>
                </Button>
              ))}
            </div>
          </section>
          <Button asChild className="gap-2">
            <Link to="/post-query">Post another question <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

function AuditFooter({ payload }: { payload: SectorReportPayload }) {
  const a = payload.audit_footer;
  const ist = new Date(a.as_of_timestamp).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return (
    <section className="mt-8 rounded-xl border border-border bg-muted/30 px-5 py-4 text-[10.5px] leading-relaxed text-muted-foreground">
      <p className="font-mono text-[10px] uppercase tracking-wider text-foreground">Audit Footer</p>
      <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 font-mono text-[10px]">
        <span>engine: {a.engine_version}</span>
        <span>source: {a.engine_source}</span>
        <span>sector: {a.sector_canonical}</span>
        <span>macro: {a.macro_state}</span>
        <span>pe_median: {a.inputs.pe_median ?? "n/a"}</span>
        <span>pb_median: {a.inputs.pb_median ?? "n/a"}</span>
        <span>roe_median: {a.inputs.roe_median ?? "n/a"}</span>
        <span>sample_size: {a.inputs.sample_size ?? "n/a"}</span>
        <span>branch: {a.inputs.branch}</span>
        <span>method: {a.method_version}</span>
        <span>baseline: {a.source}</span>
        <span>as_of: {ist} IST</span>
      </div>
      <p className="mt-3">
        Prepared by <strong className="text-foreground">{FIRM.legalName}</strong> ({FIRM.brand}),
        SEBI {FIRM.sebiType} Reg. <strong>{FIRM.sebiRegNumber}</strong>.
        Past performance does not guarantee future results.
      </p>
    </section>
  );
}

export function SectorViewReport({
  queryId,
  rawQuestion,
  routerMeta,
}: {
  queryId: string;
  rawQuestion: string;
  routerMeta: RouterOutput | null;
}) {
  const freeze = useServerFn(freezeOrReadSectorReport);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sector-report", queryId],
    queryFn: () => freeze({ data: { queryId } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <LoadingScreen />;
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <p className="font-display text-2xl">Couldn&rsquo;t load this sector report</p>
          <p className="text-muted-foreground mt-2 text-sm">{(error as Error)?.message ?? "Unknown error"}</p>
          <Button className="mt-4" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (data.ok === false) {
    if (data.code === "SECTOR_NOT_RESOLVED") {
      return <FallbackPanel reason="not_resolved" rawQuestion={rawQuestion} unresolvedHint={data.raw_sector} />;
    }
    return <FallbackPanel reason="not_covered" rawQuestion={rawQuestion} unresolvedHint={data.display} />;
  }

  return (
    <div className="min-h-screen bg-mesh">
      <Navbar />
      <SectorReportBody
        payload={data.payload}
        rawQuestion={rawQuestion}
        routerMeta={routerMeta}
        printMode={false}
        queryId={queryId}
      />
    </div>
  );
}

// Presentational body — also rendered by /print-sector/$queryId.
// When `printMode` is true, analyst CTA + download button are suppressed.
export function SectorReportBody({
  payload,
  rawQuestion,
  routerMeta,
  printMode,
  queryId,
}: {
  payload: SectorReportPayload;
  rawQuestion: string;
  routerMeta: RouterOutput | null;
  printMode: boolean;
  queryId?: string;
}) {
  const body = (
    <main className="mx-auto max-w-5xl px-4 md:px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          SEBI-aligned sector overview · {payload.sector_display}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {payload.coverage_note}
        </span>
        {!printMode && queryId && (
          <div className="ml-auto"><DownloadPdfButton kind="sector" queryId={queryId} /></div>
        )}
      </div>

      <ReflectiveSectorBanner
        rawQuestion={rawQuestion}
        display={payload.sector_display}
        horizon={payload.horizon}
        routerMeta={routerMeta}
      />

      <SectorSummaryHero payload={payload} />
      <SectorMetricGrid payload={payload} />

      <section className="rounded-2xl border border-border bg-card/70 px-6 py-5 shadow-card">
        <h3 className="font-display text-base text-foreground">{payload.action_buckets.title}</h3>
        <ul className="mt-3 space-y-2 text-sm text-foreground/85 list-disc pl-5">
          {payload.action_buckets.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      </section>

      <section className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-5">
        <h3 className="font-display text-sm uppercase tracking-wider text-foreground">{payload.top_stocks_placeholder.title}</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{payload.top_stocks_placeholder.body}</p>
      </section>

      {!printMode && (
        <section
          aria-label="SEBI analyst guidance"
          className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 px-6 py-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
                <ShieldCheck className="h-3.5 w-3.5" /> SEBI-Registered Analyst
              </div>
              <p className="mt-1.5 font-display text-base text-foreground">
                Talk to an analyst about positioning in this sector
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                A SEBI-registered analyst can frame how to think about exposure within {payload.sector_display}.
              </p>
            </div>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/post-query">Request analyst follow-up</Link>
            </Button>
          </div>
        </section>
      )}

      <SEBIDisclaimerInline />
      <AuditFooter payload={payload} />
      {printMode && <div id="print-ready" />}
    </main>
  );
}
