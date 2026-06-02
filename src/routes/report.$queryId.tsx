import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Navbar } from "@/components/layout/Navbar";
import { Logo } from "@/components/common/Logo";
import { Progress } from "@/components/ui/progress";
import { AIReportCardV2, type AIReportV2, type ReportMetaV2 } from "@/components/report/AIReportCardV2";
import { ExpertAnswerSection } from "@/components/report/ExpertAnswerSection";
import { HybridRegenerateBanner } from "@/components/report/HybridRegenerateBanner";
import { ReflectiveBanner } from "@/components/report/ReflectiveBanner";
import { FreshEntryAddendum } from "@/components/report/FreshEntryAddendum";
import { StockAnalysisReport } from "@/components/analysis/StockAnalysisReport";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Download } from "lucide-react";
import { toast } from "sonner";
import type { StockAnalysisPayload, QueryType } from "@/types/stock-analysis";
import { buildInterpretation } from "@/lib/query-intake-parser";
import { freezeOrReadReport } from "@/lib/freeze-report.functions";
import { generateAnalysisPdf } from "@/lib/pdf.functions";
import { composePositionContext } from "@/lib/position-context";
import { isMfOrPortfolioQuestion } from "@/lib/position-copy";
import { ProfitReviewAddendum } from "@/components/report/ProfitReviewAddendum";
import { LossReviewAddendum } from "@/components/report/LossReviewAddendum";
import { AveragingDisciplineAddendum } from "@/components/report/AveragingDisciplineAddendum";
import { AnalystCtaCard } from "@/components/report/AnalystCtaCard";
import { MfPortfolioRejectionPanel } from "@/components/report/MfPortfolioRejectionPanel";
import { RoutedPendingPanel } from "@/components/report/RoutedPendingPanel";
import { SectorViewReport } from "@/components/report/SectorViewReport";
import { EducationalReport } from "@/components/report/EducationalReport";
import { DownloadPdfButton as SharedDownloadPdfButton } from "@/components/report/DownloadPdfButton";

const LOADING_STEPS = [
  "Connecting to live market data…",
  "Classifying your question…",
  "Fetching fundamentals & headlines…",
  "Running compliance guardrails…",
];

function LoadingScreen() {
  const [progress, setProgress] = useState(8);
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => Math.min(p + 3, 92));
      setStepIdx((i) => (i + 1) % LOADING_STEPS.length);
    }, 900);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="min-h-screen bg-mesh flex flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="animate-pulse"><Logo size="lg" linkTo={null} /></div>
      <div className="w-full max-w-sm">
        <Progress value={progress} className="h-2" />
        <p className="mt-3 text-sm text-muted-foreground font-mono">{LOADING_STEPS[stepIdx]}</p>
      </div>
      <p className="text-xs text-muted-foreground italic max-w-md">Compliance-first AI · No hallucinated targets · SEBI analyst video arriving within 24h</p>
    </div>
  );
}

// ──────────────── Tier-shaped (v1) renderer ────────────────

function TierShapedReportContent({
  queryId, symbol, horizon, rawQuestion,
  queryType, entryPrice, qty, customQuestion,
}: {
  queryId: string;
  symbol: string;
  horizon: QueryType;
  rawQuestion: string;
  queryType: string;
  entryPrice: number | null;
  qty: number | null;
  customQuestion: string | null;
}) {
  const freezeOrRead = useServerFn(freezeOrReadReport);
  const { data, isLoading, error, refetch } = useQuery<StockAnalysisPayload>({
    queryKey: ["stock-analysis", "v1", "frozen", queryId],
    queryFn: () => freezeOrRead({ data: { queryId } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (isLoading) return <LoadingScreen />;
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <p className="font-display text-2xl">Couldn't load this report</p>
          <p className="text-muted-foreground mt-2 text-sm">{(error as Error)?.message ?? "Unknown error"}</p>
          <Button className="mt-4" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  const interpretation = buildInterpretation({ rawQuestion, symbol, horizonTier: horizon });
  const validationReasons: Partial<Record<keyof typeof data.levels, string>> = {};
  for (const o of data.audit_meta.trade_plan_validation ?? []) {
    if (!validationReasons[o.level]) validationReasons[o.level] = o.reason;
  }

  const auditExtras = data.audit_meta as typeof data.audit_meta & {
    frozen_at?: string;
    served_from_cache?: boolean;
    report_artifact_status?: "frozen" | "regenerated";
  };
  const frozenAt = auditExtras.frozen_at ?? null;
  const frozenAge = frozenAt ? Date.now() - new Date(frozenAt).getTime() : 0;
  const isStale = frozenAt ? frozenAge > 24 * 60 * 60 * 1000 : false;

  // ── Phase 2 — pick the right addendum and suppress Fresh entry tab ──
  const isPhase2 = (queryType === "existing_position" || queryType === "averaging") && entryPrice != null;
  const phase2Ctx = isPhase2 && entryPrice != null
    ? composePositionContext({
        payload: data,
        entry_price: entryPrice,
        qty,
        query_type: queryType === "averaging" ? "averaging" : "existing_position",
      })
    : null;

  // Phase 2.1b — Action Zone default tab derived from intent, not tier.
  const defaultActionTab: "holding" | "fresh" | "exploring" | undefined =
    queryType === "fresh_entry" || queryType === "buy_decision"
      ? "fresh"
      : queryType === "existing_position" ||
        queryType === "stuck_position" ||
        queryType === "averaging" ||
        queryType === "should_average"
      ? "holding"
      : undefined;

  const mfRejected = isMfOrPortfolioQuestion(customQuestion);

  const phase2Addendum = phase2Ctx ? (
    <div className="space-y-6">
      <AnalystCtaCard queryId={queryId} />
      {phase2Ctx.position_state === "profit_review" && <ProfitReviewAddendum ctx={phase2Ctx} payload={data} tier={horizon} />}
      {(phase2Ctx.position_state === "loss_review" || phase2Ctx.position_state === "neutral_review") && (
        <LossReviewAddendum ctx={phase2Ctx} payload={data} tier={horizon} />
      )}
      {phase2Ctx.position_state === "averaging" && <AveragingDisciplineAddendum ctx={phase2Ctx} payload={data} tier={horizon} />}
    </div>
  ) : (
    <FreshEntryAddendum levels={data.levels} tier={horizon} validationReasons={validationReasons} />
  );

  const topBannerNode = (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 md:px-6 space-y-4">
      <ReflectiveBanner
        interpretation={interpretation}
        extras={{ entry_price: entryPrice, qty, custom_question: customQuestion }}
      />
      {mfRejected && <MfPortfolioRejectionPanel />}
    </div>
  );

  return (
    <div className={`min-h-screen bg-mesh ${isStale ? "frozen-stale" : ""}`}>
      <Navbar />
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 pt-6 md:px-6">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Tier-shaped report · {horizon.replace("-", " ")}
          {phase2Ctx ? <> · {phase2Ctx.position_state.replace("_", " ")}</> : null}
        </span>
        {frozenAt && <FrozenBadge frozenAt={frozenAt} isStale={isStale} />}
        <div className="ml-auto">
          <DownloadPdfButton symbol={symbol} horizon={horizon} />
        </div>
      </div>
      <StockAnalysisReport
        data={data}
        topBanner={topBannerNode}
        addendum={phase2Addendum}
        suppressFreshTab={isPhase2}
        defaultActionTab={defaultActionTab}
      />
      <main id="analyst-answer" className="px-4 sm:px-6 lg:px-8 pb-12">
        <ExpertAnswerSection queryId={queryId} assignedAnalystId={null} queryCreatedAt={frozenAt ?? new Date().toISOString()} />
      </main>
      {/* Phase 1.1 — when frozen >24h, mute live-price chips and explain why. */}
      {isStale && (
        <style>{`
          .frozen-stale [data-live-chip="true"] {
            opacity: 0.55;
            filter: grayscale(0.7);
          }
        `}</style>
      )}
    </div>
  );
}

function FrozenBadge({ frozenAt, isStale }: { frozenAt: string; isStale: boolean }) {
  const formatted = new Date(frozenAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const badge = (
    <span
      className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${
        isStale ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      Generated on {formatted} IST{isStale ? " · stale" : ""}
    </span>
  );
  if (!isStale) return badge;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><span>{badge}</span></TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs">
          This report is a frozen artifact. For live levels, generate a fresh report.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Stock-report download button wrapper — delegates to the shared
// DownloadPdfButton. Kept as a thin wrapper so the existing call site
// (`<DownloadPdfButton symbol={symbol} horizon={horizon} />`) keeps working
// without leaking the `kind` prop into the call site.
function DownloadPdfButton({ symbol, horizon }: { symbol: string; horizon: QueryType }) {
  return <SharedDownloadPdfButton kind="stock" symbol={symbol} horizon={horizon} includeNews />;
}

// ──────────────── Legacy renderer ────────────────

function LegacyReportContent({
  data,
}: { data: Record<string, unknown> & { id: string; ai_report: Record<string, unknown> | null } }) {
  const meta: ReportMetaV2 = {
    id: data.id,
    createdAt: data.created_at as string,
    stockName: data.stock_name as string,
    stockSymbol: (data.stock_symbol as string | null) ?? null,
    buyPrice: data.buy_price as number | null,
    currentPrice: data.current_price as number | null,
    analystName: (data as { analyst?: { display_name: string } | null }).analyst?.display_name ?? null,
    analystSebi: (data as { analyst?: { sebi_reg_number: string } | null }).analyst?.sebi_reg_number ?? null,
    analystAvatar: (data as { analyst?: { avatar_url: string | null } | null }).analyst?.avatar_url ?? null,
  };

  const rawReport = (data.ai_report ?? {}) as Record<string, unknown>;
  const LEGACY_KEYS = [
    "verdict", "verdictColor", "tagline", "target1", "target2", "stopLoss", "stop_loss",
    "supportZone", "resistanceZone", "support_zone", "resistance_zone",
    "averagingZone", "freshEntryZone", "freshEntryTrigger", "ifHoldingAction",
    "ifAveragingRecommended", "closingInsight", "expertQuote", "pnlContext",
    "confidence", "riskScore", "rewardPotential", "momentum", "trend",
    "fundamentalPoints", "technicalPoints", "whatCanGoWrong", "behavioralReminder",
    "fundamentals", "technical", "risk", "timeHorizon",
  ];
  const isLegacy = LEGACY_KEYS.some((k) => k in rawReport);
  const safeReport: Record<string, unknown> = { ...rawReport };
  for (const k of LEGACY_KEYS) delete safeReport[k];

  return (
    <div className="min-h-screen bg-mesh">
      <Navbar />
      <main className="px-4 sm:px-6 lg:px-8 py-8 print:py-0">
        <HybridRegenerateBanner legacyQueryId={data.id} />
        {isLegacy && (
          <div className="mx-auto max-w-4xl mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <strong>Legacy report:</strong> this query was generated by an older AI pipeline that included
            target / stop-loss / verdict fields. Those fields have been retired for SEBI compliance and are
            hidden. Use Regenerate Free above to get the new tier-shaped report.
          </div>
        )}
        <AIReportCardV2 report={safeReport as unknown as AIReportV2} meta={meta} />
        <ExpertAnswerSection
          queryId={data.id}
          assignedAnalystId={(data as { assigned_analyst_id?: string | null }).assigned_analyst_id ?? null}
          queryCreatedAt={data.created_at as string}
        />
      </main>
    </div>
  );
}

// ──────────────── Route dispatcher ────────────────

function ReportContent() {
  const { queryId } = useParams({ from: "/report/$queryId" });
  const { data, isLoading, error } = useQuery({
    queryKey: ["query-report", queryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("queries")
        .select("id, stock_name, stock_symbol, buy_price, current_price, ai_report, created_at, status, assigned_analyst_id, engine_version, engine_source, horizon, custom_question, query_text, query_type, entry_price, qty, router_meta")
        .eq("id", queryId)
        .single();
      if (error) throw error;
      let analyst: { display_name: string; sebi_reg_number: string; avatar_url: string | null } | null = null;
      if (data.assigned_analyst_id) {
        const { data: a } = await supabase
          .from("analyst_profiles")
          .select("display_name, sebi_reg_number, avatar_url")
          .eq("id", data.assigned_analyst_id)
          .maybeSingle();
        analyst = a;
      }
      return { ...data, analyst };
    },
    // For v1 records, the row is created instantly with status="ai_answered" — no need to poll.
    // For "other" / routed rows, no AI report will ever land — don't poll.
    // For legacy records, the legacy generator may still be working; keep polling until ai_report lands.
    refetchInterval: (q) => {
      const d = q.state.data as { engine_version?: string | null; ai_report?: unknown; query_type?: string | null } | undefined;
      if (!d) return 1500;
      if (d.engine_version === "v1_tier_shaped") return false;
      if (d.query_type === "other" || d.query_type === "sector_view" || d.query_type === "educational") return false;
      return d.ai_report ? false : 1500;
    },
  });

  if (isLoading || !data) return <LoadingScreen />;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <p className="font-display text-2xl">Couldn't load this report</p>
          <p className="text-muted-foreground mt-2 text-sm">{(error as Error).message}</p>
          <Button asChild className="mt-4"><Link to="/post-query">Post a new query</Link></Button>
        </div>
      </div>
    );
  }

  // Phase 3A/3B/3C — routed question types. Sector View and Educational have
  // their own report variants; "other" stays on the routed-pending panel.
  const qt = (data.query_type ?? "") as string;
  if (qt === "sector_view" || qt === "other" || qt === "educational") {
    const rawQuestion = (data.query_text ?? data.custom_question ?? "").toString();
    const routerMeta = (data as { router_meta?: unknown }).router_meta as
      | import("@/lib/intent-router-schema").RouterOutput
      | null;
    if (qt === "sector_view") {
      return <SectorViewReport queryId={data.id as string} rawQuestion={rawQuestion} routerMeta={routerMeta ?? null} />;
    }
    if (qt === "educational") {
      return <EducationalReport queryId={data.id as string} rawQuestion={rawQuestion} routerMeta={routerMeta ?? null} />;
    }
    return <RoutedPendingPanel rawQuestion={rawQuestion} routerMeta={routerMeta ?? null} />;
  }

  // v1 tier-shaped: branch into the analysis renderer.
  if (data.engine_version === "v1_tier_shaped") {
    const symbol = (data.stock_symbol ?? data.stock_name ?? "").toString().toUpperCase();
    const horizonRaw = (data.horizon ?? "medium-term") as string;
    const horizon: QueryType = (["intraday", "medium-term", "long-term"] as const).includes(horizonRaw as QueryType)
      ? (horizonRaw as QueryType)
      : "medium-term";
    const rawQuestion = (data.custom_question ?? data.query_text ?? "").toString();
    if (!symbol) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <p className="font-display text-2xl">Missing stock symbol</p>
            <p className="text-muted-foreground mt-2 text-sm">This v1 report has no symbol attached. Please re-post the query.</p>
            <Button asChild className="mt-4"><Link to="/post-query">Post a new query</Link></Button>
          </div>
        </div>
      );
    }
    return (
      <TierShapedReportContent
        queryId={data.id as string}
        symbol={symbol}
        horizon={horizon}
        rawQuestion={rawQuestion}
        queryType={(data.query_type ?? "fresh_entry") as string}
        entryPrice={(data.entry_price as number | null) ?? null}
        qty={(data.qty as number | null) ?? null}
        customQuestion={(data.custom_question as string | null) ?? null}
      />
    );
  }

  // Legacy path: poll for ai_report and then render.
  if (!data.ai_report) return <LoadingScreen />;
  return <LegacyReportContent data={data as Parameters<typeof LegacyReportContent>[0]["data"]} />;
}

export const Route = createFileRoute("/report/$queryId")({
  head: () => ({ meta: [{ title: "AI Report — Stockera" }] }),
  component: () => <RequireAuth><ReportContent /></RequireAuth>,
});
