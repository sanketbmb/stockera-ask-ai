import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PublicAnalyticsPayload } from "../types";

interface Props {
  quality: PublicAnalyticsPayload["long_term_quality_snapshot"];
  fundamentals: PublicAnalyticsPayload["fundamental_snapshot"];
}

function num(v: number | null | undefined, suffix = "", digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}${suffix}`;
}

const QUALITY_LABELS: Record<string, string> = {
  HIGH_QUALITY: "High Quality",
  AVERAGE: "Average",
  WEAK: "Weak",
  BANKING_ADJUSTED: "Banking Adjusted",
};

export function BusinessQualityCard({ quality, fundamentals }: Props) {
  const label = quality?.quality_label ? (QUALITY_LABELS[quality.quality_label] ?? quality.quality_label) : null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Business Quality</CardTitle>
          {label && <Badge variant="secondary">{label}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row k="ROE (5y avg)" v={num(quality?.roe_5y_avg, "%")} />
        <Row k="ROCE (5y avg)" v={num(quality?.roce_5y_avg, "%")} />
        <Row k="Debt / Equity" v={num(quality?.debt_to_equity_current, "", 2)} />
        <Row k="FCF Yield" v={num(quality?.fcf_yield, "%")} />
        <Row k="EPS CAGR (5y)" v={num(quality?.eps_cagr_5y, "%")} />
        <Row k="Promoter Holding" v={num(quality?.promoter_holding_pct, "%")} />
        <Row k="Piotroski F-Score" v={quality?.piotroski_f_score != null ? `${quality.piotroski_f_score}/9` : (fundamentals?.piotroski_f_score != null ? `${fundamentals.piotroski_f_score}/9` : "—")} />
        {quality?.margin_trend_label && (
          <Row k="Margin Trend" v={<span className="capitalize">{quality.margin_trend_label.toLowerCase()}</span>} />
        )}
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-1 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular-nums text-foreground">{v}</span>
    </div>
  );
}
