// Library Videos & Blogs Phase 1 — stock_master autocomplete for the
// Library discovery search bar. Read-only, publishable client, no session,
// no bearer, no privileged access. Public data only.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type StockMasterHit = {
  symbol: string;
  company_name: string | null;
  exchange: string | null;
};

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

// Autocomplete over public.stock_master. Matches on either the symbol
// prefix (case-insensitive) or a company_name substring. Returns up to 8
// hits ordered symbol-prefix first, then company_name. Used exclusively by
// the Library Videos & Blogs stock search bar.
export const searchStockMaster = createServerFn({ method: "GET" })
  .inputValidator((input: { q?: string }) => ({
    q: (input?.q ?? "").toString().trim().slice(0, 64),
  }))
  .handler(async ({ data }) => {
    const q = data.q;
    if (q.length < 1) return [] as StockMasterHit[];

    const sb = publicClient();
    const symUpper = q.toUpperCase();
    const like = `%${q}%`;

    // Two lightweight queries, merged & de-duped in-app so we can prefer
    // symbol-prefix matches without a full-text index dependency.
    const [{ data: bySym }, { data: byName }] = await Promise.all([
      sb
        .from("stock_master")
        .select("symbol, company_name, exchange")
        .ilike("symbol", `${symUpper}%`)
        .limit(8),
      sb
        .from("stock_master")
        .select("symbol, company_name, exchange")
        .ilike("company_name", like)
        .limit(8),
    ]);

    const seen = new Set<string>();
    const out: StockMasterHit[] = [];
    for (const row of [...(bySym ?? []), ...(byName ?? [])]) {
      const key = `${row.symbol}|${row.exchange ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        symbol: row.symbol,
        company_name: row.company_name ?? null,
        exchange: row.exchange ?? null,
      });
      if (out.length >= 8) break;
    }
    return out;
  });
