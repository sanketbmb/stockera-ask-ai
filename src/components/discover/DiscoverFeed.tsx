import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { listDiscoverFeed } from "@/lib/discover.functions";
import { DiscoverCard } from "./DiscoverCard";
import { diversify, type DiscoverFeedRow } from "@/lib/discover-ranking";
import { TAB_TO_FILTER, type DiscoverTab } from "./DiscoverFilters";

export function DiscoverFeed({
  tab,
  symbol,
}: {
  tab: DiscoverTab;
  symbol: string;
}) {
  const feedFn = useServerFn(listDiscoverFeed);
  const kindFilter = TAB_TO_FILTER[tab];
  const activeSymbol = symbol.trim().toUpperCase();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["discover", tab, activeSymbol],
    queryFn: () =>
      feedFn({
        data: {
          kind_filter: kindFilter ?? null,
          symbol: activeSymbol || null,
          limit: 48,
          offset: 0,
        },
      }) as Promise<DiscoverFeedRow[]>,
    staleTime: 60 * 1000,
  });

  const rows = useMemo(
    () => (tab === "all" ? diversify(data ?? [], 2) : (data ?? [])),
    [data, tab],
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-56 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Discover is temporarily unavailable. Try again shortly.
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center">
        <h3 className="font-display text-xl">Nothing to show yet</h3>
        <p className="text-sm text-muted-foreground mt-2">
          {activeSymbol
            ? `No matching items for ${activeSymbol}. Try a broader filter.`
            : "Free videos, curated media, and AI reports will appear here as they're published."}
        </p>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {rows.map((r) => <DiscoverCard key={r.item_id} row={r} />)}
    </div>
  );
}
