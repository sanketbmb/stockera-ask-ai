// Stage 4F.2 APPLY-1 — stock page Videos & Blogs tab.
// Fetches the public 4F.1 list (`listVideoAnswersForSymbol`) on mount and
// renders locked cards. Blogs strip stays "coming soon".
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";
import { listVideoAnswersForSymbol } from "@/lib/video-answers.functions";
import { LockedVideoCard } from "@/components/video-answers/LockedVideoCard";
import type { LockedVideoCardItem } from "@/components/video-answers/LockedVideoCard";
import { VIDEO_COPY } from "@/components/video-answers/copy";
import { GeneralVideosStrip } from "@/components/video-answers/GeneralVideosStrip";
import { CuratedForSymbolStrip } from "@/components/curated/CuratedForSymbolStrip";
import type { StockOverview } from "./types";


interface Props {
  data: StockOverview;
}

export function VideosBlogsTab({ data }: Props) {
  const symbol = data.symbol;
  const listFn = useServerFn(listVideoAnswersForSymbol);

  const { data: rows, isLoading, isError } = useQuery({
    queryKey: ["video-answers", symbol],
    queryFn: () => listFn({ data: { symbol } }),
    staleTime: 60_000,
  });

  const items: LockedVideoCardItem[] = (rows ?? []).map((r) => ({
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


  return (
    <div className="space-y-6">
      <GeneralVideosStrip symbol={symbol} />

      <section aria-labelledby="videos-heading">
        <h2 id="videos-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Analyst videos
        </h2>

        {isLoading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-72 w-full rounded-xl" />
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Videos are temporarily unavailable. Try again shortly.
          </Card>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {VIDEO_COPY.emptyStockVideos(symbol)}
            </p>
            <Link
              to="/post-query"
              search={{ symbol, type: "video" } as never}
              className="mt-3 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              {VIDEO_COPY.emptyStockAskCta}
            </Link>
          </Card>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <LockedVideoCard key={it.answerId} item={it} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="blogs-heading">
        <h2 id="blogs-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Analyst blogs
        </h2>
        <Card className="p-6 text-center">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <FileText className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm">{VIDEO_COPY.blogsComingSoon}</span>
          </div>
        </Card>
      </section>
    </div>
  );
}

export default VideosBlogsTab;
