import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { MiniPriceChart } from "./MiniPriceChart";
import type { StockOverview } from "./types";

interface Props {
  data: StockOverview;
  loggedIn: boolean;
  hasPartial?: boolean;
}

function formatPrice(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v);
}

export function StockHeader({ data, loggedIn, hasPartial }: Props) {
  const candles = data.candles_30d ?? [];
  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const prevCandle = candles.length > 1 ? candles[candles.length - 2] : null;

  const livePrice = data.price?.value ?? null;
  const price = livePrice ?? lastCandle?.close ?? null;

  let change = data.price?.change ?? null;
  let changePct = data.price?.change_pct ?? null;
  if ((change == null || changePct == null) && lastCandle && prevCandle) {
    const d = lastCandle.close - prevCandle.close;
    if (change == null) change = d;
    if (changePct == null && prevCandle.close !== 0) changePct = (d / prevCandle.close) * 100;
  }
  const changeUp = (change ?? 0) >= 0;

  const priceLabel = livePrice != null
    ? (data.price?.source?.includes("finedge") || data.price?.source?.includes("eod")
        ? "Last close"
        : "Live")
    : lastCandle
    ? "Last close (EOD)"
    : "—";

  const showChange = change != null || changePct != null;

  return (
    <Card className="sticky top-16 z-30 mb-6 border-border bg-card/95 p-4 backdrop-blur sm:p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {data.logo_url ? (
            <img
              src={data.logo_url}
              alt={`${data.name} logo`}
              className="h-12 w-12 shrink-0 rounded-lg border border-border bg-white object-contain p-1"
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted font-display text-lg text-muted-foreground">
              {data.symbol.slice(0, 2)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl text-foreground sm:text-2xl">
              {data.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{data.symbol}</span>
              <span aria-hidden>·</span>
              <span>{data.exchange}</span>
              {data.sector && <><span aria-hidden>·</span><span className="truncate">{data.sector}</span></>}
              {data.cap_band && <Badge variant="secondary" className="ml-1 shrink-0">{data.cap_band}</Badge>}
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="font-display text-2xl tabular-nums text-foreground">
            ₹{formatPrice(price)}
          </div>
          {showChange && (
            <div className={`text-sm tabular-nums ${changeUp ? "text-primary" : "text-destructive"}`}>
              {change != null ? `${changeUp ? "+" : ""}${formatPrice(change)}` : ""}
              {changePct != null ? ` (${changeUp ? "+" : ""}${changePct.toFixed(2)}%)` : ""}
            </div>
          )}
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{priceLabel}</div>
        </div>
      </div>

      <div className="mt-3 -mx-1">
        <MiniPriceChart candles={data.candles_30d} height={50} />
      </div>

      {hasPartial && (
        <div className="mt-3">
          <Badge variant="secondary" className="text-xs">
            Data limited — some providers are unavailable right now.
          </Badge>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <Button
          asChild
          className="w-full rounded-full bg-gradient-brand text-white shadow-glow-teal sm:w-auto"
        >
          <Link
            to={loggedIn ? "/post-query" : "/signup"}
            search={loggedIn ? { symbol: data.symbol } as never : { next: `/stock/${data.symbol}` } as never}
          >
            {loggedIn ? "Start Personalized AI Report" : "Sign up to analyze"}
          </Link>
        </Button>
        <Button
          variant="outline"
          className="w-full rounded-full sm:w-auto"
          onClick={() =>
            toast.info("Watchlist coming in the next release.", {
              description: "You'll be able to save this stock and get updates.",
            })
          }
        >
          + Add to Watchlist
        </Button>
      </div>
    </Card>
  );
}

