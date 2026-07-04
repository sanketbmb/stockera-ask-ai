import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PublicAnalyticsPayload } from "../types";

interface Props {
  fundamentals: PublicAnalyticsPayload["fundamental_snapshot"];
  auditMeta: PublicAnalyticsPayload["audit_meta"];
}

function num(v: number | null | undefined, suffix = "", digits = 1): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${v.toFixed(digits)}${suffix}`;
}

function upsideTone(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  if (v > 15) return "text-emerald-500";
  if (v > 0) return "text-foreground";
  if (v < -10) return "text-red-500";
  return "text-amber-500";
}

export function ValuationFairValueCard({ fundamentals, auditMeta }: Props) {
  const isFallback = fundamentals?.derivation === "sector_fallback";
  const meta = fundamentals?.sector_fallback_meta ?? null;
  const dcfStatus = auditMeta?.dcf_status ?? null;
  const pe = num(fundamentals?.pe_ratio, "", 1);
  const roe = num(fundamentals?.roe, "%");
  const altman = num(fundamentals?.altman_z_score, "", 2);
  const dcfPct = fundamentals?.dcf_upside_pct;

  // Suppress company-style valuation label whenever derivation is sector_fallback,
  // regardless of what valuation_label the payload carries.
  const showValuationPill = !isFallback && !!fundamentals?.valuation_label;

  const dcfShouldRender = !isFallback && dcfStatus === "DCF_OK" && dcfPct != null && Number.isFinite(dcfPct);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Valuation &amp; Fair Value</CardTitle>
          {showValuationPill && (
            <Badge variant="secondary" className="capitalize">
              {fundamentals!.valuation_label.toLowerCase().replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isFallback && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-muted-foreground">
            Sector-based valuation only ({meta?.sector_display ?? "sector"}
            {meta?.sample_size != null ? <>, n={meta.sample_size}</> : null}). Company-level fair-value withheld.
          </div>
        )}

        {pe && (
          <div className="flex items-center justify-between border-b border-border/50 py-1">
            <span className="text-muted-foreground">P/E Ratio</span>
            <span className="tabular-nums text-foreground">
              {pe}
              {isFallback && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  · sector median (n={meta?.sample_size ?? "?"})
                </span>
              )}
            </span>
          </div>
        )}
        {roe && !isFallback && (
          <div className="flex items-center justify-between border-b border-border/50 py-1">
            <span className="text-muted-foreground">ROE</span>
            <span className="tabular-nums text-foreground">{roe}</span>
          </div>
        )}
        {altman && !isFallback && (
          <div className="flex items-center justify-between border-b border-border/50 py-1">
            <span className="text-muted-foreground">Altman Z-Score</span>
            <span className="tabular-nums text-foreground">{altman}</span>
          </div>
        )}
        {dcfShouldRender && (
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">DCF Upside</span>
            <span className={`tabular-nums font-medium ${upsideTone(dcfPct)}`}>
              {num(dcfPct, "%")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
