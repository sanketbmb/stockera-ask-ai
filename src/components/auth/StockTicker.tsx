import { TrendingUp, TrendingDown } from "lucide-react";

const TICKERS = [
  { symbol: "NIFTY 50", change: "+0.82%", up: true },
  { symbol: "SENSEX", change: "+247 pts", up: true },
  { symbol: "RELIANCE", change: "+1.2%", up: true },
  { symbol: "TCS", change: "-0.4%", up: false },
  { symbol: "HDFC BANK", change: "+0.6%", up: true },
  { symbol: "INFY", change: "+0.9%", up: true },
];

export function StockTicker() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 py-3 backdrop-blur-sm">
      <div className="flex animate-[ticker_30s_linear_infinite] gap-8 whitespace-nowrap">
        {[...TICKERS, ...TICKERS].map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="font-mono font-semibold text-white">{t.symbol}</span>
            <span
              className={`font-mono text-xs flex items-center gap-1 ${
                t.up ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {t.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {t.change}
            </span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
