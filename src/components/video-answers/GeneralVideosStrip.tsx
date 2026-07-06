// Stage 4G APPLY-3 — small free-videos strip shown on the stock page
// (VideosBlogsTab) and the library symbol page. Renders published general
// RA videos tagged to the current stock. Never touches wallet/entitlement.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayCircle } from "lucide-react";
import { listGeneralVideosForSymbol } from "@/lib/general-video-playback.functions";

function fmtDuration(sec: number | null | undefined): string | null {
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function GeneralVideosStrip({ symbol }: { symbol: string }) {
  const listFn = useServerFn(listGeneralVideosForSymbol);
  const { data, isLoading } = useQuery({
    queryKey: ["general-videos-for-symbol", symbol],
    queryFn: () => listFn({ data: { symbol } }),
    staleTime: 60_000,
  });
  if (isLoading || !data || data.length === 0) return null;
  return (
    <section aria-labelledby="general-videos-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3
          id="general-videos-heading"
          className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Free analyst videos on {symbol}
        </h3>
        <Badge variant="secondary" className="text-[10px]">Free · public</Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {data.map((v) => (
          <Link
            key={v.answer_id}
            to={"/general/$answerId" as never}
            params={{ answerId: v.answer_id } as never}
            className="block"
          >
            <Card className="overflow-hidden hover:border-primary transition-colors">
              <div className="aspect-video w-full bg-muted relative flex items-center justify-center">
                {v.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.thumbnail_url}
                    alt={v.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : v.source_kind === "external" && v.youtube_video_id ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://i.ytimg.com/vi/${v.youtube_video_id}/hqdefault.jpg`}
                    alt={v.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <PlayCircle className="h-10 w-10 text-muted-foreground" />
                )}
                {fmtDuration(v.video_duration_sec) && (
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white">
                    {fmtDuration(v.video_duration_sec)}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium line-clamp-2">{v.title}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default GeneralVideosStrip;
