import { createFileRoute, Link, Navigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { useAuth } from "@/contexts/AuthContext";
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
import type { StockAnalysisPayload, QueryType } from "@/types/stock-analysis";
import { isUnsupportedSymbolPayload } from "@/types/stock-analysis";
import { buildInterpretation } from "@/lib/query-intake-parser";
import { freezeOrReadReport } from "@/lib/freeze-report.functions";
import { UnsupportedSymbolPanel } from "@/components/report/UnsupportedSymbolPanel";
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
import { GeneralReport } from "@/components/report/GeneralReport";
import { DownloadPdfButton as SharedDownloadPdfButton } from "@/components/report/DownloadPdfButton";
import { YouAlsoAskedSection } from "@/components/report/YouAlsoAskedSection";
import type { SecondaryAnswer } from "@/lib/secondary-composer";
import { AskClaudeFollowup } from "@/components/report/AskClaudeFollowup";
import { ReportCtaStrip } from "@/components/report/ReportCtaStrip";
import { getPublicReportMeta, SITE_ORIGIN, SITE_DEFAULT_OG, truncate } from "@/lib/seo-head";
import { getPublicReportRow } from "@/lib/public-report-row.functions";


// FIX-REPORT-404 — strict UUID v1-v5 check; refuse malformed param up front.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Detect Supabase "no rows" errors (PGRST116) plus the equivalent
// freeze-server-fn message, so both data paths can degrade gracefully.
function isReportNotFoundError(err: unknown): boolean {
  if (!err) return false;
  const code = (err as { code?: string }).code;
  if (code === "PGRST116") return true;
  const msg = (err as { message?: string }).message ?? "";
  return /multiple \(or no\) rows|Results contain 0 rows|Query not found/i.test(msg);
}

function NotFoundCard() {
  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <Logo size="md" linkTo="/" />
        <h1 className="font-display text-3xl mt-6">Report not found</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          We couldn't find a report at this link. It may have been removed, or the URL might be incorrect.
        </p>
        <Button asChild className="mt-6 bg-primary text-primary-foreground">
          <Link to="/post-query">Post a new query</Link>
        </Button>
      </div>
    </div>
  );
}

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

// ──────────────── View-mode top block (text | video) ────────────────
// Renders a compact contextual block above the AI report when the URL has
// ?view=text or ?view=video. Reuses existing AnalystCtaCard as the premium
// human-analysis / paywall surface for video mode. Text mode shows a small
// "human RA text answer being prepared" status card; the full existing
// ExpertAnswerSection at the bottom of the report renders the real answer
// (or the pending state) once it lands, so there is no duplicate rendering.
function ViewModeTopBlock({
  mode,
  queryId,
  ctaContext,
}: {
  mode: "text" | "video";
  queryId: string;
  ctaContext: "position" | "fresh" | "general";
}) {
  // M2 — fade-in after M1 completes (delay ~220ms). Short opacity ramp;
  // safe to run without reduced-motion gating per journal spec.
  const m2 = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.28, delay: 0.22, ease: "easeOut" as const },
  };
  if (mode === "video") {
    return (
      <motion.div {...m2} className="mx-auto w-full max-w-5xl px-4 md:px-6 pt-6 space-y-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Premium Human Video Analysis
          </span>
          <div className="h-px flex-1 bg-primary/20" />
        </div>
        <AnalystCtaCard queryId={queryId} context={ctaContext} />
        <p className="text-[11px] text-muted-foreground italic">
          Full AI-grounded report below — the human analyst video builds on it.
        </p>
      </motion.div>
    );
  }
  // text mode
  return (
    <motion.div {...m2} className="mx-auto w-full max-w-5xl px-4 md:px-6 pt-6">
      <div className="rounded-2xl border border-accent/25 bg-accent/5 px-5 py-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            ✓ Free AI report ready
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
            Human RA text answer within 60 min
          </span>
        </div>
        <p className="text-sm text-foreground font-medium mt-1">
          Your SEBI-registered analyst text answer is lined up.
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Read the full AI report below now — the human analyst text response will appear in the
          Expert Analysis section at the bottom of this page as soon as it's published.
        </p>
      </div>
    </motion.div>
  );
}




function TierShapedReportContent({
  queryId, symbol, horizon, rawQuestion,
  queryType, entryPrice, qty, customQuestion, viewMode,
  publicPayload,
}: {
  queryId: string;
  symbol: string;
  horizon: QueryType;
  rawQuestion: string;
  queryType: string;
  entryPrice: number | null;
  qty: number | null;
  customQuestion: string | null;
  viewMode?: "text" | "video";
  publicPayload?: StockAnalysisPayload | null;
}) {
  const freezeOrRead = useServerFn(freezeOrReadReport);
  const { data, isLoading, error, refetch } = useQuery<StockAnalysisPayload>({
    queryKey: ["stock-analysis", "v1", "frozen", queryId, publicPayload ? "public" : "authed"],
    queryFn: () =>
      publicPayload ? Promise.resolve(publicPayload) : freezeOrRead({ data: { queryId } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const reduceMotion = useReducedMotion();
  // HASH-SCROLL EXCEPTION — when the URL carries #<section>, skip the M3/M5
  // reveal for that section so the deep-link lands without a flicker.
  const skipRevealId = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const h = window.location.hash?.slice(1);
    return h || undefined;
  }, [queryId]);

  if (isLoading) return <LoadingScreen />;
  if (error && isReportNotFoundError(error)) return <NotFoundCard />;
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

  // Wave 5f — UNSUPPORTED_SYMBOL friendly empty-state.
  if (isUnsupportedSymbolPayload(data)) {
    return (
      <div className="min-h-screen bg-mesh">
        <Navbar />
        <UnsupportedSymbolPanel payload={data} horizon={horizon} />
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

  const ctaContext: "position" | "fresh" | "general" =
    queryType === "fresh_entry" || queryType === "buy_decision"
      ? "fresh"
      : queryType === "existing_position" ||
        queryType === "stuck_position" ||
        queryType === "averaging" ||
        queryType === "should_average"
      ? "position"
      : "general";

  // HOTFIX Bug A — AnalystCtaCard must mount on every stock-report path
  // (Phase 2 position addendum, Fresh Entry addendum, and the no-addendum
  // fallback). Previously it only rendered inside the phase2Addendum branch,
  // which hid the CTA on fresh-entry / buy-decision reports.
  const phase2Addendum = (
    <div className="space-y-6">
      <AnalystCtaCard queryId={queryId} context={ctaContext} />
      {phase2Ctx ? (
        <>
          {phase2Ctx.position_state === "profit_review" && <ProfitReviewAddendum ctx={phase2Ctx} payload={data} tier={horizon} />}
          {(phase2Ctx.position_state === "loss_review" || phase2Ctx.position_state === "neutral_review") && (
            <LossReviewAddendum ctx={phase2Ctx} payload={data} tier={horizon} />
          )}
          {phase2Ctx.position_state === "averaging" && <AveragingDisciplineAddendum ctx={phase2Ctx} payload={data} tier={horizon} />}
        </>
      ) : (
        <FreshEntryAddendum levels={data.levels} tier={horizon} validationReasons={validationReasons} />
      )}
    </div>
  );

  // M1 — Verdict banner slide-down 8px + fade on mount only. Reduced-motion
  // gated: snaps to visible without animation when the user prefers less
  // motion. Never re-fires on view-mode change (mount-only via no key deps).
  const m1 = reduceMotion
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: -8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.28, ease: "easeOut" as const },
      };
  const topBannerNode = (
    <motion.div {...m1} className="mx-auto w-full max-w-5xl px-4 pt-6 md:px-6 space-y-4">
      <ReflectiveBanner
        interpretation={interpretation}
        extras={{ entry_price: entryPrice, qty, custom_question: customQuestion }}
      />
      {mfRejected && <MfPortfolioRejectionPanel />}
    </motion.div>
  );


  return (
    <div className={`min-h-screen bg-mesh ${isStale ? "frozen-stale" : ""}`}>
      <Navbar />
      {viewMode && <ViewModeTopBlock mode={viewMode} queryId={queryId} ctaContext={ctaContext} />}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 pt-6 md:px-6">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Tier-shaped report · {horizon.replace("-", " ")}
          {phase2Ctx ? <> · {phase2Ctx.position_state.replace("_", " ")}</> : null}
        </span>
        {frozenAt && <FrozenBadge frozenAt={frozenAt} isStale={isStale} />}
        <div className="ml-auto">
          <DownloadPdfButton queryId={queryId} symbol={symbol} horizon={horizon} />
        </div>
      </div>
      <StockAnalysisReport
        data={data}
        topBanner={topBannerNode}
        addendum={phase2Addendum}
        suppressFreshTab={isPhase2}
        defaultActionTab={defaultActionTab}
        skipRevealId={skipRevealId}
      />

      <div className="mx-auto w-full max-w-5xl px-4 md:px-6 pt-2 pb-2">
        <ReportCtaStrip
          queryId={queryId}
          stockName={data.stock.company_name}
          stockSymbol={data.stock.symbol}
          buyPrice={entryPrice}
          currentPrice={data.price_context.current_price ?? null}
        />
      </div>
      <YouAlsoAskedSection
        answers={(data as unknown as { secondary_answers?: SecondaryAnswer[] }).secondary_answers ?? null}
      />
      {data.success && (data.audit_meta as { report_artifact_status?: string }).report_artifact_status === "frozen" && (
        <div id="followup-input" className="mx-auto w-full max-w-5xl px-4 md:px-6 pb-2">
          <AskClaudeFollowup queryId={queryId} aiReport={data} />
        </div>
      )}
      <main id="analyst-answer" className="px-4 sm:px-6 lg:px-8 pb-12">
        <ExpertAnswerSection queryId={queryId} assignedAnalystId={null} queryCreatedAt={frozenAt ?? new Date().toISOString()} />
      </main>

      {/* Auto-public default — disclosure only; per-report toggle lives in My Queries. */}
      <section className="px-4 sm:px-6 lg:px-8 pb-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs text-muted-foreground">
            Your report is added to the public Library. You can make it private anytime from My Queries.
          </p>
        </div>
      </section>

      {/* Bottom premium-human-analysis surface — calmer repeat after the full
          AI report stack so users always see a monetization surface at
          end-of-report. Stock-report path only. */}
      <section className="px-4 sm:px-6 lg:px-8 pb-16">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-border/60" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Still deciding? Get a human second opinion
            </span>
            <div className="h-px flex-1 bg-border/60" />
          </div>
          <AnalystCtaCard queryId={queryId} context={ctaContext} />
        </div>
      </section>

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

// Stock-report download button wrapper — uses the unified flow (queryId)
// so PDF generation prints the frozen queries.ai_report artifact without
// calling the live orchestrator.
function DownloadPdfButton({ queryId }: { queryId: string; symbol: string; horizon: QueryType }) {
  return <SharedDownloadPdfButton kind="stock_unified" queryId={queryId} />;
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

  // HOTFIX Bug A — mount AnalystCtaCard on legacy stock reports too, but
  // skip rows that already use the modern phase-2 artifact (defensive guard
  // against future double-mount if legacy rows get re-tagged).
  const legacyAuditMeta = (rawReport.audit_meta ?? {}) as Record<string, unknown>;
  const legacyArtifactStatus = (legacyAuditMeta.report_artifact_status as string | undefined) ?? null;
  const shouldMountLegacyCta = legacyArtifactStatus !== "phase2_artifact_v0";

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
        {shouldMountLegacyCta && (
          <div className="mx-auto max-w-4xl mb-4">
            <AnalystCtaCard queryId={data.id} context="general" />
          </div>
        )}
        <AIReportCardV2 report={safeReport as unknown as AIReportV2} meta={meta} />

        <ExpertAnswerSection
          queryId={data.id}
          assignedAnalystId={(data as { assigned_analyst_id?: string | null }).assigned_analyst_id ?? null}
          queryCreatedAt={data.created_at as string}
        />

        {/* Auto-public default — disclosure only; per-report toggle lives in My Queries. */}
        <div className="mx-auto max-w-4xl mt-6">
          <p className="text-xs text-muted-foreground">
            Your report is added to the public Library. You can make it private anytime from My Queries.
          </p>
        </div>

        {/* Bottom premium-human-analysis surface — calmer end-of-report repeat. */}
        {shouldMountLegacyCta && (
          <div className="mx-auto max-w-4xl mt-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-border/60" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Still deciding? Get a human second opinion
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <AnalystCtaCard queryId={data.id} context="general" />
          </div>
        )}
      </main>
    </div>
  );
}

// ──────────────── Route dispatcher ────────────────

function AnonReportCta() {
  return (
    <section className="px-4 sm:px-6 lg:px-8 pb-16">
      <div className="mx-auto max-w-5xl rounded-2xl border border-border/60 bg-card/40 backdrop-blur p-6 text-center">
        <h3 className="font-display text-xl">Want your own stock question answered?</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Sign in to post your own query and get an AI-backed, SEBI-safe report.
        </p>
        <Button asChild className="mt-4 bg-primary text-primary-foreground">
          <Link to="/login">Sign in to post your query</Link>
        </Button>
      </div>
    </section>
  );
}

function ReportContent() {
  const { queryId } = useParams({ from: "/report/$queryId" });
  const { view: viewMode } = useSearch({ from: "/report/$queryId" });
  const { user, isLoading: authLoading } = useAuth();

  // FIX-REPORT-404 — refuse malformed UUIDs before touching the network.
  const isValidUuid = useMemo(() => UUID_RE.test(queryId), [queryId]);

  // Bug 3 fix — reports were auto-scrolling to the bottom on first mount.
  // Force scroll-to-top per queryId, unless a hash anchor is present (Step 3
  // deep-links rely on it) — that case is handled by the hash-scroll effect.
  useEffect(() => {
    if (!isValidUuid) return;
    if (typeof window !== "undefined" && window.location.hash) return;
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [queryId, isValidUuid]);

  // Step 3 deep-link — smooth-scroll to hash anchor once the report renders.
  // Section IDs live on real motion.section blocks inside StockAnalysisReport
  // (quick-verdict, risk-reward, action-strategy, trade-levels,
  // what-can-go-wrong, expert-insight) plus ExpertAnswerSection (#expert-analysis).
  useEffect(() => {
    if (!isValidUuid) return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash?.slice(1);
    if (!hash) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        return;
      }
      if (attempts++ < 30) setTimeout(tryScroll, 200);
    };
    const t = setTimeout(tryScroll, 300);
    return () => clearTimeout(t);
  }, [queryId, viewMode, isValidUuid]);


  // K-POLISH-1 — deep-link from My Queries empty follow-up state.
  // When URL has ?focus=followup, scroll the Ask-about-this-report section
  // into view and focus its textarea. Fires once per navigation after content
  // has had a chance to render.
  useEffect(() => {
    if (!isValidUuid) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("focus") !== "followup") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.getElementById("followup-input");
      if (el) {
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
        const ta = el.querySelector("textarea") as HTMLTextAreaElement | null;
        ta?.focus();
        return;
      }
      if (attempts++ < 20) setTimeout(tryScroll, 150);
    };
    const t = setTimeout(tryScroll, 200);
    return () => clearTimeout(t);
  }, [queryId, isValidUuid]);


  const fetchPublicRow = useServerFn(getPublicReportRow);
  const { data, isLoading, error } = useQuery({
    queryKey: ["query-report", queryId, user ? `u:${user.id}` : "anon"],
    enabled: isValidUuid && !authLoading,
    queryFn: async () => {
      // SEO Stage 1 hotfix — anon users cannot read `queries` via RLS. Fall back
      // to an admin-gated server fn that only returns public-library rows.
      if (!user) {
        const res = await fetchPublicRow({ data: { queryId } });
        if (!res.found) {
          const err = new Error("Results contain 0 rows") as Error & { code?: string };
          err.code = "PGRST116";
          throw err;
        }
        return res.row;
      }
      const { data, error } = await supabase
        .from("queries")
        .select("id, stock_name, stock_symbol, buy_price, current_price, ai_report, created_at, status, assigned_analyst_id, engine_version, engine_source, horizon, custom_question, query_text, query_type, entry_price, qty, router_meta, is_public_library, library_tombstoned_at")
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

  if (!isValidUuid) return <NotFoundCard />;


  // Show not-found surface for PGRST116 (row missing) before any other branch
  // so it can't fall through to "Couldn't load this report" or a stuck loader.
  if (error && isReportNotFoundError(error)) return <NotFoundCard />;

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

  if (isLoading || !data) return <LoadingScreen />;

  // OPEN-LIBRARY-2 — anonymous access gate.
  // Public-library rows are fully readable without sign-in. Private rows
  // still require auth — fall through to RequireAuth which redirects to /login.
  const isPublicLibraryRow =
    data?.is_public_library === true &&
    data?.library_tombstoned_at === null &&
    data?.ai_report != null;

  if (authLoading) return <LoadingScreen />;
  if (!user && !isPublicLibraryRow) {
    return <Navigate to="/login" search={{ redirect: `/report/${queryId}` } as never} />;
  }

  // SEO: set robots meta dynamically based on public-library status.
  // (Loader-less route — head() runs once at route enter; this useEffect keeps
  // the meta tag in sync with row-resolved public/private state.)
  // Anonymous CTA visibility = no user.
  const isAnon = !user;

  // Phase 3A/3B/3C — routed question types. Sector View and Educational have
  // their own report variants; "other" stays on the routed-pending panel.
  const qt = (data.query_type ?? "") as string;
  if (qt === "sector_view" || qt === "other" || qt === "educational") {
    const rawQuestion = (data.query_text ?? data.custom_question ?? "").toString();
    const routerMeta = (data as { router_meta?: unknown }).router_meta as
      | import("@/lib/intent-router-schema").RouterOutput
      | null;
    const inner =
      qt === "sector_view" ? (
        <SectorViewReport queryId={data.id as string} rawQuestion={rawQuestion} routerMeta={routerMeta ?? null} />
      ) : qt === "educational" ? (
        <EducationalReport queryId={data.id as string} rawQuestion={rawQuestion} routerMeta={routerMeta ?? null} />
      ) : qt === "other" ? (
        <GeneralReport queryId={data.id as string} rawQuestion={rawQuestion} routerMeta={routerMeta ?? null} />
      ) : (
        <RoutedPendingPanel rawQuestion={rawQuestion} routerMeta={routerMeta ?? null} />
      );
    return (
      <>
        <RobotsMeta isPublic={isPublicLibraryRow} />
        {inner}
        {isAnon && <AnonReportCta />}
      </>
    );
  }

  // v1 tier-shaped: branch into the analysis renderer.
  if (data.engine_version === "v1_tier_shaped") {
    const symbol = (data.stock_symbol ?? data.stock_name ?? "").toString().toUpperCase();
    const horizonRaw = (data.horizon ?? "medium-term") as string;
    const horizon: QueryType = (["intraday", "short-term", "medium-term", "long-term"] as const).includes(horizonRaw as QueryType)
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
      <>
        <RobotsMeta isPublic={isPublicLibraryRow} />
        <TierShapedReportContent
          queryId={data.id as string}
          symbol={symbol}
          horizon={horizon}
          rawQuestion={rawQuestion}
          queryType={(data.query_type ?? "fresh_entry") as string}
          entryPrice={(data.entry_price as number | null) ?? null}
          qty={(data.qty as number | null) ?? null}
          customQuestion={(data.custom_question as string | null) ?? null}
          viewMode={viewMode}
          publicPayload={isAnon ? ((data.ai_report as unknown as StockAnalysisPayload) ?? null) : null}
        />
        {isAnon && <AnonReportCta />}
      </>
    );
  }

  // Legacy path: poll for ai_report and then render.
  if (!data.ai_report) return <LoadingScreen />;
  return (
    <>
      <RobotsMeta isPublic={isPublicLibraryRow} />
      <LegacyReportContent data={data as Parameters<typeof LegacyReportContent>[0]["data"]} />
      {isAnon && <AnonReportCta />}
    </>
  );
}

// Imperative robots-meta swapper. The route ships a default `noindex,nofollow`
// from head() so crawlers that don't execute JS get the safe default; once the
// row resolves we upgrade to `index,follow,noarchive` for public-library rows.
function RobotsMeta({ isPublic }: { isPublic: boolean }) {
  useEffect(() => {
    const content = isPublic ? "index,follow,noarchive" : "noindex,nofollow";
    let tag = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "robots");
      document.head.appendChild(tag);
    }
    const prev = tag.getAttribute("content");
    tag.setAttribute("content", content);
    return () => {
      // Restore safe default on unmount so the next route doesn't inherit.
      if (prev) tag!.setAttribute("content", prev);
    };
  }, [isPublic]);
  return null;
}

export const Route = createFileRoute("/report/$queryId")({
  validateSearch: (search: Record<string, unknown>) => {
    const v = search.view;
    const f = search.focus;
    return {
      view: v === "text" || v === "video" ? (v as "text" | "video") : undefined,
      focus: f === "followup" ? ("followup" as const) : undefined,
    };
  },
  loader: async ({ params }) => {
    if (!UUID_RE.test(params.queryId)) return { status: "not_found" as const };
    try {
      return await getPublicReportMeta({ data: { queryId: params.queryId } });
    } catch {
      return { status: "not_found" as const };
    }
  },
  head: ({ params, loaderData }) => {
    const canonical = `${SITE_ORIGIN}/report/${params.queryId}`;
    const meta = loaderData;
    if (!meta || meta.status !== "ok" || !meta.is_public) {
      return {
        meta: [
          { title: "AI Analyst Report — Stockera" },
          {
            name: "description",
            content:
              "SEBI-registered AI + expert analyst verdict on Indian equities. Live from Stockera.",
          },
          { name: "robots", content: "noindex,follow" },
          { property: "og:url", content: canonical },
        ],
        links: [{ rel: "canonical", href: canonical }],
      };
    }
    const stockLabel =
      meta.stock_name && meta.stock_symbol
        ? `${meta.stock_name} (${meta.stock_symbol})`
        : meta.stock_symbol ?? meta.stock_name ?? "Indian equities";
    const verdictPart = meta.verdict ? ` — ${meta.verdict}` : "";
    const title = `${stockLabel}${verdictPart} | AI Analyst Report | Stockera`;
    const description = truncate(
      meta.query_text
        ? `${meta.query_text}${meta.verdict ? ` — Verdict: ${meta.verdict}` : ""}`
        : `SEBI-registered AI + expert analyst verdict on ${
            meta.stock_symbol ?? stockLabel
          }. Live from Stockera.`,
    );
    const image = SITE_DEFAULT_OG;
    const ld: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description,
      url: canonical,
      datePublished: meta.created_at,
      dateModified: meta.updated_at ?? meta.created_at,
      author: {
        "@type": "Organization",
        name: "Stockera Technologist",
        url: SITE_ORIGIN,
        identifier: "SEBI RA INH000019071",
      },
      publisher: {
        "@type": "Organization",
        name: "Ask The Expert by Stockera",
        logo: {
          "@type": "ImageObject",
          url: `${SITE_ORIGIN}/stockera-logo.png`,
        },
      },
    };
    if (meta.stock_name || meta.stock_symbol) {
      ld.about = {
        "@type": "Corporation",
        name: meta.stock_name ?? meta.stock_symbol,
        ...(meta.stock_symbol ? { tickerSymbol: meta.stock_symbol } : {}),
      };
    }
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index,follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: canonical },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(ld) },
      ],
    };
  },
  component: ReportContent,
  notFoundComponent: () => <NotFoundCard />,
  // HOTFIX — keep report render failures scoped to the route so the
  // top-level branded "This page didn't load" screen never intercepts a
  // valid report on first navigation. NotFoundCard is preserved for real
  // missing rows; any other error surfaces a scoped retry that invalidates
  // the report query rather than doing a full page reload.
  errorComponent: ({ error, reset }: { error: Error; reset: () => void }) => {
    if (isReportNotFoundError(error)) return <NotFoundCard />;
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Logo size="md" linkTo="/" />
          <h1 className="font-display text-2xl mt-6">Loading this report…</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {error?.message ?? "Please try again."}
          </p>
          <Button className="mt-4" onClick={() => reset()}>Retry</Button>
        </div>
      </div>
    );
  },
});



