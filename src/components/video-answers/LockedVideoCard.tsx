// Stage 4F.2 APPLY-2 — reusable locked video card.
//
// CTA matrix:
//   anon        → primary "Sign in to unlock — N credits" → /login?redirect=/v/{answerId}
//   logged-in   → primary "Unlock — N credits" → opens UnlockVideoModal
//                 (or calls `onUnlockClick` when the parent owns the modal)
//
// Anti-leak: never renders an iframe or a raw youtube_video_id.
// `poster_thumb` on i.ytimg.com is the accepted 4F.1 public artifact.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { VideoPosterThumb } from "./VideoPosterThumb";
import { InlinePriceChip } from "./InlinePriceChip";
import { UnlockVideoModal } from "./UnlockVideoModal";
import { VIDEO_COPY } from "./copy";

export interface LockedVideoCardItem {
  answerId: string;
  title: string;
  verdict: string | null;
  symbol: string | null;
  analystName: string | null;
  analystSebiRegNumber: string | null;
  /** null when the surface has no price info (library / MasterSearch). */
  unlockPriceCredits: number | null;
  videoDurationSec: number | null;
  posterThumb: string | null;
  publishedAt: string | null;
}

interface Props {
  item: LockedVideoCardItem;
  /** compact = MasterSearch dropdown row; default = grid card */
  variant?: "card" | "compact";
  /** When set, replaces the internal modal open — parent owns it (watch route). */
  onUnlockClick?: () => void;
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

export function LockedVideoCard({ item, variant = "card", onUnlockClick }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isLoggedIn = !!user;
  const [modalOpen, setModalOpen] = useState(false);

  const attribution =
    item.analystName && item.analystSebiRegNumber
      ? `By ${item.analystName} · SEBI RA ${item.analystSebiRegNumber}`
      : item.analystName
        ? `By ${item.analystName}`
        : "By Stockera Research";

  const onAnonClick = () => {
    navigate({
      to: "/login",
      search: { redirect: `/v/${item.answerId}` } as never,
    });
  };

  const onLoggedInClick = () => {
    if (onUnlockClick) return onUnlockClick();
    setModalOpen(true);
  };

  const priceKnown = item.unlockPriceCredits != null;
  const loggedInCta = priceKnown
    ? `Unlock — ${item.unlockPriceCredits} credits`
    : "Unlock video";
  const anonCta = VIDEO_COPY.anonCta(item.unlockPriceCredits);
  const hint = isLoggedIn
    ? "Credits debited once — permanent access."
    : VIDEO_COPY.anonHint;

  if (variant === "compact") {
    return (
      <div className="flex items-start gap-3">
        <div className="w-24 shrink-0">
          <VideoPosterThumb
            src={item.posterThumb}
            alt={item.title}
            durationSec={item.videoDurationSec}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span aria-hidden="true">🔒</span>
            <span className="truncate text-sm font-medium">{item.title}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <InlinePriceChip credits={item.unlockPriceCredits} />
            {item.analystName && <span className="truncate">{item.analystName}</span>}
            {item.symbol && <span className="font-mono">{item.symbol}</span>}
          </div>
          <p className="mt-1 text-[11px] italic text-muted-foreground">
            {isLoggedIn ? "Click to unlock" : "Sign in to unlock"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Card
        className="flex h-full flex-col transition-transform duration-300 motion-safe:hover:-translate-y-1"
        data-testid="locked-video-card"
      >
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            {item.verdict ? (
              <Badge variant="outline" className="w-fit font-mono uppercase">
                {item.verdict}
              </Badge>
            ) : (
              <span />
            )}
            <InlinePriceChip credits={item.unlockPriceCredits} />
          </div>
          <VideoPosterThumb
            src={item.posterThumb}
            alt={item.title}
            durationSec={item.videoDurationSec}
          />
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            {item.title}
          </h3>
        </CardHeader>
        <CardContent className="flex-1 space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">{attribution}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{timeAgo(item.publishedAt)}</span>
            {item.symbol && <span className="font-mono">{item.symbol}</span>}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2">
          {isLoggedIn ? (
            <Button
              className="w-full"
              onClick={onLoggedInClick}
              disabled={!priceKnown}
              data-testid="locked-video-cta-unlock"
            >
              {loggedInCta}
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="w-full"
              onClick={onAnonClick}
              data-testid="locked-video-cta-anon"
            >
              {anonCta}
            </Button>
          )}
          <p className="text-center text-[11px] text-muted-foreground">{hint}</p>
        </CardFooter>
      </Card>

      {isLoggedIn && !onUnlockClick && priceKnown && (
        <UnlockVideoModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          answerId={item.answerId}
          title={item.title}
          unlockPriceCredits={item.unlockPriceCredits!}
          analystName={item.analystName}
        />
      )}
    </>
  );
}

export default LockedVideoCard;
