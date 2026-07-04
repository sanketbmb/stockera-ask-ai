import { Card } from "@/components/ui/card";
import { StatCard } from "./StatCard";
import type { StockOverview } from "./types";

interface Props { data: StockOverview }

function readNum(o: Record<string, unknown> | null, key: string): number | null {
  if (!o) return null;
  const v = o[key];
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function OverviewTab({ data }: Props) {
  const statsRoot = data.statistics as { statistics?: Record<string, unknown> } | null;
  const stats = (statsRoot?.statistics ?? statsRoot) as Record<string, unknown> | null;
  const valuation = stats && typeof stats === "object" ? (stats["valuations_metrics"] as Record<string, unknown> | undefined) ?? null : null;
  const financials = stats && typeof stats === "object" ? (stats["financials"] as Record<string, unknown> | undefined) ?? null : null;

  const profile = data.profile as Record<string, unknown> | null;

  const pe = readNum(valuation, "trailing_pe") ?? readNum(valuation, "forward_pe");
  const pb = readNum(valuation, "price_to_book_mrq");
  const divYield = readNum(valuation, "trailing_dividend_yield");
  const eps = readNum(financials, "diluted_eps_ttm") ?? readNum(financials, "eps");
  const roe = readNum(financials, "return_on_equity_ttm");
  const mktCapCr = data.market_cap_rs != null ? data.market_cap_rs / 1e7 : null;

  const description =
    (profile?.description as string | undefined)?.trim() ||
    "Company description is not available for this stock right now.";

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="font-display text-lg text-foreground mb-2">About {data.name}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description.length > 700 ? `${description.slice(0, 700)}…` : description}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:grid-cols-4">
          <div><span className="uppercase tracking-wide">Sector</span><div className="text-foreground">{data.sector ?? "—"}</div></div>
          <div><span className="uppercase tracking-wide">Industry</span><div className="text-foreground">{data.industry ?? "—"}</div></div>
          <div><span className="uppercase tracking-wide">Exchange</span><div className="text-foreground">{data.exchange}</div></div>
          <div><span className="uppercase tracking-wide">ISIN</span><div className="font-mono text-foreground">{data.isin ?? "—"}</div></div>
        </div>
      </Card>

      <div>
        <h3 className="mb-3 font-display text-base text-foreground">Key metrics</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Market Cap" value={mktCapCr != null ? `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(mktCapCr)} Cr` : null} />
          <StatCard label="P/E (TTM)" value={pe} />
          <StatCard label="P/B" value={pb} />
          <StatCard label="EPS (TTM)" value={eps} />
          <StatCard label="ROE" value={roe != null ? `${(roe * 100).toFixed(2)}%` : null} />
          <StatCard label="Div Yield" value={divYield != null ? `${(divYield * 100).toFixed(2)}%` : null} />
        </div>
      </div>
    </div>
  );
}
