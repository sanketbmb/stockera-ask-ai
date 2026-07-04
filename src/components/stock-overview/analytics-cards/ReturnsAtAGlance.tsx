import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicAnalyticsPayload } from "../types";

interface Props {
  returns: PublicAnalyticsPayload["returns_snapshot"];
}

function fmtPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function tone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v > 0) return "text-emerald-500";
  if (v < 0) return "text-red-500";
  return "text-foreground";
}

export function ReturnsAtAGlance({ returns }: Props) {
  const rows: Array<[string, number | null]> = [
    ["1W", returns?.one_week ?? null],
    ["1M", returns?.one_month ?? null],
    ["3M", returns?.three_month ?? null],
    ["1Y", returns?.one_year ?? null],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Returns at a Glance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3">
          {rows.map(([label, v]) => (
            <div key={label} className="rounded-md border border-border bg-muted/30 p-3 text-center">
              <div className="text-xs uppercase text-muted-foreground">{label}</div>
              <div className={`mt-1 text-lg font-semibold tabular-nums ${tone(v)}`}>{fmtPct(v)}</div>
            </div>
          ))}
        </div>
        {(returns?.vs_nifty_one_month != null || returns?.vs_nifty_three_month != null) && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
            <div className="text-sm">
              <span className="text-muted-foreground">vs Nifty 1M: </span>
              <span className={`font-medium tabular-nums ${tone(returns?.vs_nifty_one_month ?? null)}`}>
                {fmtPct(returns?.vs_nifty_one_month ?? null)}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">vs Nifty 3M: </span>
              <span className={`font-medium tabular-nums ${tone(returns?.vs_nifty_three_month ?? null)}`}>
                {fmtPct(returns?.vs_nifty_three_month ?? null)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
