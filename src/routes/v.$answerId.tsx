// Stage 4F.2 APPLY-2 + 4G APPLY-3 — top-level playback route.
//
// Truth source for locked/unlocked: getVideoAnswer (4F.1 RPC — signature LOCKED).
//   • payload.locked === true  → LockedVideoCard + UnlockVideoModal (auto-open)
//   • payload.locked === false → resolve actual source via getPaidVideoPlayback
//                                 which branches by source_kind:
//                                   external+youtube → embed
//                                   external+link   → open-in-new-tab card
//                                   upload | record → <video> with 90 s signed URL
import { useEffect, useState } from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, ArrowLeft, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useVideoAnswer } from "@/hooks/useVideoAnswer";
import { LockedVideoCard, type LockedVideoCardItem } from "@/components/video-answers/LockedVideoCard";
import { UnlockVideoModal } from "@/components/video-answers/UnlockVideoModal";
import { VideoAnswerEmbed } from "@/components/video-answers/VideoAnswerEmbed";
import { getPaidVideoPlayback } from "@/lib/paid-video-playback.functions";

export const Route = createFileRoute("/v/$answerId")({
  head: () => ({
    meta: [
      { title: "Analyst video — Stockera" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <WatchVideoPage />
    </RequireAuth>
  ),
});

function WatchVideoPage() {
  const { answerId } = useParams({ from: "/v/$answerId" });
  const { data, isLoading, error, refetch } = useVideoAnswer(answerId);
  const [unlockOpen, setUnlockOpen] = useState(false);

  return (
    <AppShell title="Analyst video">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/my-queries">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to My Queries
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="mx-auto max-w-3xl space-y-3">
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      )}

      {!isLoading && error && (
        <Card className="mx-auto max-w-lg p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-3 font-medium">Unable to load this video</p>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          <Button className="mt-4" onClick={() => refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {!isLoading && data && data.status !== "ok" && (
        <Card className="mx-auto max-w-lg p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">
            {data.status === "not_found" ? "Video not found" : "Sign-in required"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.status === "not_found"
              ? "This analyst video is no longer available."
              : "Your session expired. Please sign in again."}
          </p>
          <Button asChild className="mt-4">
            <Link to="/my-queries">Back to My Queries</Link>
          </Button>
        </Card>
      )}

      {!isLoading && data && data.status === "ok" && data.locked === false && (
        <div className="mx-auto max-w-3xl space-y-4">
          <UnlockedSourceResolver
            answerId={answerId}
            fallbackYouTubeId={data.youtube_video_id}
            title={data.stock_name ?? data.symbol ?? "Analyst video"}
          />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">
              {data.stock_name ?? data.symbol ?? "Analyst video"}
              {data.verdict && (
                <span className="ml-2 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-mono uppercase">
                  {data.verdict}
                </span>
              )}
            </h1>
            {data.analyst && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                By {data.analyst.display_name}
                {data.analyst.sebi_reg_number && ` · SEBI RA ${data.analyst.sebi_reg_number}`}
              </p>
            )}
          </div>
        </div>
      )}

      {!isLoading && data && data.status === "ok" && data.locked === true && (
        <div className="mx-auto max-w-md space-y-4">
          <LockedVideoCard
            item={toLockedItem(answerId, data)}
            onUnlockClick={() => setUnlockOpen(true)}
          />
          <UnlockVideoModal
            open={unlockOpen}
            onOpenChange={setUnlockOpen}
            answerId={answerId}
            title={
              data.video_title?.trim() ||
              data.stock_name ||
              data.symbol ||
              "Analyst video"
            }
            unlockPriceCredits={data.unlock_price_credits}
            analystName={data.analyst?.display_name ?? null}
          />
        </div>
      )}
    </AppShell>
  );
}

/**
 * After unlock, resolve the true source via getPaidVideoPlayback. If the
 * resolver fails (e.g. legacy MP4 rows without paid_video_storage_path but
 * with a youtube_video_id from the 4F.1 RPC), fall back to the YouTube embed.
 */
function UnlockedSourceResolver({
  answerId,
  fallbackYouTubeId,
  title,
}: {
  answerId: string;
  fallbackYouTubeId: string | null | undefined;
  title: string;
}) {
  const playbackFn = useServerFn(getPaidVideoPlayback);
  const { data, isLoading, error } = useQuery({
    queryKey: ["paid-playback", answerId],
    queryFn: () => playbackFn({ data: { answerId } }),
    staleTime: 60_000,
    retry: 0,
  });

  if (isLoading) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl border bg-muted/40 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    // Legacy compatibility: YouTube-only rows shipped before source_kind existed.
    if (fallbackYouTubeId) {
      return <VideoAnswerEmbed youtubeVideoId={fallbackYouTubeId} title={title} />;
    }
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Playback failed. Try refreshing.
      </Card>
    );
  }
  if (data.kind === "youtube") {
    return <VideoAnswerEmbed youtubeVideoId={data.videoId} title={title} />;
  }
  if (data.kind === "external") {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-muted-foreground">Analyst-hosted external video.</p>
        <Button asChild className="mt-3">
          <a href={data.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1 h-4 w-4" /> Open video
          </a>
        </Button>
      </Card>
    );
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border bg-black">
      <video src={data.url} controls playsInline className="h-full w-full" />
    </div>
  );
}

function toLockedItem(
  answerId: string,
  d: Extract<ReturnType<typeof useVideoAnswer>["data"], { status: "ok"; locked: true }>,
): LockedVideoCardItem {
  return {
    answerId,
    title:
      d.video_title?.trim() ||
      d.stock_name ||
      d.symbol ||
      "Analyst video",
    verdict: d.verdict,
    symbol: d.symbol,
    analystName: d.analyst?.display_name ?? null,
    analystSebiRegNumber: d.analyst?.sebi_reg_number ?? null,
    unlockPriceCredits: d.unlock_price_credits,
    videoDurationSec: d.video_duration_sec,
    posterThumb: d.poster_thumb,
    publishedAt: d.published_at,
    questionAddressed: d.question_addressed,
    videoDescription: d.video_description,
  };
}

