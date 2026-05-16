import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Navbar } from "@/components/layout/Navbar";
import { Logo } from "@/components/common/Logo";
import { Progress } from "@/components/ui/progress";
import { AIReportCard, type AIReport, type ReportMeta } from "@/components/report/AIReportCard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const LOADING_STEPS = [
  "Connecting to market data…",
  "Analyzing fundamentals…",
  "Running technical scan…",
  "Generating report…",
];

const FUN_FACTS = [
  "73% of retail investors hold losing stocks too long due to loss aversion.",
  "Indian retail equity participation has doubled since 2020 to over 14 crore demat accounts.",
  "Discipline beats timing — SIPs have outperformed lump-sum 68% of the time over 10y periods.",
];

function LoadingScreen() {
  const [progress, setProgress] = useState(8);
  const [stepIdx, setStepIdx] = useState(0);
  const [fact] = useState(() => FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)]);

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => Math.min(p + 3, 92));
      setStepIdx((i) => (i + 1) % LOADING_STEPS.length);
    }, 900);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-mesh flex flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="animate-pulse"><Logo size="lg" linkTo={null} /></div>
      <div className="w-full max-w-sm">
        <Progress value={progress} className="h-2" />
        <p className="mt-3 text-sm text-muted-foreground font-mono">{LOADING_STEPS[stepIdx]}</p>
      </div>
      <p className="text-xs text-muted-foreground max-w-md italic">💡 {fact}</p>
    </div>
  );
}

function ReportContent() {
  const { queryId } = useParams({ from: "/report/$queryId" });
  const { data, isLoading, error } = useQuery({
    queryKey: ["query-report", queryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("queries")
        .select("id, stock_name, stock_symbol, buy_price, current_price, ai_report, created_at, status")
        .eq("id", queryId)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => (q.state.data?.ai_report ? false : 1500),
  });

  if (isLoading || !data || !data.ai_report) return <LoadingScreen />;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <p className="font-display text-2xl">Couldn't load this report</p>
          <p className="text-muted-foreground mt-2 text-sm">{(error as Error).message}</p>
          <Button asChild className="mt-4"><Link to="/post-query">Post a new query</Link></Button>
        </div>
      </div>
    );
  }

  const meta: ReportMeta = {
    id: data.id as string,
    createdAt: data.created_at as string,
    stockName: data.stock_name as string,
    stockSymbol: (data.stock_symbol as string | null) ?? null,
    buyPrice: data.buy_price as number | null,
    currentPrice: data.current_price as number | null,
  };

  return (
    <div className="min-h-screen bg-mesh">
      <Navbar />
      <main className="px-4 sm:px-6 lg:px-8 py-8 print:py-0">
        <AIReportCard report={data.ai_report as unknown as AIReport} meta={meta} />
      </main>
    </div>
  );
}

export const Route = createFileRoute("/report/$queryId")({
  head: () => ({ meta: [{ title: "AI Report — Stockera" }] }),
  component: () => <RequireAuth><ReportContent /></RequireAuth>,
});
