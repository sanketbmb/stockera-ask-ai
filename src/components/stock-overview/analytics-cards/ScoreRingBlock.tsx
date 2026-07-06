import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicAnalyticsPayload } from "../types";

interface Props {
  finalVerdict: PublicAnalyticsPayload["final_verdict"];
  scoreBreakdown: PublicAnalyticsPayload["score_breakdown"];
  tierWeights: Record<string, number> | null;
}

const PILLAR_LABELS: Record<string, string> = {
  technical_score: "Technical",
  fundamental_score: "Fundamental",
  risk_score: "Risk",
  momentum_score: "Momentum",
  sentiment_score: "Sentiment",
};

function ScoreRing({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = 42, C = 2 * Math.PI * r;
  const dash = (clamped / 100) * C;
  return (
    <svg
      viewBox="0 0 100 100"
      className="-rotate-90"
      style={{ width: "clamp(6.5rem, 28vw, 9rem)", height: "clamp(6.5rem, 28vw, 9rem)" }}
    >
      <circle cx="50" cy="50" r={r} className="fill-none stroke-border" strokeWidth="8" />
      <circle
        cx="50" cy="50" r={r}
        className="fill-none stroke-primary transition-all"
        strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${dash} ${C - dash}`}
      />
    </svg>
  );
}

export function ScoreRingBlock({ finalVerdict, scoreBreakdown, tierWeights }: Props) {
  const overall = finalVerdict?.overall_score ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Composite Score</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex shrink-0 items-center justify-center">
            <ScoreRing value={overall ?? 0} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-3xl font-bold tabular-nums text-foreground">{overall != null ? Math.round(overall) : "—"}</div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Score</div>
            </div>
          </div>
          <div className="w-full flex-1">
            {scoreBreakdown && (
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-1">
                {Object.entries(scoreBreakdown).map(([k, v]) => {
                  const label = PILLAR_LABELS[k] ?? k;
                  const weight = tierWeights?.[k.replace("_score", "")] ?? tierWeights?.[k];
                  return (
                    <div key={k} className="min-w-0">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate text-muted-foreground">
                          {label}
                          {weight != null && (
                            <span className="ml-1 whitespace-nowrap text-[10px] opacity-60">({Math.round(weight * 100)}%)</span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-foreground">{Math.round(v)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-border">
                        <div
                          className="h-1.5 rounded-full bg-primary transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

