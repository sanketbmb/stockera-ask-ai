// Stage 4A.2 — public /stock/$symbol Analytics tab.
// PUBLIC RENDER LOCK: this file imports ONLY from ./analytics-cards/ (barrel).
// It MUST NOT import from src/components/analysis/* (that path is report-only
// and includes the verdict hero, ActionPanel, PriceBand, confidence triad,
// staggered plan, behavioral nudges, and summary recap — all forbidden here).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Reveal } from "@/lib/motion";
import {
  ScoreRingBlock,
  ReturnsAtAGlance,
  BusinessQualityCard,
  ValuationFairValueCard,
  RiskProfileCard,
  LongTermReturnsCard,
  Latest30dNewsBlock,
} from "./analytics-cards";
import { AnalyticsProvenanceFooter } from "./AnalyticsProvenanceFooter";
import type { StockOverview, PublicAnalyticsPayload, AnalyticsProvenance } from "./types";


interface Props {
  data: StockOverview;
  loggedIn: boolean;
}

export function AnalyticsTab({ data, loggedIn }: Props) {
  const [analytics, setAnalytics] = useState<PublicAnalyticsPayload | null>(data.analytics ?? null);
  const [provenance, setProvenance] = useState<AnalyticsProvenance | null>(data.analytics_provenance ?? null);
  const [loading, setLoading] = useState(false);

  const hasCache = analytics != null;

  async function generateNow() {
    if (!loggedIn) return;
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("public-analysis-fetch", {
        body: { symbol: data.symbol, exchange: data.exchange, compute: true },
      });
      if (error) throw error;
      if (res?.success && res.analytics) {
        setAnalytics(res.analytics as PublicAnalyticsPayload);
        setProvenance(res.provenance as AnalyticsProvenance);
        toast.success("Analytics generated", { description: "Fresh analysis ready." });
      } else if (res?.error === "RATE_LIMITED") {
        toast.error("Daily limit reached", { description: res.message });
      } else {
        toast.error("Could not generate", { description: res?.error ?? "Please try again later." });
      }
    } catch (e) {
      toast.error("Error", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  if (!hasCache) {
    return (
      <Card>
        <CardContent className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="text-lg font-medium text-foreground">
            Analytics not yet cached for {data.symbol}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {loggedIn
              ? "Pre-warmed analytics for this stock will appear after the next nightly refresh. You can generate it now (uses 1 of 5 daily compute credits)."
              : "Pre-warmed analytics for this stock will appear after the next nightly refresh. Sign in to generate on-demand."}
          </p>
          {loggedIn && (
            <Button onClick={generateNow} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Generate now
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          Public stock analytics · pre-warmed daily
        </div>
        {loggedIn ? (
          <Button
            size="sm"
            variant="outline"
            onClick={generateNow}
            disabled={loading}
            data-testid="refresh-analytics-cta"
            className="shrink-0"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh Analytics
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled title="Sign in to refresh analytics on demand" className="shrink-0">
            <RefreshCw className="mr-2 h-4 w-4" />
            Sign in to refresh
          </Button>
        )}
      </div>
      <Reveal>
        <ScoreRingBlock
          finalVerdict={analytics.final_verdict}
          scoreBreakdown={analytics.score_breakdown}
          tierWeights={analytics.audit_meta?.tier_weights ?? null}
        />
      </Reveal>
      <Reveal delay={0.05}>
        <ReturnsAtAGlance returns={analytics.returns_snapshot} />
      </Reveal>
      <div className="grid gap-4 md:grid-cols-2">
        <Reveal delay={0.1}>
          <BusinessQualityCard
            quality={analytics.long_term_quality_snapshot ?? null}
            fundamentals={analytics.fundamental_snapshot}
            auditMeta={analytics.audit_meta}
            scoreBreakdown={analytics.score_breakdown}
          />
        </Reveal>
        <Reveal delay={0.12}>
          <ValuationFairValueCard
            fundamentals={analytics.fundamental_snapshot}
            auditMeta={analytics.audit_meta}
          />
        </Reveal>
        <Reveal delay={0.14}>
          <RiskProfileCard
            risk={analytics.risk_snapshot}
            flags={analytics.flags}
            scoreBreakdown={analytics.score_breakdown}
          />
        </Reveal>
        <Reveal delay={0.16}>
          <LongTermReturnsCard returns={analytics.returns_snapshot} quality={analytics.long_term_quality_snapshot ?? null} />
        </Reveal>
      </div>
      <Reveal delay={0.2}>
        <Latest30dNewsBlock sentiment={analytics.sentiment_snapshot} />
      </Reveal>
      <AnalyticsProvenanceFooter
        provenance={provenance}
        formulaVersion={analytics.audit_meta?.formula_version ?? null}
        weightingProfileId={analytics.audit_meta?.weighting_profile_id ?? null}
      />
    </div>
  );
}

