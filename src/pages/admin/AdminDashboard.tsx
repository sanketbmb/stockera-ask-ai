import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, startOfDay } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Video, PencilLine, ChevronDown, Star, Inbox as InboxIcon, Clock, TrendingUp, CheckCircle2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { TextAnswerModal } from "@/components/admin/TextAnswerModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface QueueRow {
  id: string;
  stock_name: string;
  stock_symbol: string | null;
  query_text: string;
  query_type: string | null;
  status: string;
  buy_price: number | null;
  current_price: number | null;
  ai_report: { verdict?: string; tagline?: string } | null;
  created_at: string;
  assigned_analyst_id: string | null;
}

function StatCard({ label, value, Icon, accent }: { label: string; value: string | number; Icon: React.ComponentType<{ className?: string }>; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">{label}</p>
          <p className="font-display text-2xl mt-1">{value}</p>
        </div>
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", accent ?? "bg-primary/10 text-primary")}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function PnL({ buy, current }: { buy: number | null; current: number | null }) {
  if (!buy || !current) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = ((current - buy) / buy) * 100;
  const positive = pct >= 0;
  return (
    <span className={cn("font-mono text-xs px-2 py-0.5 rounded", positive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-700 dark:text-red-300")}>
      {positive ? "+" : ""}{pct.toFixed(2)}%
    </span>
  );
}

function TimeChip({ created }: { created: string }) {
  const hours = (Date.now() - new Date(created).getTime()) / 3600000;
  const color = hours > 2 ? "text-red-600 bg-red-500/10" : hours > 1 ? "text-amber-600 bg-amber-500/10" : "text-muted-foreground bg-muted";
  return (
    <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded inline-flex items-center gap-1", color)}>
      <Clock className="h-3 w-3" /> {formatDistanceToNow(new Date(created), { addSuffix: true })}
    </span>
  );
}

function QueryQueueCard({ row, onText }: { row: QueueRow; onText: () => void }) {
  const [open, setOpen] = useState(false);
  const verdict = row.ai_report?.verdict;
  return (
    <Card className="p-5 hover:shadow-card transition-shadow">
      <div className="flex flex-wrap items-start gap-2 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-lg text-accent">{row.stock_name}</span>
          {row.stock_symbol && <Badge variant="outline" className="font-mono text-[10px]">{row.stock_symbol}</Badge>}
          {row.query_type && <Badge variant="secondary" className="text-[10px] capitalize">{row.query_type.replace(/_/g, " ")}</Badge>}
        </div>
        <TimeChip created={row.created_at} />
      </div>

      <p className="mt-3 text-sm text-foreground/85 whitespace-pre-wrap">{row.query_text}</p>

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {row.buy_price && <span className="font-mono">Buy <span className="text-foreground">₹{row.buy_price}</span></span>}
        {row.current_price && <span className="font-mono">Now <span className="text-foreground">₹{row.current_price}</span></span>}
        <PnL buy={row.buy_price} current={row.current_price} />
      </div>

      {row.ai_report && (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs hover:bg-muted">
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">AI · {verdict ?? "report"}</Badge>
                <span className="text-muted-foreground truncate">{row.ai_report.tagline ?? "AI report ready"}</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 rounded-lg bg-muted/30 p-3 text-xs">
              <Button asChild size="sm" variant="link" className="px-0">
                <Link to="/report/$queryId" params={{ queryId: row.id }}>Open full AI report →</Link>
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
          <Link to="/admin/upload-answer/$queryId" params={{ queryId: row.id }}>
            <Video className="h-3.5 w-3.5 mr-1.5" /> Record &amp; Upload Video
          </Link>
        </Button>
        <Button size="sm" variant="outline" onClick={onText}>
          <PencilLine className="h-3.5 w-3.5 mr-1.5" /> Send Text Answer
        </Button>
      </div>
    </Card>
  );
}

export default function AdminDashboard() {
  const { user, profile } = useAuth();
  const [textTarget, setTextTarget] = useState<QueueRow | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["analyst_stats", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const today = startOfDay(new Date()).toISOString();
      const [{ count: pending }, { count: answered }, apRes] = await Promise.all([
        supabase
          .from("queries")
          .select("id", { count: "exact", head: true })
          .eq("assigned_analyst_id", user.id)
          .in("status", ["pending", "ai_answered"]),
        supabase
          .from("answers")
          .select("id", { count: "exact", head: true })
          .eq("expert_id", user.id)
          .gte("created_at", today),
        supabase
          .from("analyst_profiles")
          .select("rating, total_sessions")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      return {
        pending: pending ?? 0,
        answered: answered ?? 0,
        rating: ap.data?.rating ?? 5,
        sessions: ap.data?.total_sessions ?? 0,
      };
    },
    enabled: !!user,
  });

  const { data: queue, isLoading } = useQuery({
    queryKey: ["analyst_queue", user?.id],
    queryFn: async () => {
      if (!user) return [] as QueueRow[];
      // assigned to me OR unassigned & pending — visible queue for analysts
      const { data, error } = await supabase
        .from("queries")
        .select("id, stock_name, stock_symbol, query_text, query_type, status, buy_price, current_price, ai_report, created_at, assigned_analyst_id")
        .or(`assigned_analyst_id.eq.${user.id},and(assigned_analyst_id.is.null,status.in.(pending,ai_answered))`)
        .in("status", ["pending", "ai_answered"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as QueueRow[];
    },
    enabled: !!user,
  });

  return (
    <AdminShell>
      <div className="mb-6">
        <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Expert dashboard</p>
        <h1 className="font-display text-3xl md:text-4xl mt-1">Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Pending" value={stats?.pending ?? "—"} Icon={InboxIcon} accent="bg-amber-500/10 text-amber-600" />
        <StatCard label="Answered today" value={stats?.answered ?? "—"} Icon={CheckCircle2} accent="bg-emerald-500/10 text-emerald-600" />
        <StatCard label="Avg rating" value={stats ? `${Number(stats.rating).toFixed(1)} ★` : "—"} Icon={Star} accent="bg-yellow-500/10 text-yellow-600" />
        <StatCard label="Total sessions" value={stats?.sessions ?? "—"} Icon={TrendingUp} />
      </div>

      <div id="queue" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Pending Queue</h2>
          <Badge variant="outline" className="text-[11px]">{queue?.length ?? 0} open</Badge>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
          </div>
        )}

        {!isLoading && (!queue || queue.length === 0) && (
          <Card className="p-10 text-center">
            <InboxIcon className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="font-display text-xl mt-3">All caught up</p>
            <p className="text-sm text-muted-foreground mt-1">New queries assigned to you will appear here.</p>
          </Card>
        )}

        {queue?.map((row) => (
          <QueryQueueCard key={row.id} row={row} onText={() => setTextTarget(row)} />
        ))}
      </div>

      {textTarget && (
        <TextAnswerModal
          open={!!textTarget}
          onOpenChange={(v) => !v && setTextTarget(null)}
          queryId={textTarget.id}
          queryType={textTarget.query_type}
          stockName={textTarget.stock_name}
        />
      )}
    </AdminShell>
  );
}
