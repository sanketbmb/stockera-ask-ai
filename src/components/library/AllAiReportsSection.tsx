// LIBRARY AUTH-VIEW SPLIT — sitewide "All AI Reports" section, authed only.
// Renders the platform-wide AI report feed for logged-in users, paginated
// via ?allPage=N. Data comes from listAllAiReports (requireSupabaseAuth +
// supabaseAdmin, safe projection only).
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Globe2, FileText, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { listAllAiReports } from "@/lib/library-all-ai-reports.functions";
import { MasterLibraryPagination } from "@/components/library/MasterLibraryPagination";

const INTENT_LABEL: Record<string, string> = {
  fresh_entry: "Fresh Entry",
  existing_position: "Sell or Hold",
  averaging: "Should I Average",
  buy_decision: "Fresh Entry",
  stuck_position: "Sell or Hold",
  should_average: "Should I Average",
};

type Props = {
  page: number;
  onPageChange: (page: number) => void;
};

export function AllAiReportsSection({ page, onPageChange }: Props) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const fetchAll = useServerFn(listAllAiReports);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["library", "all-ai-reports", page, user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: () => fetchAll({ data: { page } }),
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);

  if (!isAuthLoading && !user) return null;

  return (
    <section aria-labelledby="all-ai-reports-heading" className="mb-8">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-primary" aria-hidden />
          <h2
            id="all-ai-reports-heading"
            className="font-display text-lg text-foreground"
          >
            All AI Reports
          </h2>
          {data ? (
            <span className="text-xs text-muted-foreground">{data.total}</span>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">
          Sitewide feed · newest first
        </span>
      </div>

      {isLoading || isAuthLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-4 text-center text-sm text-muted-foreground">
          Couldn't load the sitewide feed right now. Try again shortly.
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center">
          <FileText className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm text-foreground">No AI reports yet.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => {
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
                      <span className="rounded-full bg-muted text-muted-foreground text-[9px] px-1.5 py-0.5 font-semibold uppercase tracking-wide">
                        Sitewide
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
                    <p className="mt-2 text-[10px] text-muted-foreground inline-flex items-center gap-1">
                      {when
                        ? `Generated ${formatDistanceToNow(new Date(when), { addSuffix: true })}`
                        : ""}
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
          {data && data.totalPages > 1 ? (
            <div className="mt-6">
              <MasterLibraryPagination
                currentPage={data.page}
                totalPages={data.totalPages}
                onPageChange={onPageChange}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export default AllAiReportsSection;
