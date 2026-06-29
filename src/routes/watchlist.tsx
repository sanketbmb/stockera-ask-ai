import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Navbar } from "@/components/layout/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Target, ShieldAlert, TrendingUp, TrendingDown, Trash2, Loader2 } from "lucide-react";
import { getPortfolio, removeFromPortfolio, type PortfolioRow } from "@/lib/portfolio.functions";
import { toast } from "sonner";

function StatusBadge({ status }: { status: PortfolioRow["status"] }) {
  if (status === "target_hit") {
    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40"><Target className="h-3 w-3 mr-1" /> Target Hit</Badge>;
  }
  if (status === "stop_loss_hit") {
    return <Badge className="bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/40"><ShieldAlert className="h-3 w-3 mr-1" /> Stop Loss Hit</Badge>;
  }
  return <Badge variant="outline">Active</Badge>;
}

function WatchlistContent() {
  const fetchPortfolio = useServerFn(getPortfolio);
  const remove = useServerFn(removeFromPortfolio);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => fetchPortfolio(),
    refetchInterval: 60_000,
  });

  const rows = data?.rows ?? [];
  const totalPnl = rows.reduce((s, r) => s + (r.pnl_abs ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + r.buy_price * r.quantity, 0);
  const totalPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const handleRemove = async (id: string, name: string) => {
    try {
      await remove({ data: { id } });
      toast.success(`Removed ${name}`);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-mesh">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-accent">Your Tracked Stocks</p>
            <h1 className="font-display text-3xl md:text-4xl mt-1 flex items-center gap-3">
              <Briefcase className="h-8 w-8 text-primary" /> Watchlist
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Track P&amp;L and AI-set targets in real time.</p>
          </div>
          <Button asChild className="bg-gradient-brand text-white">
            <Link to="/post-query">+ Analyze a new stock</Link>
          </Button>
        </header>

        {rows.length > 0 && (
          <Card className="p-5 mb-6 bg-gradient-to-br from-primary/5 to-accent/5">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Holdings</p>
                <p className="font-display text-3xl mt-1">{rows.length}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Invested</p>
                <p className="font-display text-3xl mt-1">₹{totalCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Unrealized P&amp;L</p>
                <p className={`font-display text-3xl mt-1 ${totalPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {totalPnl >= 0 ? "+" : ""}₹{totalPnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  <span className="text-sm ml-2">({totalPct >= 0 ? "+" : ""}{totalPct.toFixed(2)}%)</span>
                </p>
              </div>
            </div>
          </Card>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <Card className="p-12 text-center">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-display text-2xl">Your Watchlist is empty</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              Post a query, get an AI report, then tap "Add to my Watchlist" to start tracking with target / stop-loss alerts.
            </p>
            <Button asChild className="mt-5 bg-gradient-brand text-white"><Link to="/post-query">Post your first query</Link></Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-xl">{r.stock_name}</h3>
                      <Badge variant="outline" className="font-mono text-[10px]">{r.stock_symbol}</Badge>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Qty: {r.quantity} · Added {new Date(r.created_at).toLocaleDateString("en-IN")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.added_from_query_id && (
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/report/$queryId" params={{ queryId: r.added_from_query_id }}>View Report</Link>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => handleRemove(r.id, r.stock_name)} aria-label="Remove">
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  <Cell label="Buy" value={`₹${r.buy_price.toFixed(2)}`} />
                  <Cell label="Current" value={r.current_price !== null ? `₹${r.current_price.toFixed(2)}` : "—"} />
                  <Cell
                    label="P&L"
                    value={r.pnl_pct !== null ? `${r.pnl_pct >= 0 ? "+" : ""}${r.pnl_pct.toFixed(2)}%` : "—"}
                    icon={r.pnl_pct !== null && (r.pnl_pct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />)}
                    className={r.pnl_pct === null ? "" : r.pnl_pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
                  />
                  <Cell label="Target" value={r.target !== null ? `₹${r.target}` : "—"} className="text-emerald-600 dark:text-emerald-400" />
                  <Cell label="Stop Loss" value={r.stop_loss !== null ? `₹${r.stop_loss}` : "—"} className="text-red-600 dark:text-red-400" />
                </div>
              </Card>
            ))}
          </div>
        )}

        <p className="mt-8 text-[11px] text-muted-foreground text-center max-w-2xl mx-auto">
          Prices are AI-estimated and may not reflect real-time market data. Educational use only — not SEBI investment advice.
        </p>
      </main>
    </div>
  );
}

function Cell({ label, value, className = "", icon }: { label: string; value: string; className?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-mono text-sm font-semibold mt-0.5 flex items-center gap-1 ${className}`}>{icon}{value}</p>
    </div>
  );
}

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "My Watchlist — Stockera" },
      { name: "description", content: "Track stocks you're watching with live P&L and AI-powered target / stop-loss alerts." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <RequireAuth><WatchlistContent /></RequireAuth>,
});
