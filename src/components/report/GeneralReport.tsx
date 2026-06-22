// Phase 3D — Renders the "Other / Ask Anything" AI report. Mirrors the
// chrome of SectorViewReport but renders a generic analyst-style answer
// produced by freezeOrReadGeneralReport.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Navbar } from "@/components/layout/Navbar";
import { Logo } from "@/components/common/Logo";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Sparkles, TrendingUp, AlertTriangle, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import {
  freezeOrReadGeneralReport,
  type GeneralReportPayload,
} from "@/lib/general-report.functions";
import { SEBIDisclaimerInline } from "@/components/common/SEBIDisclaimer";
import type { RouterOutput } from "@/lib/intent-router-schema";
import { confidenceBand } from "@/lib/intent-router-schema";
import { AnalystCtaCard } from "@/components/report/AnalystCtaCard";

const LOADING_STEPS = [
  "Reading your question…",
  "Consulting the AI research analyst…",
  "Drafting key points & risks…",
  "Running compliance guardrails…",
];

function LoadingScreen() {
  const [progress, setProgress] = useState(8);
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => Math.min(p + 4, 92));
      setStepIdx((i) => (i + 1) % LOADING_STEPS.length);
    }, 900);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="min-h-screen bg-mesh flex flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="animate-pulse">
        <Logo size="lg" linkTo={null} />
      </div>
      <div className="w-full max-w-sm">
        <Progress value={progress} className="h-2" />
        <p className="mt-3 text-sm text-muted-foreground font-mono">
          {LOADING_STEPS[stepIdx]}
        </p>
      </div>
      <p className="text-xs text-muted-foreground italic max-w-md">
        AI-generated overview · No buy/sell calls · SEBI analyst follow-up available
      </p>
    </div>
  );
}

export function GeneralReport({
  queryId,
  rawQuestion,
  routerMeta,
}: {
  queryId: string;
  rawQuestion: string;
  routerMeta: RouterOutput | null;
}) {
  const freeze = useServerFn(freezeOrReadGeneralReport);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["general-report", queryId],
    queryFn: () => freeze({ data: { queryId } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <LoadingScreen />;
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <p className="font-display text-2xl">Couldn't generate this report</p>
          <p className="text-muted-foreground mt-2 text-sm">
            {(error as Error)?.message ?? "Unknown error"}
          </p>
          <Button className="mt-4" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh">
      <Navbar />
      <GeneralReportBody payload={data.payload} rawQuestion={rawQuestion} routerMeta={routerMeta} queryId={queryId} />
    </div>
  );
}

function GeneralReportBody({
  payload,
  rawQuestion,
  routerMeta,
  queryId,
}: {
  payload: GeneralReportPayload;
  rawQuestion: string;
  routerMeta: RouterOutput | null;
  queryId: string;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 md:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Ask-anything AI overview · Powered by Lovable AI
        </span>
        {payload.fallback && (
          <span className="font-mono text-[10px] uppercase tracking-wider rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
            Fallback · awaiting analyst
          </span>
        )}
      </div>

      <section
        aria-label="Your question, preserved verbatim"
        className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 px-6 py-5 shadow-card"
      >
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Your question
        </p>
        <blockquote className="mt-2 font-serif italic text-lg leading-relaxed text-foreground">
          “{rawQuestion}”
        </blockquote>
        {routerMeta && (
          <p className="mt-3 text-xs text-muted-foreground italic">
            Routed as: <span className="not-italic font-medium text-foreground/80">general / ask anything</span>
            {" · "}
            <span className="not-italic">confidence: {confidenceBand(routerMeta.confidence_score)}</span>
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-primary/30 bg-primary/5 px-6 py-5">
        <div className="flex items-center gap-2 text-sm font-semibold mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Summary</span>
        </div>
        <p className="text-base leading-relaxed text-foreground/90">{payload.summary}</p>
      </section>

      {payload.key_points.length > 0 && (
        <section className="rounded-2xl border border-border bg-card px-6 py-5">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span>Key points</span>
          </div>
          <ul className="space-y-2">
            {payload.key_points.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <span className="text-primary mt-1">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {payload.risks.length > 0 && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-6 py-5">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            <span>Risks to consider</span>
          </div>
          <ul className="space-y-2">
            {payload.risks.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <span className="text-amber-600 mt-1">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {payload.what_to_watch.length > 0 && (
        <section className="rounded-2xl border border-border bg-card px-6 py-5">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Eye className="h-4 w-4 text-primary" />
            <span>What to watch</span>
          </div>
          <ul className="space-y-2">
            {payload.what_to_watch.map((w, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <span className="text-primary mt-1">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AnalystCtaCard queryId={queryId} context="general" />

      <section className="rounded-xl border border-muted bg-muted/30 px-4 py-3 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="leading-relaxed">{payload.disclaimer}</p>
      </section>

      <SEBIDisclaimerInline />
    </main>
  );
}
