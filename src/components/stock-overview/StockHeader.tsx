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
}

function formatPrice(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v);
}

export function StockHeader({ data, loggedIn }: Props) {
  const price = data.price?.value ?? null;
  const change = data.price?.change ?? null;
  const changePct = data.price?.change_pct ?? null;
  const changeUp = (change ?? 0) >= 0;
  const priceLabel =
    data.price?.source?.includes("finedge") || data.price?.source?.includes("eod")
      ? "Last close"
      : data.price?.source
      ? "Live"
      : "—";

  return (
    <Card className="sticky top-16 z-30 mb-6 p-4 sm:p-5 bg-card/95 backdrop-blur border-border">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {data.logo_url ? (
            <img
              src={data.logo_url}
              alt={`${data.name} logo`}
              className="h-12 w-12 rounded-lg border border-border bg-white object-contain p-1"
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center font-display text-lg text-muted-foreground">
              {data.symbol.slice(0, 2)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl text-foreground truncate">
              {data.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{data.symbol}</span>
              <span>·</span>
              <span>{data.exchange}</span>
              {data.sector && <><span>·</span><span>{data.sector}</span></>}
              {data.cap_band && <Badge variant="secondary" className="ml-1">{data.cap_band}</Badge>}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="font-display text-2xl text-foreground">
            ₹{formatPrice(price)}
          </div>
          <div className={`text-sm ${changeUp ? "text-primary" : "text-destructive"}`}>
            {change != null ? `${changeUp ? "+" : ""}${formatPrice(change)}` : "—"}
            {changePct != null ? ` (${changeUp ? "+" : ""}${changePct.toFixed(2)}%)` : ""}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{priceLabel}</div>
        </div>
      </div>

      <div className="mt-3 -mx-1">
        <MiniPriceChart candles={data.candles_30d} height={50} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          asChild
          className="rounded-full bg-gradient-brand text-white shadow-glow-teal"
        >
          <Link
            to={loggedIn ? "/post-query" : "/signup"}
            search={loggedIn ? { symbol: data.symbol } as never : { next: `/stock/${data.symbol}` } as never}
          >
            {loggedIn ? "Generate AI Report" : "Sign up to analyze"}
          </Link>
        </Button>
        <Button
          variant="outline"
          className="rounded-full"
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
