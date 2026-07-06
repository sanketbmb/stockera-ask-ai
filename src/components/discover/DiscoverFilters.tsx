import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type DiscoverTab = "all" | "videos" | "ra_answers" | "news" | "reports";

export const TAB_TO_FILTER: Record<DiscoverTab, string[] | null> = {
  all: null,
  videos: ["ra_video"],
  ra_answers: ["ra_video"],
  news: ["curated"],
  reports: ["ai_report"],
};

export function DiscoverFilters({
  tab,
  onTabChange,
  symbol,
  onSymbolChange,
}: {
  tab: DiscoverTab;
  onTabChange: (t: DiscoverTab) => void;
  symbol: string;
  onSymbolChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as DiscoverTab)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="videos">Videos</TabsTrigger>
          <TabsTrigger value="ra_answers">RA Answers</TabsTrigger>
          <TabsTrigger value="news">News</TabsTrigger>
          <TabsTrigger value="reports">AI Reports</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs uppercase tracking-wide text-muted-foreground">Filter by symbol</label>
        <Input
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value.toUpperCase())}
          placeholder="e.g. RELIANCE"
          className="h-9 max-w-[12rem]"
        />
        {symbol ? (
          <button
            type="button"
            onClick={() => onSymbolChange("")}
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
