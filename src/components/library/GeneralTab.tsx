// Stage 4G APPLY-4 — Library "General" tab. Free content only.
// Shows published GENERAL RA videos + published curated items.
// NEVER surfaces stock_specific paid unlockables or wallet/entitlement UI.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, ExternalLink } from "lucide-react";
import { listPublicGeneralVideoAnswers } from "@/lib/discover.functions";
import { listPublishedCurated } from "@/lib/curated.functions";
import { formatDistanceToNow } from "date-fns";

type VideoRow = {
  answer_id: string;
  video_title: string | null;
  video_description: string | null;
  custom_thumbnail_url: string | null;
  external_provider: string | null;
  youtube_video_id: string | null;
  published_at: string | null;
  created_at: string;
};
type CuratedRow = {
  id: string;
  title: string;
  description: string | null;
  custom_thumbnail_url: string | null;
  source_url: string;
  source_provider: string;
  embed_kind: string;
  tags: string[] | null;
  sector: string | null;
  category: string;
  published_at: string | null;
};

function thumbFor(v: VideoRow): string | null {
  if (v.custom_thumbnail_url) return v.custom_thumbnail_url;
  if (v.external_provider === "youtube" && v.youtube_video_id) {
    return `https://i.ytimg.com/vi/${v.youtube_video_id}/hqdefault.jpg`;
  }
  return null;
}

export function GeneralTab() {
  const listVideos = useServerFn(listPublicGeneralVideoAnswers);
  const listCurated = useServerFn(listPublishedCurated);
  const videosQ = useQuery({
    queryKey: ["library", "general", "videos"],
    queryFn: () => listVideos({ data: { limit: 24, offset: 0 } }) as Promise<VideoRow[]>,
    staleTime: 5 * 60 * 1000,
  });
  const curatedQ = useQuery({
    queryKey: ["library", "general", "curated"],
    queryFn: () => listCurated({ data: { limit: 40 } }) as Promise<CuratedRow[]>,
    staleTime: 5 * 60 * 1000,
  });

  const loading = videosQ.isLoading || curatedQ.isLoading;
  const videos = videosQ.data ?? [];
  const curated = curatedQ.data ?? [];
  const isEmpty = !loading && videos.length === 0 && curated.length === 0;

  return (
    <div className="grid gap-8">
      <section aria-labelledby="general-videos-heading">
        <div className="flex items-baseline justify-between mb-3">
          <h2 id="general-videos-heading" className="font-display text-xl">General analyst videos</h2>
          <span className="text-xs text-muted-foreground">{videos.length}</span>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">No general videos published yet.</Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {videos.map((v) => {
              const t = thumbFor(v);
              return (
                <Link
                  key={v.answer_id}
                  to={"/general/$answerId" as never}
                  params={{ answerId: v.answer_id } as never}
                  className="group block"
                >
                  <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="relative aspect-video bg-muted">
                      {t ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t} alt="" loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <PlayCircle className="h-10 w-10 text-muted-foreground" />
                        </div>
                      )}
                      <Badge className="absolute top-2 left-2 text-[10px] bg-primary/90">Free</Badge>
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium line-clamp-2 group-hover:text-primary">{v.video_title ?? "Untitled"}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {v.published_at ? formatDistanceToNow(new Date(v.published_at), { addSuffix: true }) : ""}
                      </p>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="general-curated-heading">
        <div className="flex items-baseline justify-between mb-3">
          <h2 id="general-curated-heading" className="font-display text-xl">Curated media</h2>
          <span className="text-xs text-muted-foreground">{curated.length}</span>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : curated.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">No curated items yet.</Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {curated.map((c) => (
              <Link
                key={c.id}
                to={"/curated/$itemId" as never}
                params={{ itemId: c.id } as never}
                className="group block"
              >
                <Card className="p-3 flex gap-3 hover:shadow-lg transition-shadow">
                  {c.custom_thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.custom_thumbnail_url} alt="" loading="lazy" className="w-32 h-20 object-cover rounded shrink-0" />
                  ) : (
                    <div className="w-32 h-20 bg-muted rounded shrink-0 flex items-center justify-center">
                      <ExternalLink className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{c.source_provider}</Badge>
                      {c.sector ? <Badge variant="outline" className="text-[10px]">{c.sector}</Badge> : null}
                    </div>
                    <p className="text-sm font-medium mt-1 line-clamp-2 group-hover:text-primary">{c.title}</p>
                    {c.description ? <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{c.description}</p> : null}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {isEmpty ? (
        <Card className="p-10 text-center">
          <h3 className="font-display text-xl">Nothing here yet</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Free general videos and curated media will appear here as analysts publish them.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
