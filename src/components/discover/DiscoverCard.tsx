import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { DiscoverTypeChip } from "./DiscoverTypeChip";
import { formatFreshness, itemHrefFor, type DiscoverFeedRow } from "@/lib/discover-ranking";
import { PlayCircle, FileText, ExternalLink } from "lucide-react";

function Icon({ t }: { t: string }) {
  if (t === "ra_video") return <PlayCircle className="h-10 w-10 text-muted-foreground" aria-hidden />;
  if (t === "curated")  return <ExternalLink className="h-8 w-8 text-muted-foreground" aria-hidden />;
  return <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />;
}

export function DiscoverCard({ row }: { row: DiscoverFeedRow }) {
  const href = itemHrefFor(row);
  const content = (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full">
      <div className="relative aspect-video bg-muted">
        {row.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.thumbnail_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Icon t={row.content_type} />
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <DiscoverTypeChip contentType={row.content_type} />
          {row.content_type !== "ai_report" ? (
            <span className="rounded-full bg-emerald-500/90 text-white text-[10px] px-2 py-0.5 font-medium">Free</span>
          ) : null}
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm font-medium line-clamp-2">{row.title ?? "Untitled"}</p>
        {row.description ? (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{row.description}</p>
        ) : null}
        <p className="text-[10px] text-muted-foreground font-mono mt-2 uppercase tracking-wide">
          {formatFreshness(row.published_at)}
        </p>
      </div>
    </Card>
  );
  if (!href) return <div>{content}</div>;
  return (
    <Link
      to={href.path as never}
      params={href.params as never}
      className="block h-full group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
    >
      {content}
    </Link>
  );
}
