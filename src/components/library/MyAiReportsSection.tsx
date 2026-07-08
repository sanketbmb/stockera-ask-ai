// Library — "My AI Reports" (owner-scoped).
// Auth-aware. Uses the browser Supabase client so RLS scopes reads to
// auth.uid() = ai_reports.user_id automatically. When the user is logged
// out, this component renders nothing so the public grid below is
// unaffected.
//
// Founder decision D=A: every AI report the user generates appears here
// automatically after creation (ai_reports insert happens in the generator
// edge fn). No separate publish step. This is OWNER-ONLY visibility —
// non-owners never see these rows because RLS forbids it. Public /
// discover reports keep flowing through the existing library_items grid.
//
// Dedupe: latest ai_report per query_id (reruns don't create duplicate
// cards).
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { FileText, ArrowRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type AiReportRow = {
  id: string;
  query_id: string;
  stock_symbol: string | null;
  stock_exchange: string | null;
  intent: string;
  generated_at: string;
  created_at: string;
};

type QueryRow = {
  id: string;
  stock_name: string | null;
  query_text: string | null;
};

type Card = AiReportRow & { stock_name: string | null; query_text: string | null };

const INTENT_LABEL: Record<string, string> = {
  fresh_entry: "Fresh Entry",
  existing_position: "Sell or Hold",
  averaging: "Should I Average",
  buy_decision: "Fresh Entry",
  stuck_position: "Sell or Hold",
  should_average: "Should I Average",
};

export function MyAiReportsSection() {
  const { user, isLoading: isAuthLoading } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["library", "my-ai-reports", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<Card[]> => {
      // RLS scopes to auth.uid() = user_id — safe on the browser client.
      const { data: reports, error } = await supabase
        .from("ai_reports")
        .select("id, query_id, stock_symbol, stock_exchange, intent, generated_at, created_at")
        .eq("user_id", user!.id)
        .order("generated_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      const rows = (reports ?? []) as AiReportRow[];
      if (rows.length === 0) return [];

      // Dedupe: keep the latest report per query_id.
      const latestByQuery = new Map<string, AiReportRow>();
      for (const r of rows) {
        if (!latestByQuery.has(r.query_id)) latestByQuery.set(r.query_id, r);
      }
      const deduped = Array.from(latestByQuery.values());

      const ids = deduped.map((r) => r.query_id);
      const { data: qs } = await supabase
        .from("queries")
        .select("id, stock_name, query_text")
        .in("id", ids);
      const qMap = new Map<string, QueryRow>(((qs ?? []) as QueryRow[]).map((q) => [q.id, q]));
      return deduped.map((r) => ({
        ...r,
        stock_name: qMap.get(r.query_id)?.stock_name ?? null,
        query_text: qMap.get(r.query_id)?.query_text ?? null,
      }));
    },
  });

  if (!isAuthLoading && !user) return null;

  return (
    <section aria-labelledby="my-ai-reports-heading" className="mb-8">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          <h2
            id="my-ai-reports-heading"
            className="font-display text-lg text-foreground"
          >
            My AI Reports
          </h2>
          {data ? (
            <span className="text-xs text-muted-foreground">{data.length}</span>
          ) : null}
        </div>
        <Link
          to="/my-queries"
          className="text-xs font-medium text-primary hover:underline"
        >
          View all queries →
        </Link>
      </div>

      {isLoading || isAuthLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-4 text-center text-sm text-muted-foreground">
          Couldn't load your reports right now. Try again shortly.
        </Card>
      ) : !data || data.length === 0 ? (
        <Card className="p-6 text-center">
          <FileText className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm text-foreground">No AI reports yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ask a question to generate your first AI report — it will appear here automatically.
          </p>
          <Link
            to="/post-query"
            className="mt-4 inline-flex items-center gap-1 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Post a query <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.map((r) => {
            const intentLabel = INTENT_LABEL[r.intent] ?? r.intent;
            const symbol = r.stock_symbol ?? "";
            const title = r.stock_name ?? symbol ?? "AI Report";
            const when = r.generated_at ?? r.created_at;
            return (
              <Link
                key={r.id}
                to={"/report/$queryId" as never}
                params={{ queryId: r.query_id } as never}
                className="group block"
              >
                <Card className="h-full p-4 transition-shadow hover:shadow-lg">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      {intentLabel}
                    </Badge>
                    <span className="rounded-full bg-primary/10 text-primary text-[9px] px-1.5 py-0.5 font-semibold uppercase tracking-wide">
                      Owner
                    </span>
                  </div>
                  <p className="mt-2 font-medium text-sm text-foreground line-clamp-1 group-hover:text-primary">
                    {title}
                    {symbol && r.stock_name ? (
                      <span className="text-muted-foreground"> · {symbol}</span>
                    ) : null}
                  </p>
                  {r.query_text ? (
                    <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                      {r.query_text}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {when
                      ? `Generated ${formatDistanceToNow(new Date(when), { addSuffix: true })}`
                      : ""}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default MyAiReportsSection;
