// Stage 4G APPLY-3 — Public playback route for published `category='general'`
// RA video answers. NO auth, NO wallet, NO entitlement. Serves:
//   • external YouTube  → iframe embed
//   • external non-YT   → generic link card
//   • upload / record   → <video> element with a short-lived signed URL
//                         minted via issuePublicGeneralSignedUrl (Option B).
import { useEffect, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, ArrowLeft, Loader2, ShieldCheck, ExternalLink } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getPublicGeneralVideoAnswer,
  issuePublicGeneralSignedUrl,
} from "@/lib/general-video-playback.functions";

const ORIGIN = "https://asktheexpert.lovable.app";

export const Route = createFileRoute("/general/$answerId")({
  head: ({ params }) => ({
    meta: [
      { title: "Free analyst video — Stockera" },
      { name: "description", content: "Free general research analyst video on Stockera." },
      { property: "og:title", content: "Free analyst video — Stockera" },
      { property: "og:type", content: "video.other" },
      { property: "og:url", content: `${ORIGIN}/general/${params.answerId}` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${ORIGIN}/general/${params.answerId}` }],
  }),
  component: GeneralVideoPage,
});

function GeneralVideoPage() {
  const { answerId } = useParams({ from: "/general/$answerId" });
  const getFn = useServerFn(getPublicGeneralVideoAnswer);
  const { data, isLoading, error } = useQuery({
    queryKey: ["general-video", answerId],
    queryFn: () => getFn({ data: { answerId } }),
    staleTime: 60_000,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <div className="mb-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Link>
            </Button>
          </div>

          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          )}

          {!isLoading && (error || (data && data.status !== "ok")) && (
            <Card className="mx-auto max-w-lg p-6 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Video not available</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This video may be unpublished or removed.
              </p>
              <Button asChild className="mt-4">
                <Link to="/">Back home</Link>
              </Button>
            </Card>
          )}

          {!isLoading && data && data.status === "ok" && (
            <div className="space-y-4">
              <PlayerFor data={data} answerId={answerId} />
              <div className="space-y-1">
                <h1 className="text-xl font-semibold">{data.title}</h1>
                {data.analyst && (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    By {data.analyst.display_name}
                    {data.analyst.sebi_reg_number &&
                      ` · SEBI RA ${data.analyst.sebi_reg_number}`}
                  </p>
                )}
                {data.description && (
                  <p className="pt-2 text-sm text-foreground/80 whitespace-pre-wrap">
                    {data.description}
                  </p>
                )}
                {data.question_addressed && (
                  <p className="pt-2 text-xs text-muted-foreground italic">
                    Q: {data.question_addressed}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

type Meta = Extract<
  Awaited<ReturnType<typeof getPublicGeneralVideoAnswer>>,
  { status: "ok" }
>;

function PlayerFor({ data, answerId }: { data: Meta; answerId: string }) {
  if (data.source_kind === "external") {
    if (data.external_provider === "youtube" && data.youtube_video_id) {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-xl border bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${data.youtube_video_id}`}
            title={data.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      );
    }
    if (data.external_url) {
      return (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">This video is hosted externally.</p>
          <Button asChild className="mt-3">
            <a href={data.external_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" /> Open video
            </a>
          </Button>
        </Card>
      );
    }
    return <Card className="p-6 text-center text-sm text-muted-foreground">No playable source.</Card>;
  }
  return <SignedGeneralPlayer answerId={answerId} thumb={data.thumbnail_url} />;
}

function SignedGeneralPlayer({ answerId, thumb }: { answerId: string; thumb: string | null }) {
  const signFn = useServerFn(issuePublicGeneralSignedUrl);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    signFn({ data: { answerId } })
      .then((res) => {
        if (alive) setUrl(res.url);
      })
      .catch((e: Error) => {
        if (alive) setErr(e.message);
      });
    return () => {
      alive = false;
    };
  }, [answerId, signFn]);
  if (err) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Playback failed. Try refreshing.
      </Card>
    );
  }
  if (!url) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl border bg-muted/40 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border bg-black">
      <video
        src={url}
        controls
        playsInline
        poster={thumb ?? undefined}
        className="h-full w-full"
      />
    </div>
  );
}
