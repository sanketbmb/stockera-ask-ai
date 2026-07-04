// Stage 4A.2 — public /stock/$symbol Analytics tab.
// PUBLIC RENDER LOCK: this file imports ONLY from ./analytics-cards/ (barrel).
// It MUST NOT import from src/components/analysis/* (that path is report-only
// and includes the verdict hero, ActionPanel, PriceBand, confidence triad,
// staggered plan, behavioral nudges, and summary recap — all forbidden here).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <div className="text-foreground text-lg font-medium">Analytics not yet cached for {data.symbol}</div>
          <p className="max-w-md text-sm text-muted-foreground">
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
      <ScoreRingBlock
        finalVerdict={analytics.final_verdict}
        scoreBreakdown={analytics.score_breakdown}
        tierWeights={analytics.audit_meta?.tier_weights ?? null}
      />
      <ReturnsAtAGlance returns={analytics.returns_snapshot} />
      <div className="grid gap-4 md:grid-cols-2">
        <BusinessQualityCard quality={analytics.long_term_quality_snapshot ?? null} fundamentals={analytics.fundamental_snapshot} />
        <ValuationFairValueCard fundamentals={analytics.fundamental_snapshot} />
        <RiskProfileCard risk={analytics.risk_snapshot} />
        <LongTermReturnsCard returns={analytics.returns_snapshot} quality={analytics.long_term_quality_snapshot ?? null} />
      </div>
      <Latest30dNewsBlock sentiment={analytics.sentiment_snapshot} />
      <AnalyticsProvenanceFooter provenance={provenance} formulaVersion={analytics.audit_meta?.formula_version ?? null} />
    </div>
  );
}
