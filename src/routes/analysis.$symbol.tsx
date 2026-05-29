import { createFileRoute, useParams, useSearch, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { z } from "zod";
import { Navbar } from "@/components/layout/Navbar";
import { StockAnalysisReport } from "@/components/analysis/StockAnalysisReport";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { StockAnalysisPayload, QueryType } from "@/types/stock-analysis";
import { supabase } from "@/integrations/supabase/client";
import { generateAnalysisPdf } from "@/lib/pdf.functions";

const searchSchema = z.object({
  horizon: z.enum(["intraday", "medium-term", "long-term"]).optional(),
  news: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/analysis/$symbol")({
  validateSearch: searchSchema,
  head: ({ params }) => ({
    meta: [
      { title: `${params.symbol} — Stock Analysis · Stockera` },
      { name: "description", content: `Brain v2 analysis for ${params.symbol}: verdict, score, levels, technicals, fundamentals, risk and sentiment.` },
    ],
  }),
  component: AnalysisPage,
});

function AnalysisPage() {
  const { symbol } = useParams({ from: "/analysis/$symbol" });
  const search = useSearch({ from: "/analysis/$symbol" });
  const horizon: QueryType = search.horizon ?? "medium-term";
  const includeNews = search.news !== false;

  const { data, isLoading, error, refetch, isFetching } = useQuery<StockAnalysisPayload>({
    queryKey: ["stock-analysis", symbol, horizon, includeNews],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-stock-analysis", {
        body: { symbol, query_type: horizon, include_news: includeNews },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error ?? "Analysis failed");
      return data as StockAnalysisPayload;
    },
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen bg-mesh">
      <Navbar />
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 pt-6 md:px-6">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Horizon:</span>
        {(["intraday", "medium-term", "long-term"] as const).map((h) => (
          <Link
            key={h}
            to="/analysis/$symbol"
            params={{ symbol }}
            search={{ horizon: h, news: includeNews }}
            className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
              horizon === h ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {h.replace("-", " ")}
          </Link>
        ))}
        <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">News:</span>
        <Link
          to="/analysis/$symbol"
          params={{ symbol }}
          search={{ horizon, news: !includeNews }}
          className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
            includeNews ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground"
          }`}
        >
          {includeNews ? "On" : "Off"}
        </Link>
        {isFetching && <span className="ml-2 text-[11px] text-muted-foreground">refreshing…</span>}
        <div className="ml-auto">
          <DownloadPdfButton symbol={symbol} horizon={horizon} includeNews={includeNews} disabled={!data} />
        </div>
      </div>

      {isLoading && <LoadingState />}
      {error && (
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="font-display text-2xl">Could not load analysis</h2>
          <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
          <Button className="mt-4" onClick={() => refetch()}>Retry</Button>
        </div>
      )}
      {data && <StockAnalysisReport data={data} />}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-52 rounded-2xl" />
      </div>
    </div>
  );
}

function DownloadPdfButton({
  symbol, horizon, includeNews, disabled,
}: { symbol: string; horizon: QueryType; includeNews: boolean; disabled?: boolean }) {
  const generate = useServerFn(generateAnalysisPdf);
  const [busy, setBusy] = useState(false);
  const handleClick = async () => {
    if (busy || disabled) return;
    setBusy(true);
    const t = toast.loading("Preparing PDF…");
    try {
      const res = await generate({ data: { symbol, horizon, include_news: includeNews } });
      window.open(res.url, "_blank", "noopener,noreferrer");
      toast.success(res.cache_hit ? "Loaded cached PDF" : "PDF ready", { id: t });
    } catch (err) {
      toast.error((err as Error).message || "Could not generate PDF", { id: t });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={busy || disabled} className="gap-1.5">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      <span className="text-xs">{busy ? "Generating…" : "Download PDF"}</span>
    </Button>
  );
}

