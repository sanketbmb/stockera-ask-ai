import { Card } from "@/components/ui/card";
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

function pct(v: number | null): string | null {
  return v == null ? null : `${(v * 100).toFixed(2)}%`;
}

export function StatisticsTab({ data }: Props) {
  const statsRoot = data.statistics as { statistics?: Record<string, Record<string, unknown> | undefined> } | null;
  const s = (statsRoot?.statistics ?? (data.statistics as Record<string, Record<string, unknown> | undefined> | null) ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const val = s.valuations_metrics ?? null;
  const fin = s.financials ?? null;
  const inc = fin?.income_statement as Record<string, unknown> | undefined;
  const bal = fin?.balance_sheet as Record<string, unknown> | undefined;
  const div = s.dividends_and_splits ?? null;
  const price = s.stock_price_summary ?? null;
  const share = s.stock_statistics ?? null;


  if (!data.statistics) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Detailed statistics aren't available for this stock right now.
      </Card>
    );
  }

  const rows: Array<{ heading: string; items: Array<[string, string | number | null]> }> = [
    { heading: "Valuation", items: [
      ["Market Cap", readNum(val, "market_capitalization")],
      ["Enterprise Value", readNum(val, "enterprise_value")],
      ["P/E (TTM)", readNum(val, "trailing_pe")],
      ["Forward P/E", readNum(val, "forward_pe")],
      ["PEG", readNum(val, "peg_ratio")],
      ["P/B", readNum(val, "price_to_book_mrq")],
      ["P/S (TTM)", readNum(val, "price_to_sales_ttm")],
      ["EV / EBITDA", readNum(val, "enterprise_to_ebitda")],
    ]},
    { heading: "Profitability", items: [
      ["Gross Margin", pct(readNum(fin, "gross_margin"))],
      ["Operating Margin", pct(readNum(fin, "operating_margin"))],
      ["Profit Margin", pct(readNum(fin, "profit_margin"))],
      ["ROE", pct(readNum(fin, "return_on_equity_ttm"))],
      ["ROA", pct(readNum(fin, "return_on_assets_ttm"))],
      ["EPS (TTM)", readNum(fin, "diluted_eps_ttm")],
    ]},
    { heading: "Balance Sheet", items: [
      ["Total Cash", readNum(bal, "total_cash_mrq")],
      ["Total Debt", readNum(bal, "total_debt_mrq")],
      ["Debt / Equity", readNum(bal, "total_debt_to_equity_mrq")],
      ["Current Ratio", readNum(bal, "current_ratio_mrq")],
      ["Book Value / Share", readNum(bal, "book_value_per_share_mrq")],
    ]},
    { heading: "Dividends", items: [
      ["Dividend Yield", pct(readNum(div, "trailing_annual_dividend_yield"))],
      ["Dividend Rate", readNum(div, "trailing_annual_dividend_rate")],
      ["Payout Ratio", pct(readNum(div, "payout_ratio"))],
      ["Last Ex-Div Date", (div?.dividend_date as string | undefined) ?? null],
    ]},
    { heading: "Price History", items: [
      ["52-Week High", readNum(price, "fifty_two_week_high")],
      ["52-Week Low", readNum(price, "fifty_two_week_low")],
      ["50-Day Avg", readNum(price, "day_50_ma")],
      ["200-Day Avg", readNum(price, "day_200_ma")],
      ["Beta", readNum(price, "beta")],
    ]},
    { heading: "Shares", items: [
      ["Shares Outstanding", readNum(share, "shares_outstanding")],
      ["Float", readNum(share, "float_shares")],
      ["% Held by Insiders", pct(readNum(share, "percent_held_by_insiders"))],
      ["% Held by Institutions", pct(readNum(share, "percent_held_by_institutions"))],
    ]},
  ];

  return (
    <div className="space-y-6">
      {rows.map((section) => (
        <div key={section.heading}>
          <h3 className="mb-3 font-display text-base text-foreground">{section.heading}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {section.items.map(([label, value]) => (
              <StatCard key={label} label={label} value={value} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
