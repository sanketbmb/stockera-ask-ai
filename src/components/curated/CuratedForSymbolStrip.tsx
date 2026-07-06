// Stage 4G APPLY-5 — Curated strip for a specific stock, on the stock page.
// Free content only. No wallet/entitlement UI.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { listCuratedItemsForSymbol } from "@/lib/discover.functions";

type Row = {
  id: string;
  title: string;
  description: string | null;
  custom_thumbnail_url: string | null;
  source_url: string;
  source_provider: string;
  category: string | null;
  published_at: string | null;
};

export function CuratedForSymbolStrip({ symbol }: { symbol: string }) {
  const listFn = useServerFn(listCuratedItemsForSymbol);
  const { data, isLoading } = useQuery({
    queryKey: ["curated", "symbol", symbol],
    queryFn: () => listFn({ data: { symbol, limit: 12 } }) as Promise<Row[]>,
    staleTime: 5 * 60 * 1000,
  });
  const rows = data ?? [];
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[0, 1].map((i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
      </div>
    );
  }
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="curated-symbol-heading">
      <div className="flex items-baseline justify-between mb-3">
        <h2 id="curated-symbol-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Curated media on {symbol}
        </h2>
        <span className="text-[10px] text-muted-foreground font-mono">FREE · attribution-first</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((c) => (
          <Link
            key={c.id}
            to={"/curated/$itemId" as never}
            params={{ itemId: c.id } as never}
            className="block group"
          >
            <Card className="p-3 flex gap-3 hover:shadow-lg transition-shadow">
              {c.custom_thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.custom_thumbnail_url}
                  alt=""
                  loading="lazy"
                  className="w-28 h-20 object-cover rounded shrink-0"
                />
              ) : (
                <div className="w-28 h-20 bg-muted rounded shrink-0 flex items-center justify-center">
                  <ExternalLink className="h-5 w-5 text-muted-foreground" aria-hidden />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{c.source_provider}</Badge>
                  <span className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] px-1.5 py-0.5 font-semibold uppercase tracking-wide">Free</span>
                </div>
                <p className="text-sm font-medium mt-1 line-clamp-2 group-hover:text-primary">{c.title}</p>
                {c.description ? (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{c.description}</p>
                ) : null}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
