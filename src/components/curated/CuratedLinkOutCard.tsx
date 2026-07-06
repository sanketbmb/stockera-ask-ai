import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export function CuratedLinkOutCard({
  title,
  description,
  thumbnailUrl,
  sourceUrl,
  provider,
  onClickThrough,
}: {
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string;
  provider: string;
  onClickThrough: () => void;
}) {
  const label =
    provider === "youtube" || provider === "twitter" ? "Watch on source" : "Read full on source";
  return (
    <Card className="p-4 flex flex-col md:flex-row gap-4">
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt=""
          className="w-full md:w-72 h-40 object-cover rounded border border-border"
          loading="lazy"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{provider}</p>
        <h2 className="font-display text-xl mt-1">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{description}</p> : null}
        <Button asChild className="mt-4" onClick={onClickThrough}>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-2">
            {label} <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </Card>
  );
}
