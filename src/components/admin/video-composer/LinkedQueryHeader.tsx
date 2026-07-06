// Stage 4G APPLY-2 — Header shown when the composer is opened from a specific
// user query. Inert (read-only) context.
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

interface Props {
  query: {
    id: string;
    stock_symbol: string | null;
    stock_name: string | null;
    query_text: string;
    query_type: string | null;
    buy_price: number | null;
    current_price: number | null;
  } | null;
}

export function LinkedQueryHeader({ query }: Props) {
  if (!query) return null;
  return (
    <Card className="p-4 mb-6 bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
      <Link to="/admin/dashboard" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
        <ArrowLeft className="h-3 w-3" /> Back to queue
      </Link>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="font-display text-lg text-accent">{query.stock_name ?? "—"}</span>
        {query.stock_symbol && <Badge variant="outline" className="font-mono text-[10px]">{query.stock_symbol}</Badge>}
        {query.query_type && <Badge variant="secondary" className="text-[10px] capitalize">{query.query_type.replace(/_/g, " ")}</Badge>}
      </div>
      <p className="text-sm whitespace-pre-wrap text-foreground/85">{query.query_text}</p>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-mono text-muted-foreground">
        {query.buy_price && <span>Buy ₹{query.buy_price}</span>}
        {query.current_price && <span>Now ₹{query.current_price}</span>}
      </div>
    </Card>
  );
}

export default LinkedQueryHeader;
