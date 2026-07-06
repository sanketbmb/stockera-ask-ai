// Stage 4F.2 APPLY-2 — top-level playback route for a single video answer.
// Founder decision #2: top-level `/v/$answerId`, gated by existing RequireAuth
// (no `_authenticated/` layout).
//
// Truth source: getVideoAnswer (4F.1). No other read path is consulted.
//   • payload.locked === true  → LockedVideoCard + UnlockVideoModal (opens auto)
//   • payload.locked === false → VideoAnswerEmbed with youtube_video_id
import { useState } from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useVideoAnswer } from "@/hooks/useVideoAnswer";
import { LockedVideoCard, type LockedVideoCardItem } from "@/components/video-answers/LockedVideoCard";
import { UnlockVideoModal } from "@/components/video-answers/UnlockVideoModal";
import { VideoAnswerEmbed } from "@/components/video-answers/VideoAnswerEmbed";

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
          <VideoAnswerEmbed
            youtubeVideoId={data.youtube_video_id}
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
            title={data.stock_name ?? data.symbol ?? "Analyst video"}
            unlockPriceCredits={data.unlock_price_credits}
            analystName={data.analyst?.display_name ?? null}
          />
        </div>
      )}
    </AppShell>
  );
}

function toLockedItem(
  answerId: string,
  d: Extract<ReturnType<typeof useVideoAnswer>["data"], { status: "ok"; locked: true }>,
): LockedVideoCardItem {
  return {
    answerId,
    title: d.stock_name ?? d.symbol ?? "Analyst video",
    verdict: d.verdict,
    symbol: d.symbol,
    analystName: d.analyst?.display_name ?? null,
    analystSebiRegNumber: d.analyst?.sebi_reg_number ?? null,
    unlockPriceCredits: d.unlock_price_credits,
    videoDurationSec: d.video_duration_sec,
    posterThumb: d.poster_thumb,
    publishedAt: d.published_at,
  };
}
