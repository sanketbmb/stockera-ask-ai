import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { StockOverview } from "./types";
import { getAuthRedirectPath } from "@/lib/auth/redirectHelper";

interface Props {
  data: StockOverview;
  loggedIn: boolean;
}

interface ReportRow {
  id: string;
  kind: string | null;
  source_table: string | null;
  source_id: string | null;
  symbol: string | null;
  symbol_exchange: string | null;
  title: string | null;
  verdict: string | null;
  sector: string | null;
  analyst_id: string | null;
  body_excerpt: string | null;
  published_at: string | null;
}

const BUCKET_LABEL: Record<string, string> = {
  buy: "Buy", watchlist: "Watchlist", hold: "Hold", avoid: "Avoid", other: "Other",
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

function verdictClass(v: string | null): string {
  const key = (v ?? "").toUpperCase();
  if (key === "BUY") return "bg-primary/15 text-primary";
  if (key === "WATCHLIST") return "bg-accent/15 text-accent-foreground";
  if (key === "HOLD" || key === "WAIT") return "bg-muted text-foreground";
  if (key === "AVOID" || key === "SELL" || key === "EXIT" || key === "PARTIAL_EXIT") return "bg-destructive/15 text-destructive";
  return "bg-muted text-muted-foreground";
}

export function AiReportsTab({ data, loggedIn }: Props) {
  const stats = data.ai_report_stats;
  const total = stats.total_reports_on_stock;
  const dist = stats.latest_verdict_distribution;
  const entries = Object.entries(dist).filter(([, n]) => n > 0);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["stock-ai-reports", data.symbol],
    queryFn: async (): Promise<ReportRow[]> => {
      const { data: rows, error } = await supabase
        .from("library_items")
        .select("id, kind, source_table, source_id, symbol, symbol_exchange, title, verdict, sector, analyst_id, body_excerpt, published_at")
        .eq("kind", "report")
        .eq("is_public", true)
        .eq("is_tombstoned", false)
        .eq("symbol", data.symbol)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) return [];
      return (rows ?? []) as ReportRow[];
    },
    staleTime: 30 * 1000,
    throwOnError: false,
    retry: false,
  });

  const list = reports ?? [];
  const visibleCount = list.length;

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
          <Button asChild className="rounded-full bg-gradient-brand text-white shadow-glow-teal">
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

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : visibleCount === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Be the first to generate an AI report on {data.symbol}.
          </p>
          <Button asChild className="mt-4 rounded-full bg-gradient-brand text-white">
            <Link
              to={loggedIn ? "/post-query" : "/signup"}
              search={loggedIn ? { symbol: data.symbol } as never : { next: `/stock/${data.symbol}` } as never}
            >
              {loggedIn ? "Start a report" : "Sign up to start"}
            </Link>
          </Button>
        </Card>
      ) : !loggedIn ? (
        <div className="relative">
          <ul className="space-y-3">
            {list.slice(0, 2).map((r) => (
              <ReportCard key={r.id} row={r} blurred />
            ))}
          </ul>
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-b from-transparent via-background/70 to-background">
            <Card className="pointer-events-auto m-4 max-w-md p-5 text-center shadow-lg">
              <Lock className="mx-auto h-6 w-6 text-primary" aria-hidden="true" />
              <h3 className="mt-2 font-display text-lg text-foreground">
                Sign up to see all {visibleCount} AI reports on {data.symbol}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Free account. Read every community AI report and generate your own.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button asChild className="rounded-full bg-gradient-brand text-white">
                  <Link to="/signup" search={{ next: `/stock/${data.symbol}` } as never}>
                    Create free account
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to={getAuthRedirectPath() as never} search={{ redirect: `/stock/${data.symbol}` } as never}>Log in</Link>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <ReportCard key={r.id} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportCard({ row, blurred }: { row: ReportRow; blurred?: boolean }) {
  const linkable = row.source_table === "queries" && row.source_id;
  const body = (
    <Card className={`p-4 transition-colors ${blurred ? "select-none blur-sm" : "hover:bg-muted/40"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {row.verdict && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${verdictClass(row.verdict)}`}>
                {row.verdict}
              </span>
            )}
            {row.symbol && <span className="font-mono text-[10px] text-muted-foreground">{row.symbol}</span>}
          </div>
          <div className="mt-1 font-medium text-foreground line-clamp-2">{row.title ?? "Untitled report"}</div>
          {row.body_excerpt && (
            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{row.body_excerpt}</div>
          )}
          <div className="mt-2 text-[11px] text-muted-foreground">{fmtDate(row.published_at)}</div>
        </div>
      </div>
    </Card>
  );
  if (blurred || !linkable) return <li>{body}</li>;
  return (
    <li>
      <Link to="/report/$queryId" params={{ queryId: row.source_id! }} className="block">
        {body}
      </Link>
    </li>
  );
}
