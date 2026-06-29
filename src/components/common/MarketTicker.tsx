import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMarketSnapshot, type MarketSnapshot } from "@/lib/market.functions";
import { cn } from "@/lib/utils";

const FALLBACK: MarketSnapshot = {
  nifty50: { value: "24,247.50", change: "+198.45", changePct: "+0.82" },
  sensex: { value: "79,843.12", change: "+247.18", changePct: "+0.31" },
  topGainers: [{ symbol: "TATAMOTORS", changePct: "+3.2" }],
  topLosers: [{ symbol: "HDFCBANK", changePct: "-1.1" }],
  marketSentiment: "Neutral",
  oneLineSummary: "",
  fetchedAt: new Date().toISOString(),
};

function isUp(pct: string) {
  return !pct.trim().startsWith("-");
}

function PctChip({ pct, withArrow = true }: { pct: string; withArrow?: boolean }) {
  const up = isUp(pct);
  return (
    <span
      className={cn(
        "font-mono text-xs font-medium",
        up ? "text-emerald-400" : "text-rose-400",
      )}
    >
      {withArrow && (up ? "▲" : "▼")} {pct}%
    </span>
  );
}

export function MarketTicker() {
  const fetchSnapshot = useServerFn(getMarketSnapshot);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const { data } = useQuery({
    queryKey: ["market-snapshot"],
    queryFn: () => fetchSnapshot(),
    refetchInterval: 30 * 60 * 1000,
    staleTime: 25 * 60 * 1000,
    enabled: mounted,
  });

  const snap = data?.data ?? FALLBACK;
  const gainer = snap.topGainers?.[0];
  const loser = snap.topLosers?.[0];
  const sentimentDot =
    snap.marketSentiment === "Bullish"
      ? "🟢"
      : snap.marketSentiment === "Bearish"
        ? "🔴"
        : "🟡";

  const items = (
    <div className="flex shrink-0 items-center gap-8 px-6">
      <span className="flex items-center gap-2 text-white/90">
        <span className="font-mono text-[10px] uppercase tracking-wider text-white/50">
          NIFTY 50
        </span>
        <span className="font-mono text-sm font-semibold text-white">
          {snap.nifty50.value}
        </span>
        <PctChip pct={snap.nifty50.changePct} />
      </span>

      <span className="flex items-center gap-2 text-white/90">
        <span className="font-mono text-[10px] uppercase tracking-wider text-white/50">
          SENSEX
        </span>
        <span className="font-mono text-sm font-semibold text-white">
          {snap.sensex.value}
        </span>
        <PctChip pct={snap.sensex.changePct} />
      </span>

      {gainer && (
        <span className="flex items-center gap-2 text-white/90">
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/50">
            Top Gainer
          </span>
          <span className="font-mono text-sm font-semibold text-white">
            {gainer.symbol}
          </span>
          <PctChip pct={gainer.changePct} />
        </span>
      )}

      {loser && (
        <span className="flex items-center gap-2 text-white/90">
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/50">
            Top Loser
          </span>
          <span className="font-mono text-sm font-semibold text-white">
            {loser.symbol}
          </span>
          <PctChip pct={loser.changePct} />
        </span>
      )}

      <span className="flex items-center gap-1.5 text-white/90">
        <span className="font-mono text-[10px] uppercase tracking-wider text-white/50">
          Sentiment
        </span>
        <span className="text-sm font-medium text-white">
          {sentimentDot} {snap.marketSentiment}
        </span>
      </span>

      <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
        Data via Helix AI — 30 min delay
      </span>
    </div>
  );

  return (
    <div
      className="relative h-9 w-full overflow-hidden border-b border-white/5 bg-primary"
      aria-label="Live market ticker"
    >
      <div className="ticker-track flex h-full items-center whitespace-nowrap">
        {items}
        {items}
      </div>
      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .ticker-track {
          animation: ticker-scroll 60s linear infinite;
          min-width: 200%;
        }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>
    </div>
  );
}

export default MarketTicker;
