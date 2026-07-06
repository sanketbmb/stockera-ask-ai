// Stage 4F.2 APPLY-2 — Unlocked video card for the My Queries tab.
// Never plays inline; primary action navigates to /v/{answerId} where
// getVideoAnswer is the truth source for playback.
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, ShieldCheck } from "lucide-react";
import type { MyUnlockedVideo } from "@/lib/my-video-entitlements.functions";

function formatDuration(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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

interface Props {
  item: MyUnlockedVideo;
}

export function UnlockedVideoCard({ item }: Props) {
  const title = item.stockName ?? item.symbol ?? "Analyst video";
  const dur = formatDuration(item.videoDurationSec);

  return (
    <Card className="flex h-full flex-col" data-testid="unlocked-video-card">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          {item.verdict ? (
            <Badge variant="outline" className="w-fit font-mono uppercase">
              {item.verdict}
            </Badge>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
            <ShieldCheck className="h-3 w-3" /> Unlocked
          </span>
        </div>
        <Link
          to="/v/$answerId"
          params={{ answerId: item.answerId }}
          className="relative block aspect-video w-full overflow-hidden rounded-md bg-muted"
          aria-label={`Watch analyst video for ${title}`}
        >
          {item.posterThumb ? (
            <img
              src={item.posterThumb}
              alt={title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <span className="text-3xl">🎥</span>
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/15">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 shadow">
              <Play className="ml-0.5 h-5 w-5 text-black" />
            </div>
          </div>
          {dur && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {dur}
            </span>
          )}
        </Link>
        <h3 className="line-clamp-2 text-base font-semibold leading-snug">{title}</h3>
      </CardHeader>
      <CardContent className="flex-1 space-y-1 text-xs text-muted-foreground">
        {item.symbol && <p className="font-mono">{item.symbol}</p>}
        <p>Unlocked {timeAgo(item.unlockedAt)} · {item.creditsUsed} credits</p>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link to="/v/$answerId" params={{ answerId: item.answerId }}>
            <Play className="mr-1.5 h-4 w-4" /> Watch video
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export default UnlockedVideoCard;
