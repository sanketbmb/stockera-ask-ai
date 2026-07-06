// Stage 4F.2 APPLY-1 — reusable locked video card.
//
// APPLY-1 CTA matrix (per plan §D.1):
//   anon        → primary "Sign in to unlock — N credits" → /login?redirect=/v/{answerId}
//   logged-in   → DISABLED "Unlock coming soon" (aria-disabled, no click)
//
// No modal. No unlock mutation. No watch route. No auth redirect for
// logged-in users. `poster_thumb` on i.ytimg.com is accepted per plan §D.5.
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { VideoPosterThumb } from "./VideoPosterThumb";
import { InlinePriceChip } from "./InlinePriceChip";
import { VIDEO_COPY } from "./copy";

export interface LockedVideoCardItem {
  answerId: string;
  title: string;
  verdict: string | null;
  symbol: string | null;
  analystName: string | null;
  analystSebiRegNumber: string | null;
  unlockPriceCredits: number;
  videoDurationSec: number | null;
  posterThumb: string | null;
  publishedAt: string | null;
}

interface Props {
  item: LockedVideoCardItem;
  /** compact = MasterSearch dropdown row; default = grid card */
  variant?: "card" | "compact";
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

export function LockedVideoCard({ item, variant = "card" }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isLoggedIn = !!user;

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

  const ctaLabel = isLoggedIn
    ? VIDEO_COPY.loggedInDisabledCta
    : VIDEO_COPY.anonCta(item.unlockPriceCredits);
  const hint = isLoggedIn ? VIDEO_COPY.loggedInDisabledHint : VIDEO_COPY.anonHint;

  if (variant === "compact") {
    // Used inside MasterSearch dropdown rows. Non-interactive on APPLY-1 for
    // logged-in users; anon users can still click the outer row to sign in.
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
            {isLoggedIn ? VIDEO_COPY.loggedInDisabledHint : "Sign in to unlock"}
          </p>
        </div>
      </div>
    );
  }

  return (
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
            variant="secondary"
            className="w-full"
            disabled
            aria-disabled="true"
            title={VIDEO_COPY.loggedInDisabledHint}
            data-testid="locked-video-cta-disabled"
          >
            {ctaLabel}
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            onClick={onAnonClick}
            data-testid="locked-video-cta-anon"
          >
            {ctaLabel}
          </Button>
        )}
        <p className="text-center text-[11px] text-muted-foreground">{hint}</p>
      </CardFooter>
    </Card>
  );
}

export default LockedVideoCard;
