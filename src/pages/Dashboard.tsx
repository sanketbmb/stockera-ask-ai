import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { FileText, MessageSquare, Wallet, Gift, Plus, ArrowRight, Sparkles, AlertCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AnimatedCounter } from "@/components/common/AnimatedCounter";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { seedDemoQueryIfEmpty } from "@/lib/seedDemoQuery";
import { useWalletBalance, useWalletRealtime, formatPoints } from "@/lib/points";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
  ai_answered: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  expert_answered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  in_review: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
};

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[status] ?? ""}`}>{label}</Badge>;
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const firstName = (profile?.full_name || "").split(" ")[0] || "investor";

  const {
    data: walletBalance,
    isLoading: balanceLoading,
    error: balanceError,
    refetch: refetchBalance,
  } = useWalletBalance(user?.id);
  useWalletRealtime(user?.id);
  const liveBalance = walletBalance?.balance ?? 0;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [total, ai, refs] = await Promise.all([
        supabase.from("queries").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
        supabase.from("queries").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("status", "ai_answered"),
        supabase.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", user!.id),
      ]);
      return {
        total: total.count ?? 0,
        ai: ai.count ?? 0,
        refs: refs.count ?? 0,
      };
    },
  });

  const { data: recent = [], isLoading: recentLoading } = useQuery({
    queryKey: ["dashboard-recent", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("queries")
        .select("id, stock_name, query_type, status, ai_report, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const qc = useQueryClient();
  // Seed a demo query on first dashboard visit (idempotent)
  useEffect(() => {
    if (!user || !profile) return;
    const completed = (profile as unknown as { onboarding_completed?: boolean }).onboarding_completed;
    if (completed) return;
    seedDemoQueryIfEmpty(user.id).then((seeded) => {
      if (seeded) {
        qc.invalidateQueries({ queryKey: ["dashboard-stats", user.id] });
        qc.invalidateQueries({ queryKey: ["dashboard-recent", user.id] });
      }
    });
  }, [user, profile, qc]);

  return (
    <AppShell>
      <OnboardingTour />
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card bg-noise p-6 md:p-8 mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
        <h1 className="font-display text-3xl md:text-4xl mt-1">{greeting()}, {firstName} 👋</h1>
        <p className="text-muted-foreground mt-2 text-sm">Your stock queries, AI reports and expert answers — all in one place.</p>
      </div>

      <section data-tour="dashboard-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Queries Posted" value={stats?.total} icon={<FileText className="h-4 w-4" />} loading={statsLoading} animate />
        <StatCard label="AI Reports" value={stats?.ai} icon={<Sparkles className="h-4 w-4" />} loading={statsLoading} animate />
        <div data-tour="wallet" className="contents">
          {balanceError ? (
            <Card className="glass-card p-4 bg-gradient-to-br from-primary/15 to-accent/10 border-primary/30">
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span className="uppercase tracking-wider">Wallet Balance</span>
                <Wallet className="h-4 w-4" />
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Couldn't load</span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => refetchBalance()}>Retry</Button>
              </div>
            </Card>
          ) : (
            <StatCard
              label="Wallet Balance"
              value={balanceLoading ? undefined : formatPoints(liveBalance)}
              icon={<Wallet className="h-4 w-4" />}
              highlight
              loading={balanceLoading}
            />
          )}
        </div>
        <StatCard label="Referrals" value={stats?.refs} icon={<Gift className="h-4 w-4" />} loading={statsLoading} animate />
      </section>

      <section className="grid lg:grid-cols-3 gap-3 mb-8">
        <Button asChild data-tour="post-query" className="h-14 bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-95">
          <Link to="/post-query"><Plus className="h-4 w-4 mr-2" /> Post a new query</Link>
        </Button>
        <Button asChild variant="outline" className="h-14"><Link to="/topup"><Wallet className="h-4 w-4 mr-2" /> Add wallet credits</Link></Button>
        <Button asChild variant="outline" className="h-14"><Link to="/referral"><Gift className="h-4 w-4 mr-2" /> Refer a friend</Link></Button>
      </section>

      <Card data-tour="recent-queries" className="glass-card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-xl">Recent Queries</h2>
          <Button asChild variant="ghost" size="sm"><Link to="/my-queries">View all <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link></Button>
        </div>
        {recentLoading ? (
          <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : recent.length === 0 ? (
          <div className="p-10 text-center">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="font-display text-lg mt-3">No queries yet</p>
            <p className="text-sm text-muted-foreground mt-1">Ask your first stock question and get an instant AI report.</p>
            <Button asChild className="mt-4"><Link to="/post-query">Post a query →</Link></Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stock</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI Report</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{q.stock_name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground capitalize">{(q.query_type ?? "—").replace(/_/g, " ")}</TableCell>
                    <TableCell><StatusBadge status={q.status ?? "pending"} /></TableCell>
                    <TableCell>
                      {q.ai_report ? (
                        <Link to="/report/$queryId" params={{ queryId: q.id }} className="text-xs text-primary hover:underline">View report →</Link>
                      ) : <span className="text-xs text-muted-foreground">Pending</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{formatDistanceToNow(new Date(q.created_at as string), { addSuffix: true })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}

function StatCard({ label, value, icon, highlight, loading, animate, prefix }: { label: string; value?: number | string; icon: React.ReactNode; highlight?: boolean; loading?: boolean; animate?: boolean; prefix?: string }) {
  const isNumeric = typeof value === "number";
  return (
    <Card className={`glass-card p-4 ${highlight ? "bg-gradient-to-br from-primary/15 to-accent/10 border-primary/30" : ""}`}>
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span className="uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20 mt-2" />
      ) : animate && isNumeric ? (
        <p className="font-display text-3xl mt-1">
          <AnimatedCounter end={value as number} prefix={prefix} />
        </p>
      ) : (
        <p className="font-display text-3xl mt-1">{prefix}{value ?? 0}</p>
      )}
    </Card>
  );
}
