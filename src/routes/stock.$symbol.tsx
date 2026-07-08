import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StockHeader } from "@/components/stock-overview/StockHeader";
import { OverviewTab } from "@/components/stock-overview/OverviewTab";
import { StatisticsTab } from "@/components/stock-overview/StatisticsTab";
import { NewsTab } from "@/components/stock-overview/NewsTab";
import { AiReportsTab } from "@/components/stock-overview/AiReportsTab";
import { VideosBlogsTab } from "@/components/stock-overview/VideosBlogsTab";
import { AnalyticsTab } from "@/components/stock-overview/AnalyticsTab";
import type { StockOverview } from "@/components/stock-overview/types";

const ORIGIN = "https://asktheexpert.in";

function fallback(symbol: string): StockOverview {
  return {
    success: false,
    symbol: symbol.toUpperCase(),
    exchange: "NSE",
    name: symbol.toUpperCase(),
    isin: null, sector: null, industry: null, market_cap_rs: null, cap_band: null,
    logo_url: null, price: null, candles_30d: null,
    profile: null, statistics: null, dividends: null, splits: null, earnings: null,
    news: null,
    ai_report_stats: { total_reports_on_stock: 0, latest_verdict_distribution: {}, most_recent_report_date: null },
    meta: { provider_failures: [], elapsed_ms: 0 },
  };
}

export const Route = createFileRoute("/stock/$symbol")({
  loader: async ({ params }): Promise<StockOverview> => {
    try {
      const { data, error } = await supabase.functions.invoke("stock-overview", {
        body: { symbol: params.symbol, exchange: "NSE" },
      });
      if (error || !data) return fallback(params.symbol);
      return data as StockOverview;
    } catch {
      return fallback(params.symbol);
    }
  },
  head: ({ loaderData, params }) => {
    const d = loaderData ?? fallback(params.symbol);
    const sym = d.symbol;
    const name = d.name && d.name !== sym ? d.name : sym;
    const title = `${name} (${sym}) Stock Price, Overview & AI Analysis | Stockera`;
    const rawDesc = (d.profile as { description?: string } | null)?.description;
    const description = (rawDesc && rawDesc.length > 30
      ? rawDesc.slice(0, 155).trim()
      : `${name} (${sym}) live price, key statistics, latest news and AI-verified analyst reports on Stockera.`
    ).replace(/\s+/g, " ");
    const url = `${ORIGIN}/stock/${sym}`;
    const meta = [
      { title },
      { name: "description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ] as Array<Record<string, string>>;
    if (d.logo_url) {
      meta.push({ property: "og:image", content: d.logo_url });
      meta.push({ name: "twitter:image", content: d.logo_url });
    }
    return {
      meta,
      links: [{ rel: "canonical", href: url }],
    };
  },
  pendingComponent: PendingStockPage,
  component: StockPage,
});

function PendingStockPage() {
  return (
    <div className="flex min-h-screen flex-col bg-mesh">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <Skeleton className="mb-6 h-48 w-full sm:h-40" />
        <Skeleton className="mb-4 h-10 w-full max-w-3xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function StockPage() {
  const data = Route.useLoaderData();
  const { user } = useAuth();
  const loggedIn = !!user;
  const hasPartial = data.meta.provider_failures.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-mesh">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <StockHeader data={data} loggedIn={loggedIn} hasPartial={hasPartial} />

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="sticky top-16 z-20 grid w-full max-w-3xl grid-cols-6 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="statistics">Statistics</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="news">News</TabsTrigger>
            <TabsTrigger value="ai_reports">AI Reports</TabsTrigger>
            <TabsTrigger value="videos_blogs">Videos & Blogs</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4 scroll-mt-32">
            <OverviewTab data={data} />
          </TabsContent>
          <TabsContent value="statistics" className="mt-4 scroll-mt-32">
            <StatisticsTab data={data} />
          </TabsContent>
          <TabsContent value="analytics" className="mt-4 scroll-mt-32">
            <AnalyticsTab data={data} loggedIn={loggedIn} />
          </TabsContent>
          <TabsContent value="news" className="mt-4 scroll-mt-32">
            <NewsTab data={data} />
          </TabsContent>
          <TabsContent value="ai_reports" className="mt-4 scroll-mt-32">
            <AiReportsTab data={data} loggedIn={loggedIn} />
          </TabsContent>
          <TabsContent value="videos_blogs" className="mt-4 scroll-mt-32">
            <VideosBlogsTab data={data} />
          </TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
}

