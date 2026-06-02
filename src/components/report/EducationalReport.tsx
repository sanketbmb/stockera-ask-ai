// Phase 3C — Educational Report variant rendered inside /report/$queryId
// when query_type === "educational". Glossary-first, deterministic.
// No score ring, no trade levels, no addenda.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Logo } from "@/components/common/Logo";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen } from "lucide-react";
import { freezeOrReadEducationalReport } from "@/lib/educational-report.functions";
import type { EducationalReportPayload } from "@/lib/educational-context";
import { EducationalHero } from "@/components/report/EducationalHero";
import { ConceptBrief } from "@/components/report/ConceptBrief";
import { ConceptNotFoundPanel } from "@/components/report/ConceptNotFoundPanel";
import { SEBIDisclaimerInline } from "@/components/common/SEBIDisclaimer";
import type { RouterOutput } from "@/lib/intent-router-schema";
import { confidenceBand } from "@/lib/intent-router-schema";
import { FIRM } from "@/lib/firm-details";
import { DownloadPdfButton } from "@/components/report/DownloadPdfButton";
import { MotionConfig } from "framer-motion";

const LOADING_STEPS = [
  "Looking up the concept…",
  "Loading from the learning library…",
  "Composing the brief…",
  "Finalising…",
];

function LoadingScreen() {
  const [progress, setProgress] = useState(8);
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => Math.min(p + 6, 92));
      setStepIdx((i) => (i + 1) % LOADING_STEPS.length);
    }, 600);
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

function ReflectiveEducationalBanner({
  rawQuestion,
  conceptName,
  routerMeta,
}: {
  rawQuestion: string;
  conceptName: string;
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
        Interpreted as: <span className="font-medium not-italic text-foreground/80">Educational</span>
        {" · "}
        <span className="not-italic">{conceptName}</span>
      </p>
      {routerMeta && confidenceBand(routerMeta.confidence_score) !== "low" && (
        <p className="mt-1 text-[11px] text-muted-foreground italic">
          Auto-routed via free-text router · confidence: {confidenceBand(routerMeta.confidence_score)}
        </p>
      )}
    </section>
  );
}

function AuditFooter({ payload, rawQuestion }: { payload: EducationalReportPayload; rawQuestion: string }) {
  const a = payload.audit_footer;
  const ist = new Date(a.generated_at).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  // Reference the rawQuestion silently to avoid an unused-arg lint
  // while leaving the door open for future audit display of the prompt.
  void rawQuestion;
  return (
    <section className="mt-8 rounded-xl border border-border bg-muted/30 px-5 py-4 text-[10.5px] leading-relaxed text-muted-foreground">
      <p className="font-mono text-[10px] uppercase tracking-wider text-foreground">Audit Footer</p>
      <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 font-mono text-[10px]">
        <span>engine: {a.engine_version}</span>
        <span>source: {a.engine_source}</span>
        <span>concept: {a.concept_canonical}</span>
        <span>difficulty: {a.difficulty}</span>
        <span>library: {a.library_version}</span>
        <span>generated: {ist} IST</span>
      </div>
      <p className="mt-3">
        Educational content from the Stockera learning library — not a live market recommendation.
      </p>
      <p className="mt-1">
        Prepared by <strong className="text-foreground">{FIRM.legalName}</strong> ({FIRM.brand}),
        SEBI {FIRM.sebiType} Reg. <strong>{FIRM.sebiRegNumber}</strong>.
      </p>
    </section>
  );
}

export function EducationalReport({
  queryId,
  rawQuestion,
  routerMeta,
}: {
  queryId: string;
  rawQuestion: string;
  routerMeta: RouterOutput | null;
}) {
  const freeze = useServerFn(freezeOrReadEducationalReport);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["educational-report", queryId],
    queryFn: () => freeze({ data: { queryId } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <LoadingScreen />;
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <p className="font-display text-2xl">Couldn&rsquo;t load this concept brief</p>
          <p className="text-muted-foreground mt-2 text-sm">{(error as Error)?.message ?? "Unknown error"}</p>
          <Button className="mt-4" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (data.ok === false) {
    return <ConceptNotFoundPanel rawQuestion={rawQuestion} suggestions={data.suggestions} />;
  }

  return (
    <div className="min-h-screen bg-mesh">
      <Navbar />
      <EducationalReportBody
        payload={data.payload}
        rawQuestion={rawQuestion}
        routerMeta={routerMeta}
        printMode={false}
        queryId={queryId}
      />
    </div>
  );
}

// Presentational body — also rendered by /print-educational/$queryId.
export function EducationalReportBody({
  payload,
  rawQuestion,
  routerMeta,
  printMode,
  queryId,
}: {
  payload: EducationalReportPayload;
  rawQuestion: string;
  routerMeta: RouterOutput | null;
  printMode: boolean;
  queryId?: string;
}) {
  const body = (
    <main className="mx-auto max-w-4xl px-4 md:px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
          <BookOpen className="h-3 w-3" />
          Stockera Learning Library · concept brief
        </span>
        {!printMode && queryId && (
          <div className="ml-auto"><DownloadPdfButton kind="educational" queryId={queryId} /></div>
        )}
      </div>

      <ReflectiveEducationalBanner
        rawQuestion={rawQuestion}
        conceptName={payload.concept_short_name}
        routerMeta={routerMeta}
      />

      <EducationalHero payload={payload} />
      <ConceptBrief payload={payload} />

      {!printMode && (
        <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-display text-base text-foreground">
                See this concept in a real stock report
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Run a stock query and watch {payload.concept_short_name} appear inside the relevant cards.
              </p>
            </div>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/post-query">Try a stock query <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </div>
        </section>
      )}

      <SEBIDisclaimerInline />
      <AuditFooter payload={payload} rawQuestion={rawQuestion} />
      {printMode && <div id="print-ready" />}
    </main>
  );
}
