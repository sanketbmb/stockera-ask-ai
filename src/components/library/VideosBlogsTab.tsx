// Library Videos & Blogs Phase 1 — new discovery tab (NOT wired into
// src/routes/library.index.tsx yet; that is the Phase 2 cutover).
//
// Behavior:
//   - No symbol selected → composes existing <GeneralTab /> as-is. Zero
//     invariant change: free-only default view, same query keys, same rows.
//   - Symbol selected → two grouped sections:
//       1. Stock-specific analyst videos (paid, lockable) via existing
//          `listVideoAnswersForSymbol` and existing <LockedVideoCard />.
//       2. Curated blogs / media tagged to the symbol via existing
//          `listCuratedItemsForSymbol`.
//
// Explicit non-goals for Phase 1/2:
//   - General videos tagged to a stock are NOT shown here — that requires
//     a schema change (Phase 3, deferred).
//   - No wallet / entitlement / unlock RPC / analytics contract edits.
//   - No change to /stock/$symbol VideosBlogsTab.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { GeneralTab } from "@/components/library/GeneralTab";
import { LibraryStockSearchBar, type SelectedSymbol } from "@/components/library/LibraryStockSearchBar";
import { LibraryFilterChips, type LibraryFilters } from "@/components/library/LibraryFilterChips";
import { listVideoAnswersForSymbol } from "@/lib/video-answers.functions";
import { listCuratedItemsForSymbol } from "@/lib/discover.functions";
import { LockedVideoCard, type LockedVideoCardItem } from "@/components/video-answers/LockedVideoCard";

type CuratedRow = {
  id: string;
  title: string;
  description: string | null;
  custom_thumbnail_url: string | null;
  source_url: string;
  source_provider: string;
  category: string | null;
  published_at: string | null;
};

export function VideosBlogsTab() {
  const [selected, setSelected] = useState<SelectedSymbol | null>(null);
  const [filters, setFilters] = useState<LibraryFilters>({ type: "all", price: "all" });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 max-w-xl">
          <LibraryStockSearchBar selected={selected} onSelect={setSelected} />
        </div>
        <LibraryFilterChips value={filters} onChange={setFilters} />
      </div>

      {selected ? (
        <SymbolResults selected={selected} filters={filters} />
      ) : (
        <GeneralTab />
      )}
    </div>
  );
}

function SymbolResults({ selected, filters }: { selected: SelectedSymbol; filters: LibraryFilters }) {
  const symbol = selected.symbol;
  const listVideos = useServerFn(listVideoAnswersForSymbol);
  const listCurated = useServerFn(listCuratedItemsForSymbol);

  const videosQ = useQuery({
    queryKey: ["library-videos-blogs", "videos", symbol],
    queryFn: () => listVideos({ data: { symbol } }),
    staleTime: 60_000,
  });
  const curatedQ = useQuery({
    queryKey: ["library-videos-blogs", "curated", symbol],
    queryFn: () => listCurated({ data: { symbol, limit: 24 } }) as Promise<CuratedRow[]>,
    staleTime: 5 * 60 * 1000,
  });

  const videoItems: LockedVideoCardItem[] = useMemo(() => {
    const rows = videosQ.data ?? [];
    return rows.map((r) => ({
      answerId: r.answer_id,
      title:
        r.video_title?.trim() ||
        `Analyst video on ${r.symbol ?? symbol}${r.verdict ? ` — ${r.verdict}` : ""}`,
      verdict: r.verdict,
      symbol: r.symbol,
      analystName: r.analyst_name,
      analystSebiRegNumber: r.analyst_sebi_reg_number,
      unlockPriceCredits: r.unlock_price_credits,
      videoDurationSec: r.video_duration_sec,
      posterThumb: r.poster_thumb,
      publishedAt: r.published_at,
      questionAddressed: r.question_addressed,
      videoDescription: r.video_description,
    }));
  }, [videosQ.data, symbol]);

  const curatedRows = curatedQ.data ?? [];

  // Filter chips (client-side).
  const showVideos = filters.type !== "blogs";
  const showBlogs = filters.type !== "videos";
  const filteredVideos = videoItems.filter((v) => {
    if (filters.price === "free") return (v.unlockPriceCredits ?? 0) === 0;
    if (filters.price === "paid") return (v.unlockPriceCredits ?? 0) > 0;
    return true;
  });
  // Curated items are always Free today. Hide the section when Paid is selected.
  const showBlogsFinal = showBlogs && filters.price !== "paid";

  const loading = videosQ.isLoading || curatedQ.isLoading;
  const empty =
    !loading &&
    (!showVideos || filteredVideos.length === 0) &&
    (!showBlogsFinal || curatedRows.length === 0);

  return (
    <div className="space-y-8">
      {showVideos ? (
        <section aria-labelledby="lvb-videos-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="lvb-videos-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Analyst videos on {symbol}
            </h2>
            <span className="text-xs text-muted-foreground">{filteredVideos.length}</span>
          </div>
          {videosQ.isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-72 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredVideos.length === 0 ? (
            <Card className="p-4 text-center text-xs text-muted-foreground">
              No analyst videos match these filters for {symbol}.
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredVideos.map((it) => (
                <LockedVideoCard key={it.answerId} item={it} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showBlogsFinal ? (
        <section aria-labelledby="lvb-blogs-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="lvb-blogs-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Curated blogs & media on {symbol}
            </h2>
            <span className="text-xs text-muted-foreground">{curatedRows.length}</span>
          </div>
          {curatedQ.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : curatedRows.length === 0 ? (
            <Card className="p-4 text-center text-xs text-muted-foreground">
              No curated blogs or media tagged to {symbol} yet.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {curatedRows.map((c) => (
                <Link
                  key={c.id}
                  to={"/curated/$itemId" as never}
                  params={{ itemId: c.id } as never}
                  className="group block"
                >
                  <Card className="p-3 flex gap-3 hover:shadow-lg transition-shadow">
                    {c.custom_thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.custom_thumbnail_url}
                        alt=""
                        loading="lazy"
                        className="w-28 h-20 object-cover rounded shrink-0"
                      />
                    ) : (
                      <div className="w-28 h-20 bg-muted rounded shrink-0 flex items-center justify-center">
                        <ExternalLink className="h-5 w-5 text-muted-foreground" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">{c.source_provider}</Badge>
                        <span className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] px-1.5 py-0.5 font-semibold uppercase tracking-wide">
                          Free
                        </span>
                      </div>
                      <p className="text-sm font-medium mt-1 line-clamp-2 group-hover:text-primary">{c.title}</p>
                      {c.description ? (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{c.description}</p>
                      ) : null}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {empty ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing matches the current filters for {symbol}. Try widening filters or picking another stock.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default VideosBlogsTab;
