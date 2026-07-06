import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { STALE_VERDICT_DAYS } from "@/lib/firm-details";
import { LockedVideoCard, type LockedVideoCardItem } from "@/components/video-answers/LockedVideoCard";
import type { SymbolLibraryItem } from "@/types/library-symbol";

interface Props {
  item: SymbolLibraryItem;
  /** Optional enrichment for kind==='video' rows keyed by answer_id (== source_id). */
  videoEnrichment?: LockedVideoCardItem;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function isStale(iso: string | null): boolean {
  if (!iso) return false;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days > STALE_VERDICT_DAYS;
}

export function LibraryItemCard({ item, videoEnrichment }: Props) {
  const navigate = useNavigate();

  // Stage 4F.2 APPLY-1 — dispatch on 4F.1 video rows.
  // `source_id` for kind==='video' is the answer_id (see plan §F.0.1).
  if (item.kind === "video") {
    const enriched: LockedVideoCardItem = videoEnrichment ?? {
      answerId: item.source_id,
      title: item.title,
      verdict: item.verdict,
      symbol: item.symbol,
      analystName: item.analyst_name,
      analystSebiRegNumber: item.analyst_sebi_reg_number,
      unlockPriceCredits: null,
      videoDurationSec: null,
      posterThumb: null,
      publishedAt: item.published_at,
    };
    return <LockedVideoCard item={enriched} />;
  }

  const canNavigate = !!item.related_query_id;

  const onActivate = () => {
    if (!canNavigate) return;
    supabase.functions.invoke("library-views", { body: { item_id: item.id } }).catch(() => {});
    navigate({ to: "/report/$queryId", params: { queryId: item.related_query_id! } });
  };

  const attribution =
    item.analyst_name && item.analyst_sebi_reg_number
      ? `By ${item.analyst_name} · SEBI RA ${item.analyst_sebi_reg_number}`
      : "By Stockera Research";

  const showStale = item.kind !== "community_query" && isStale(item.published_at);

  const ctaLabel =
    item.kind === "report" ? "View report →" : "View question →";

  const icon = item.kind === "community_query" ? "💬" : null;

  return (
    <Card className="flex h-full flex-col transition-transform duration-300 motion-safe:hover:-translate-y-1">
      <CardHeader className="space-y-2">
        {item.kind === "report" && item.verdict && (
          <Badge variant="outline" className="w-fit font-mono uppercase">
            {item.verdict}
          </Badge>
        )}
        <div className="flex items-start gap-2">
          {icon && <span aria-hidden="true" className="text-lg leading-none">{icon}</span>}
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            {item.title}
          </h3>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 text-sm">
        {item.kind !== "community_query" && (
          <p className="text-xs text-muted-foreground">{attribution}</p>
        )}
        {showStale && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Issued more than {STALE_VERDICT_DAYS} days ago. Conditions may have changed.
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{timeAgo(item.published_at)}</span>
          {item.kind !== "community_query" && (
            <span>{item.view_count} views</span>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          variant="secondary"
          className="w-full"
          onClick={onActivate}
          disabled={!canNavigate}
        >
          {ctaLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default LibraryItemCard;
