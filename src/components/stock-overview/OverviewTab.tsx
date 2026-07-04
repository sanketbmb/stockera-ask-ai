import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "./StatCard";
import type { StockOverview } from "./types";

interface Props { data: StockOverview }

function readNum(o: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!o) return null;
  const v = o[key];
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function readStr(o: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!o) return null;
  const v = o[key];
  if (v == null || v === "") return null;
  return String(v);
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

  const employees = readNum(profile, "employees") ?? readNum(profile, "full_time_employees");
  const website = readStr(profile, "website");
  const country = readStr(profile, "country");

  const description =
    (profile?.description as string | undefined)?.trim() ||
    "Company description is not available for this stock right now.";

  type Row = { label: string; value: React.ReactNode };
  const aboutRows: Row[] = [];
  if (data.sector) aboutRows.push({ label: "Sector", value: data.sector });
  if (data.industry) aboutRows.push({ label: "Industry", value: data.industry });
  aboutRows.push({ label: "Exchange", value: data.exchange });
  if (data.isin) aboutRows.push({ label: "ISIN", value: <span className="font-mono">{data.isin}</span> });
  if (employees != null) aboutRows.push({ label: "Employees", value: new Intl.NumberFormat("en-IN").format(employees) });
  if (country) aboutRows.push({ label: "Country", value: country });
  if (website) aboutRows.push({
    label: "Website",
    value: (
      <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
        {website.replace(/^https?:\/\//, "")}
      </a>
    ),
  });

  const metrics: Array<{ label: string; value: string | number | null }> = [];
  if (mktCapCr != null) metrics.push({ label: "Market Cap", value: `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(mktCapCr)} Cr` });
  if (pe != null) metrics.push({ label: "P/E (TTM)", value: pe });
  if (pb != null) metrics.push({ label: "P/B", value: pb });
  if (eps != null) metrics.push({ label: "EPS (TTM)", value: eps });
  if (roe != null) metrics.push({ label: "ROE", value: `${(roe * 100).toFixed(2)}%` });
  if (divYield != null) metrics.push({ label: "Div Yield", value: `${(divYield * 100).toFixed(2)}%` });

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="font-display text-lg text-foreground mb-2">About {data.name}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description.length > 700 ? `${description.slice(0, 700)}…` : description}
        </p>
        {aboutRows.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:grid-cols-4">
            {aboutRows.map((r) => (
              <div key={r.label}>
                <span className="uppercase tracking-wide">{r.label}</span>
                <div className="text-foreground">{r.value}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {metrics.length > 0 && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base text-foreground">Key metrics</h3>
            <Badge variant="secondary" className="text-[10px]">Extended fundamentals coming soon</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {metrics.map((m) => (
              <StatCard key={m.label} label={m.label} value={m.value} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
