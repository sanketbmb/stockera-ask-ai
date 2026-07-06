import { supabase } from "@/integrations/supabase/client";

export type CanonicalStock = {
  id: string;
  symbol: string;
  exchange: string;
  company_name: string | null;
};

/**
 * Resolve a stock_master row by symbol (case-insensitive).
 * NSE preferred over BSE when both exist for the same symbol.
 */
export async function resolveStockBySymbol(
  symbol: string,
): Promise<CanonicalStock | null> {
  const sym = symbol?.trim().toUpperCase();
  if (!sym) return null;
  const { data, error } = await supabase
    .from("stock_master")
    .select("id, symbol, exchange, company_name")
    .ilike("symbol", sym)
    .in("exchange", ["NSE", "BSE"])
    .limit(2);
  if (error || !data?.length) return null;
  const nse = data.find((r) => r.exchange === "NSE");
  return (nse ?? data[0]) as CanonicalStock;
}

