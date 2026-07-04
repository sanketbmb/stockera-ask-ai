import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PublicAnalyticsPayload } from "../types";

interface Props {
  fundamentals: PublicAnalyticsPayload["fundamental_snapshot"];
}

function num(v: number | null | undefined, suffix = "", digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}${suffix}`;
}

function upsideTone(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  if (v > 15) return "text-emerald-500";
  if (v > 0) return "text-foreground";
  if (v < -10) return "text-red-500";
  return "text-amber-500";
}

export function ValuationFairValueCard({ fundamentals }: Props) {
  const isFallback = fundamentals?.derivation === "sector_fallback";
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Valuation &amp; Fair Value</CardTitle>
          {fundamentals?.valuation_label && (
            <Badge variant="secondary" className="capitalize">
              {fundamentals.valuation_label.toLowerCase().replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between border-b border-border/50 py-1">
          <span className="text-muted-foreground">P/E Ratio</span>
          <span className="tabular-nums text-foreground">{num(fundamentals?.pe_ratio, "", 1)}</span>
        </div>
        <div className="flex items-center justify-between border-b border-border/50 py-1">
          <span className="text-muted-foreground">ROE</span>
          <span className="tabular-nums text-foreground">{num(fundamentals?.roe, "%")}</span>
        </div>
        <div className="flex items-center justify-between border-b border-border/50 py-1">
          <span className="text-muted-foreground">Altman Z-Score</span>
          <span className="tabular-nums text-foreground">{num(fundamentals?.altman_z_score, "", 2)}</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-muted-foreground">DCF Upside</span>
          <span className={`tabular-nums font-medium ${upsideTone(fundamentals?.dcf_upside_pct)}`}>
            {num(fundamentals?.dcf_upside_pct, "%")}
          </span>
        </div>
        {isFallback && fundamentals?.sector_fallback_meta && (
          <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-muted-foreground">
            Sector-derived fallback ({fundamentals.sector_fallback_meta.sector_display ?? "sector"},
            n={fundamentals.sector_fallback_meta.sample_size ?? "?"}). Company-level fundamentals unavailable.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
