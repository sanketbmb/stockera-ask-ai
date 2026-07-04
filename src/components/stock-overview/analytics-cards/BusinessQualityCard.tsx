import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PublicAnalyticsPayload } from "../types";

interface Props {
  quality: PublicAnalyticsPayload["long_term_quality_snapshot"];
  fundamentals: PublicAnalyticsPayload["fundamental_snapshot"];
  auditMeta: PublicAnalyticsPayload["audit_meta"];
  scoreBreakdown: PublicAnalyticsPayload["score_breakdown"];
}

function num(v: number | null | undefined, suffix = "", digits = 1): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${v.toFixed(digits)}${suffix}`;
}

const QUALITY_LABELS: Record<string, string> = {
  HIGH_QUALITY: "High Quality",
  AVERAGE: "Average",
  WEAK: "Weak",
  BANKING_ADJUSTED: "Banking Adjusted",
};

function NoDataChip() {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      no data
    </span>
  );
}

export function BusinessQualityCard({ quality, fundamentals, auditMeta, scoreBreakdown }: Props) {
  const isFallback = fundamentals?.derivation === "sector_fallback";
  const meta = fundamentals?.sector_fallback_meta ?? null;
  const dcfStatus = auditMeta?.dcf_status ?? null;
  const dcfMethod = auditMeta?.dcf_method_used ?? null;
  const bankingOverride = auditMeta?.banking_override_applied === true;
  const bankingReason = auditMeta?.banking_override_reason ?? null;
  const label = !isFallback && quality?.quality_label
    ? (QUALITY_LABELS[quality.quality_label] ?? quality.quality_label)
    : null;

  const pe = num(fundamentals?.pe_ratio, "", 1);
  const roe = num(fundamentals?.roe, "%");
  const piotroski = fundamentals?.piotroski_f_score ?? quality?.piotroski_f_score ?? null;
  const altman = num(fundamentals?.altman_z_score, "", 2);
  const dcfPct = num(fundamentals?.dcf_upside_pct, "%");

  const roe5y = num(quality?.roe_5y_avg, "%");
  const roce5y = num(quality?.roce_5y_avg, "%");
  const dte = num(quality?.debt_to_equity_current, "", 2);
  const fcfy = num(quality?.fcf_yield, "%");
  const epsCagr = num(quality?.eps_cagr_5y, "%");
  const promoter = num(quality?.promoter_holding_pct, "%");

  const dcfNoData = dcfStatus === "DCF_UNAVAILABLE" || dcfStatus === "DCF_SKIPPED" || dcfPct == null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Business Quality</CardTitle>
          <div className="flex items-center gap-2">
            {scoreBreakdown?.fundamental_score != null && (
              <Badge variant="outline" className="tabular-nums">
                {Math.round(scoreBreakdown.fundamental_score)}/100
              </Badge>
            )}
            {label && <Badge variant="secondary">{label}</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isFallback && (
          <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-muted-foreground">
            Sector-derived fallback · company fundamentals unavailable · sector:{" "}
            <span className="text-foreground">{meta?.sector_display ?? "unknown"}</span>. Only sector medians shown;
            company-level quality scores withheld.
          </div>
        )}
        {bankingOverride && (
          <div className="mb-2 rounded-md border border-blue-500/30 bg-blue-500/5 p-2 text-xs text-muted-foreground">
            Banking carve-out applied{bankingReason ? <> — {bankingReason}</> : null}
          </div>
        )}

        {isFallback ? (
          <>
            <Row k="P/E Ratio" v={pe ? <span className="tabular-nums">{pe} <span className="text-[10px] text-muted-foreground">· sector median (n={meta?.sample_size ?? "?"})</span></span> : <NoDataChip />} />
            <Row k="ROE" v={roe ? <span className="tabular-nums">{roe} <span className="text-[10px] text-muted-foreground">· sector median (n={meta?.sample_size ?? "?"})</span></span> : <NoDataChip />} />
            <Row k="Piotroski F-Score" v={<NoDataChip />} />
            <Row k="Altman Z-Score" v={<NoDataChip />} />
            <Row k="DCF Upside" v={<NoDataChip />} />
          </>
        ) : (
          <>
            {roe5y && <Row k="ROE (5y avg)" v={<span className="tabular-nums">{roe5y}</span>} />}
            {roce5y && <Row k="ROCE (5y avg)" v={<span className="tabular-nums">{roce5y}</span>} />}
            {dte && <Row k="Debt / Equity" v={<span className="tabular-nums">{dte}</span>} />}
            {fcfy && <Row k="FCF Yield" v={<span className="tabular-nums">{fcfy}</span>} />}
            {epsCagr && <Row k="EPS CAGR (5y)" v={<span className="tabular-nums">{epsCagr}</span>} />}
            {promoter && <Row k="Promoter Holding" v={<span className="tabular-nums">{promoter}</span>} />}
            {piotroski != null && <Row k="Piotroski F-Score" v={<span className="tabular-nums">{piotroski}/9</span>} />}
            {altman && <Row k="Altman Z-Score" v={<span className="tabular-nums">{altman}</span>} />}
            <Row
              k="DCF Upside"
              v={dcfNoData ? <NoDataChip /> : <span className="tabular-nums">{dcfPct}{dcfMethod ? <span className="ml-1 text-[10px] text-muted-foreground">· {dcfMethod}</span> : null}</span>}
            />
            {quality?.margin_trend_label && (
              <Row k="Margin Trend" v={<span className="capitalize">{quality.margin_trend_label.toLowerCase()}</span>} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-1 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-foreground">{v}</span>
    </div>
  );
}
