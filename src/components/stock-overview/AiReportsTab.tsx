import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { StockOverview } from "./types";

interface Props {
  data: StockOverview;
  loggedIn: boolean;
}

const BUCKET_LABEL: Record<string, string> = {
  buy: "Buy",
  watchlist: "Watchlist",
  hold: "Hold",
  avoid: "Avoid",
  other: "Other",
};
const BUCKET_COLOR: Record<string, string> = {
  buy: "bg-primary/15 text-primary",
  watchlist: "bg-accent/15 text-accent-foreground",
  hold: "bg-muted text-foreground",
  avoid: "bg-destructive/15 text-destructive",
  other: "bg-muted text-muted-foreground",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function AiReportsTab({ data, loggedIn }: Props) {
  const stats = data.ai_report_stats;
  const total = stats.total_reports_on_stock;
  const dist = stats.latest_verdict_distribution;
  const entries = Object.entries(dist).filter(([, n]) => n > 0);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Community AI Reports for {data.symbol}
            </div>
            <div className="mt-1 font-display text-3xl text-foreground">
              {total.toLocaleString("en-IN")}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {total === 0
                ? "No AI reports generated yet."
                : `Most recent: ${fmtDate(stats.most_recent_report_date)}`}
            </div>
          </div>
          <Button
            asChild
            className="rounded-full bg-gradient-brand text-white shadow-glow-teal"
          >
            <Link
              to={loggedIn ? "/post-query" : "/signup"}
              search={loggedIn ? { symbol: data.symbol } as never : { next: `/stock/${data.symbol}` } as never}
            >
              {loggedIn ? `Generate AI Report on ${data.symbol}` : "Sign up to generate your own"}
            </Link>
          </Button>
        </div>

        {entries.length > 0 && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Analyst verdict distribution
            </div>
            <div className="flex flex-wrap gap-2">
              {entries.map(([bucket, n]) => (
                <Badge key={bucket} className={`${BUCKET_COLOR[bucket] ?? "bg-muted"} border-none`}>
                  {BUCKET_LABEL[bucket] ?? bucket}: {n}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {!loggedIn && (
        <Card className="p-5 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
          <h3 className="font-display text-lg text-foreground">
            Get a personalized AI analysis on {data.symbol}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask a specific question — averaging, entry price, exit thesis — and our AI + SEBI-registered analysts
            respond within hours. Free credits on signup.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild className="rounded-full bg-gradient-brand text-white">
              <Link to="/signup" search={{ next: `/stock/${data.symbol}` } as never}>Create free account</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/login" search={{ redirect: `/stock/${data.symbol}` } as never}>Log in</Link>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
