import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicAnalyticsPayload } from "../types";

interface Props {
  returns: PublicAnalyticsPayload["returns_snapshot"];
  quality: PublicAnalyticsPayload["long_term_quality_snapshot"];
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function tone(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  if (v > 0) return "text-emerald-500";
  if (v < 0) return "text-red-500";
  return "text-foreground";
}

export function LongTermReturnsCard({ returns, quality }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Long-Term Returns</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-center">
            <div className="text-xs uppercase text-muted-foreground">1-Year</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${tone(returns?.one_year)}`}>
              {fmtPct(returns?.one_year)}
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3 text-center">
            <div className="text-xs uppercase text-muted-foreground">EPS CAGR (5y)</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${tone(quality?.eps_cagr_5y)}`}>
              {fmtPct(quality?.eps_cagr_5y)}
            </div>
          </div>
        </div>
        {quality?.earnings_consistency_label && (
          <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
            <span className="text-muted-foreground">Earnings Consistency</span>
            <span className="capitalize text-foreground">
              {quality.earnings_consistency_label.toLowerCase().replace(/_/g, " ")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
