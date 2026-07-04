import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PublicAnalyticsPayload } from "../types";

interface Props {
  risk: PublicAnalyticsPayload["risk_snapshot"];
  flags: PublicAnalyticsPayload["flags"];
  scoreBreakdown: PublicAnalyticsPayload["score_breakdown"];
}

function num(v: number | null | undefined, suffix = "", digits = 2): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${v.toFixed(digits)}${suffix}`;
}

export function RiskProfileCard({ risk, flags, scoreBreakdown }: Props) {
  const benchmarkFallback = flags?.benchmark_fallback_used === true;
  const rows: Array<{ k: string; v: string }> = [];
  const beta = num(risk?.beta);
  const vol = num(risk?.volatility_1y, "%", 1);
  const sharpe = num(risk?.sharpe_ratio);
  const sortino = num(risk?.sortino_ratio);
  const mdd = num(risk?.max_drawdown, "%", 1);
  const var95 = num(risk?.var_95, "%", 1);
  if (beta) rows.push({ k: "Beta", v: beta });
  if (vol) rows.push({ k: "Volatility (1y)", v: vol });
  if (sharpe) rows.push({ k: "Sharpe", v: sharpe });
  if (sortino) rows.push({ k: "Sortino", v: sortino });
  if (mdd) rows.push({ k: "Max Drawdown", v: mdd });
  if (var95) rows.push({ k: "VaR (95%)", v: var95 });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Risk Profile</CardTitle>
          <div className="flex items-center gap-2">
            {scoreBreakdown?.risk_score != null && (
              <Badge variant="outline" className="tabular-nums">
                {Math.round(scoreBreakdown.risk_score)}/100
              </Badge>
            )}
            {risk?.liquidity_label && (
              <Badge variant="secondary" className="capitalize">
                {risk.liquidity_label.toLowerCase()} liquidity
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {benchmarkFallback && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-muted-foreground">
            Benchmark fallback active — beta/RS derived vs proxy index
          </div>
        )}
        {rows.length === 0 ? (
          <div className="py-2 text-xs text-muted-foreground">No risk metrics available.</div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {rows.map(({ k, v }) => (
              <div key={k} className="flex items-center justify-between border-b border-border/50 py-1">
                <span className="text-muted-foreground">{k}</span>
                <span className="tabular-nums text-foreground">{v}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
