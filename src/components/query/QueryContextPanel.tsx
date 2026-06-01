import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Newspaper, Sparkles, History, TrendingUp, Brain, Bot, Database, FileText, UserCheck } from "lucide-react";
import { verdictUILabel } from "@/lib/verdict-labels";
import type { VerdictAction } from "@/types/stock-analysis";

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

type RecentRow = { stock_name: string; verdict: VerdictAction | null; created_at: string };

const FALLBACK_RECENT: RecentRow[] = [
  { stock_name: "IDFC First Bank", verdict: "HOLD", created_at: new Date(Date.now() - 12 * 60_000).toISOString() },
  { stock_name: "Tata Motors", verdict: "BUY", created_at: new Date(Date.now() - 47 * 60_000).toISOString() },
  { stock_name: "Yes Bank", verdict: "WATCHLIST", created_at: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { stock_name: "Adani Power", verdict: "SELL", created_at: new Date(Date.now() - 5 * 3600_000).toISOString() },
];

const TRENDING = [
  { title: "Nifty recovers 200pts — what should investors do?", source: "ET Markets", time: "1h ago" },
  { title: "RBI rate decision impact on banking stocks", source: "Moneycontrol", time: "3h ago" },
  { title: "Top 5 analyst picks for this week", source: "LiveMint", time: "5h ago" },
];

const VERDICT_COLOR: Record<VerdictAction, string> = {
  BUY: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  HOLD: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  SELL: "bg-red-500/15 text-red-700 dark:text-red-300",
  WATCHLIST: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  AVOID: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
};

const VALID_ACTIONS: VerdictAction[] = ["BUY", "HOLD", "SELL", "WATCHLIST", "AVOID"];

function extractAction(report: unknown): VerdictAction | null {
  if (!report || typeof report !== "object") return null;
  const r = report as Record<string, unknown>;
  const fv = r.final_verdict as Record<string, unknown> | undefined;
  const raw = (fv?.action ?? r.verdict) as unknown;
  if (typeof raw !== "string") return null;
  const up = raw.toUpperCase() as VerdictAction;
  return VALID_ACTIONS.includes(up) ? up : null;
}

export function QueryContextPanel() {
  const { data: recent = FALLBACK_RECENT } = useQuery<RecentRow[]>({
    queryKey: ["recent-queries-anon"],
    queryFn: async () => {
      const { data } = await supabase
        .from("queries")
        .select("stock_name, ai_report, created_at")
        .not("ai_report", "is", null)
        .order("created_at", { ascending: false })
        .limit(10);
      const rows: RecentRow[] = (data ?? []).map((r) => ({
        stock_name: r.stock_name,
        verdict: extractAction(r.ai_report),
        created_at: r.created_at as string,
      }));
      return rows.length ? rows : FALLBACK_RECENT;
    },
  });

  return (
    <Card className="sticky top-24 border border-border bg-card/80 backdrop-blur p-4">
      <Tabs defaultValue="recent">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="recent"><History className="h-3.5 w-3.5 mr-1" />Recent</TabsTrigger>
          <TabsTrigger value="news"><Newspaper className="h-3.5 w-3.5 mr-1" />News</TabsTrigger>
          <TabsTrigger value="how"><Sparkles className="h-3.5 w-3.5 mr-1" />How</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-4 space-y-2">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Anonymized recent queries</p>
          <ul className="space-y-2">
            {recent.map((q, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/60 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{q.stock_name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {q.verdict && (
                    <Badge variant="outline" className={`text-[10px] ${VERDICT_COLOR[q.verdict]}`}>
                      {verdictUILabel(q.verdict)}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">{timeAgo(q.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>


        <TabsContent value="news" className="mt-4 space-y-3">
          {TRENDING.map((n, i) => (
            <a key={i} href="#" className="block rounded-lg border border-border/60 bg-background/60 p-3 hover:border-primary/40 transition">
              <p className="text-sm font-medium leading-snug">{n.title}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{n.source} · {n.time}</p>
            </a>
          ))}
        </TabsContent>

        <TabsContent value="how" className="mt-4">
          <ol className="space-y-3">
            {[
              { Icon: FileText, t: "You submit query", d: "Stock, prices, context" },
              { Icon: Bot, t: "Gemini AI analyzes", d: "Verdict + price levels" },
              { Icon: Database, t: "NSE/BSE context", d: "Fundamentals & technicals" },
              { Icon: Brain, t: "Structured report", d: "Risk, reward, behavioral" },
              { Icon: UserCheck, t: "SEBI analyst review", d: "Video answer within 24h" },
            ].map(({ Icon, t, d }, i) => (
              <li key={i} className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><Icon className="h-4 w-4" /></div>
                <div>
                  <p className="text-sm font-medium">{t}</p>
                  <p className="text-xs text-muted-foreground">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
