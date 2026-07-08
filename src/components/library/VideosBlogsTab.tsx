// Library Videos & Blogs — discovery tab.
//
// No-symbol default view (Phase 3 default-feed):
//   (i)  "Latest analyst videos" — unified feed of published general +
//        stock_specific rows. Stock-specific rows are LOCKED STUBS
//        (no youtube_video_id / video_url / external_url in DOM).
//   (ii) "Curated blogs & media" — all published curated items across
//        all symbols.
//   (iii) Empty-state fallback when both are empty.
//
// Symbol-selected view (unchanged behavior from Phase 2):
//   Two sections — stock-specific analyst videos + curated blogs tagged
//   to the symbol.
//
// Anti-leak firewall preserved: locked cards receive NO video_url and
// NO youtube_video_id from the server. Wallet / entitlement / unlock
// contracts are NOT touched.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, PlayCircle } from "lucide-react";
import { LibraryStockSearchBar, type SelectedSymbol } from "@/components/library/LibraryStockSearchBar";
import { LibraryFilterChips, type LibraryFilters } from "@/components/library/LibraryFilterChips";
import { listVideoAnswersForSymbol } from "@/lib/video-answers.functions";
import { listCuratedItemsForSymbol } from "@/lib/discover.functions";
import { listPublishedCurated } from "@/lib/curated.functions";
import { listAllPublishedVideoAnswers, type UnifiedVideoRow } from "@/lib/library-videos.functions";
import { StockLogo } from "@/components/common/StockLogo";
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
        <DefaultFeed filters={filters} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DEFAULT (no-symbol) FEED — Phase 3.
// ---------------------------------------------------------------------------
function DefaultFeed({ filters }: { filters: LibraryFilters }) {
  const listAllVideos = useServerFn(listAllPublishedVideoAnswers);
  const listAllCurated = useServerFn(listPublishedCurated);

  const videosQ = useQuery({
    queryKey: ["library-videos-blogs", "default", "videos"],
    queryFn: () => listAllVideos({ data: { limit: 20, offset: 0 } }),
    staleTime: 60_000,
  });
  const curatedQ = useQuery({
    queryKey: ["library-videos-blogs", "default", "curated"],
    queryFn: () => listAllCurated({ data: { limit: 20 } }) as Promise<CuratedRow[]>,
    staleTime: 5 * 60 * 1000,
  });

  const videos = videosQ.data ?? [];
  const curated = curatedQ.data ?? [];

  const showVideos = filters.type !== "blogs";
  const showBlogs = filters.type !== "videos";
  const filteredVideos = videos.filter((v) => {
    if (filters.price === "free") return (v.unlock_price_credits ?? 0) === 0;
    if (filters.price === "paid") return (v.unlock_price_credits ?? 0) > 0;
    return true;
  });
  // Curated items are Free today.
  const showBlogsFinal = showBlogs && filters.price !== "paid";

  const loading = videosQ.isLoading || curatedQ.isLoading;
  const empty =
    !loading &&
    (!showVideos || filteredVideos.length === 0) &&
    (!showBlogsFinal || curated.length === 0);

  return (
    <div className="space-y-8">
      {showVideos ? (
        <section aria-labelledby="lvb-default-videos-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2
              id="lvb-default-videos-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Latest analyst videos
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
              No analyst videos yet.
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredVideos.map((v) => (
                <UnifiedVideoTile key={v.answer_id} row={v} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showBlogsFinal ? (
        <section aria-labelledby="lvb-default-blogs-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2
              id="lvb-default-blogs-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Curated blogs &amp; media
            </h2>
            <span className="text-xs text-muted-foreground">{curated.length}</span>
          </div>
          {curatedQ.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : curated.length === 0 ? (
            <Card className="p-4 text-center text-xs text-muted-foreground">
              No curated blogs or media yet.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {curated.map((c) => (
                <CuratedTile key={c.id} c={c} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {empty ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing to show for the current filters. Try widening filters or searching a stock.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

// Renders either a LockedVideoCard (paid stock_specific) or a free
// general video tile. Free tiles link out to /general/$answerId.
function UnifiedVideoTile({ row }: { row: UnifiedVideoRow }) {
  if (row.is_locked) {
    const item: LockedVideoCardItem = {
      answerId: row.answer_id,
      title:
        row.video_title?.trim() ||
        `Analyst video on ${row.symbol ?? ""}${row.verdict ? ` — ${row.verdict}` : ""}`.trim(),
      verdict: row.verdict,
      symbol: row.symbol,
      analystName: row.analyst_name,
      analystSebiRegNumber: row.analyst_sebi_reg_number,
      unlockPriceCredits: row.unlock_price_credits,
      videoDurationSec: row.video_duration_sec,
      posterThumb: row.poster_thumb,
      publishedAt: row.published_at,
      questionAddressed: row.question_addressed,
      videoDescription: row.video_description,
    };
    return <LockedVideoCard item={item} />;
  }
  // Free general video — no youtube_video_id in DOM either; poster only.
  return (
    <Link
      to={"/general/$answerId" as never}
      params={{ answerId: row.answer_id } as never}
      className="group block"
    >
      <Card className="overflow-hidden hover:shadow-lg transition-shadow">
        <div className="relative aspect-video bg-muted">
          {row.poster_thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.poster_thumb}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <PlayCircle className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
          <span className="absolute top-2 left-2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] px-1.5 py-0.5 font-semibold uppercase tracking-wide">
            Free
          </span>
        </div>
        <div className="p-3">
          {row.symbol && (
            <div className="flex items-center gap-2 mb-1.5">
              <StockLogo symbol={row.symbol} size={28} />
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-primary">
                {row.symbol}
              </span>
            </div>
          )}
          <p className="text-sm font-medium line-clamp-2 group-hover:text-primary">
            {row.video_title?.trim() || "Analyst video"}
          </p>
          {row.video_description ? (
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
              {row.video_description}
            </p>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

function CuratedTile({ c }: { c: CuratedRow }) {
  return (
    <Link
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
  );
}

// ---------------------------------------------------------------------------
// SYMBOL-SELECTED RESULTS — unchanged from Phase 2.
// ---------------------------------------------------------------------------
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

  const showVideos = filters.type !== "blogs";
  const showBlogs = filters.type !== "videos";
  const filteredVideos = videoItems.filter((v) => {
    if (filters.price === "free") return (v.unlockPriceCredits ?? 0) === 0;
    if (filters.price === "paid") return (v.unlockPriceCredits ?? 0) > 0;
    return true;
  });
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
              Curated blogs &amp; media on {symbol}
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
                <CuratedTile key={c.id} c={c} />
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
