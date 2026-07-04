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
    <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
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
          <div className="relative flex items-center justify-center">
            <ScoreRing value={overall ?? 0} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-3xl font-bold text-foreground">{overall != null ? Math.round(overall) : "—"}</div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Score</div>
            </div>
          </div>
          <div className="flex-1 w-full space-y-2">
            {scoreBreakdown &&
              Object.entries(scoreBreakdown).map(([k, v]) => {
                const label = PILLAR_LABELS[k] ?? k;
                const weight = tierWeights?.[k.replace("_score", "")] ?? tierWeights?.[k];
                return (
                  <div key={k}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {label}
                        {weight != null && (
                          <span className="ml-1 text-[10px] opacity-60">({Math.round(weight * 100)}%)</span>
                        )}
                      </span>
                      <span className="tabular-nums text-foreground">{Math.round(v)}</span>
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
        </div>
      </CardContent>
    </Card>
  );
}
