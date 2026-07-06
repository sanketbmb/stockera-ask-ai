import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a stock_master row by symbol (case-insensitive).
 * Returns the canonical id/exchange/name used across the 4G unified pipeline.
 * NSE preferred over BSE when both exist for the same symbol.
 */
export async function resolveStockBySymbol(symbol: string): Promise<
  | { id: string; symbol: string; exchange: string; name: string | null }
  | null
> {
  const sym = symbol?.trim().toUpperCase();
  if (!sym) return null;
  const { data, error } = await supabase
    .from("stock_master")
    .select("id, symbol, exchange, name")
    .ilike("symbol", sym)
    .in("exchange", ["NSE", "BSE"])
    .order("exchange", { ascending: true }) // BSE < NSE alpha, we override below
    .limit(2);
  if (error || !data?.length) return null;
  const nse = data.find((r) => r.exchange === "NSE");
  return (nse ?? data[0]) as {
    id: string;
    symbol: string;
    exchange: string;
    name: string | null;
  };
}
