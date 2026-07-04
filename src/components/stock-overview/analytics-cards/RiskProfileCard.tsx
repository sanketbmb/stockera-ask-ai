import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PublicAnalyticsPayload } from "../types";

interface Props {
  risk: PublicAnalyticsPayload["risk_snapshot"];
}

function num(v: number | null | undefined, suffix = "", digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}${suffix}`;
}

export function RiskProfileCard({ risk }: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Risk Profile</CardTitle>
          {risk?.liquidity_label && (
            <Badge variant="secondary" className="capitalize">
              {risk.liquidity_label.toLowerCase()} liquidity
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Row k="Beta" v={num(risk?.beta)} />
        <Row k="Volatility (1y)" v={num(risk?.volatility_1y, "%", 1)} />
        <Row k="Sharpe" v={num(risk?.sharpe_ratio)} />
        <Row k="Sortino" v={num(risk?.sortino_ratio)} />
        <Row k="Max Drawdown" v={num(risk?.max_drawdown, "%", 1)} />
        <Row k="VaR (95%)" v={num(risk?.var_95, "%", 1)} />
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular-nums text-foreground">{v}</span>
    </div>
  );
}
