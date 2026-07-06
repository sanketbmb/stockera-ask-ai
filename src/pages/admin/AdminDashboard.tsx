import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, startOfDay } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Video, PencilLine, ChevronDown, Star, Inbox as InboxIcon, Clock, TrendingUp, CheckCircle2, ShieldAlert, ArrowRight, Youtube, Plus } from "lucide-react";
import { VERDICT_MAP } from "@/lib/verdict";
import { AdminShell } from "@/components/admin/AdminShell";
import { AnalystAnswerPanel } from "@/components/admin/AnalystAnswerPanel";
import { QueueSearchBar } from "@/components/admin/QueueSearchBar";
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

function QueryQueueCard({ row }: { row: QueueRow }) {
  const [open, setOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
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
          <Link to={"/admin/compose-video" as never} search={{ queryId: row.id } as never}>
            <Video className="h-3.5 w-3.5 mr-1.5" /> Upload Video Answer
          </Link>
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAnswerOpen((v) => !v)}>
          <PencilLine className="h-3.5 w-3.5 mr-1.5" /> {answerOpen ? "Hide answer panel" : "Answer this query"}
        </Button>
      </div>

      {answerOpen && <AnalystAnswerPanel queryId={row.id} stockName={row.stock_name} />}
    </Card>
  );
}

interface AnsweredRow {
  id: string;
  query_id: string;
  answer_type: string;
  body: string | null;
  verdict: string | null;
  video_url: string | null;
  created_at: string;
  queries: { stock_name: string; stock_symbol: string | null; query_text: string; user_id: string } | null;
  asker: { full_name: string | null; avatar_url: string | null } | null;
}

function AnsweredHistoryCard({ row }: { row: AnsweredRow }) {
  const v = row.verdict ? VERDICT_MAP[row.verdict] : null;
  const askerName = row.asker?.full_name ?? "Stockera user";
  const initials = askerName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-2 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-lg text-accent">{row.queries?.stock_name ?? "—"}</span>
          {row.queries?.stock_symbol && <Badge variant="outline" className="font-mono text-[10px]">{row.queries.stock_symbol}</Badge>}
          {v && <span className={`text-[10px] px-2 py-0.5 rounded border ${v.color}`}>{v.label}</span>}
          <Badge variant="secondary" className="text-[10px]">{row.answer_type === "video" ? "🎥 Video" : "📄 Text"}</Badge>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
        </span>
      </div>

      {row.queries?.query_text && (
        <p className="mt-3 text-xs text-muted-foreground line-clamp-2 italic">"{row.queries.query_text}"</p>
      )}
      {row.body && <p className="mt-2 text-sm text-foreground/85 whitespace-pre-wrap line-clamp-4">{row.body}</p>}

      <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={row.asker?.avatar_url ?? undefined} />
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
          <div className="text-xs">
            <p className="text-muted-foreground">Answered to</p>
            <p className="font-medium leading-tight">{askerName}</p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/report/$queryId" params={{ queryId: row.query_id }}>View report <ArrowRight className="h-3 w-3 ml-1" /></Link>
        </Button>
      </div>
    </Card>
  );
}

function PendingApprovalLockout() {
  return (
    <Card className="p-8 max-w-2xl mx-auto border-amber-500/40 bg-amber-500/5 text-center">
      <ShieldAlert className="h-12 w-12 text-amber-600 mx-auto mb-3" />
      <h2 className="font-display text-2xl mb-2">⏳ Your application is under review</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Our team will verify your SEBI credentials within 24–48 hours. You will receive an email and an in-app notification once approved.
      </p>
      <Button asChild className="mt-5">
        <Link to="/admin/profile">Edit my profile <ArrowRight className="h-4 w-4 ml-1.5" /></Link>
      </Button>
    </Card>
  );
}

export default function AdminDashboard() {
  const { user, profile, isAdmin } = useAuth();
  const [queueSearch, setQueueSearch] = useState("");


  // Check approval status — admins bypass
  const { data: analystProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["self_analyst_profile", user?.id],
    enabled: !!user && !isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("analyst_profiles")
        .select("is_approved")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["analyst_stats", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const today = startOfDay(new Date()).toISOString();
      const [{ count: pending }, { count: answered }, apRes] = await Promise.all([
        supabase.from("queries").select("id", { count: "exact", head: true })
          .eq("assigned_analyst_id", user.id).in("status", ["pending", "ai_answered", "in_review"]),
        supabase.from("answers").select("id", { count: "exact", head: true })
          .eq("expert_id", user.id).gte("created_at", today),
        supabase.from("analyst_profiles").select("rating, total_sessions").eq("id", user.id).maybeSingle(),
      ]);
      return { pending: pending ?? 0, answered: answered ?? 0, rating: apRes.data?.rating ?? 5, sessions: apRes.data?.total_sessions ?? 0 };
    },
    enabled: !!user && (isAdmin || analystProfile?.is_approved === true),
  });

  const { data: queue, isLoading } = useQuery({
    queryKey: ["analyst_queue", user?.id],
    queryFn: async () => {
      if (!user) return [] as QueueRow[];
      const { data, error } = await supabase
        .from("queries")
        .select("id, stock_name, stock_symbol, query_text, query_type, status, buy_price, current_price, ai_report, created_at, assigned_analyst_id")
        .or(`assigned_analyst_id.eq.${user.id},and(assigned_analyst_id.is.null,status.in.(pending,ai_answered))`)
        .in("status", ["pending", "ai_answered", "in_review"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as unknown as QueueRow[];
      if (rows.length === 0) return rows;
      // Exclude queries that already have a published answer from any analyst
      const { data: ans } = await supabase
        .from("answers")
        .select("query_id")
        .in("query_id", rows.map((r) => r.id))
        .eq("is_published", true);
      const answeredSet = new Set((ans ?? []).map((a) => a.query_id));
      return rows.filter((r) => !answeredSet.has(r.id));
    },
    enabled: !!user && (isAdmin || analystProfile?.is_approved === true),
  });

  // Past answers given by this analyst
  const { data: answeredHistory, isLoading: answeredLoading } = useQuery({
    queryKey: ["analyst_answered_history", user?.id],
    enabled: !!user && (isAdmin || analystProfile?.is_approved === true),
    queryFn: async () => {
      if (!user) return [];
      const { data: ans, error } = await supabase
        .from("answers")
        .select("id, query_id, answer_type, body, verdict, video_url, created_at, queries(stock_name, stock_symbol, query_text, user_id)")
        .eq("expert_id", user.id)
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (ans ?? []) as unknown as Array<{
        id: string; query_id: string; answer_type: string; body: string | null; verdict: string | null;
        video_url: string | null; created_at: string;
        queries: { stock_name: string; stock_symbol: string | null; query_text: string; user_id: string } | null;
      }>;
      const askerIds = Array.from(new Set(rows.map((r) => r.queries?.user_id).filter(Boolean) as string[]));
      const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
      if (askerIds.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id, full_name, avatar_url").in("id", askerIds);
        (profs ?? []).forEach((p) => profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url }));
      }
      return rows.map((r) => ({ ...r, asker: r.queries ? profileMap.get(r.queries.user_id) ?? null : null }));
    },
  });


  // Lockout if not approved
  if (!isAdmin && !profileLoading && analystProfile && analystProfile.is_approved === false) {
    return <AdminShell><PendingApprovalLockout /></AdminShell>;
  }

  const filteredQueue = (queue ?? []).filter((r) => {
    const s = queueSearch.trim().toLowerCase();
    if (!s) return true;
    return (
      (r.stock_symbol ?? "").toLowerCase().includes(s) ||
      (r.stock_name ?? "").toLowerCase().includes(s) ||
      (r.query_text ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <AdminShell>
      <div className="mb-6 flex flex-wrap gap-3 items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Expert dashboard</p>
          <h1 className="font-display text-3xl md:text-4xl mt-1">Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
        </div>
        <Button asChild size="lg" className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
          <Link to={"/admin/compose-video" as never}>
            <Plus className="h-4 w-4 mr-1.5" /> New video
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Pending" value={stats?.pending ?? "—"} Icon={InboxIcon} accent="bg-amber-500/10 text-amber-600" />
        <StatCard label="Answered today" value={stats?.answered ?? "—"} Icon={CheckCircle2} accent="bg-emerald-500/10 text-emerald-600" />
        <StatCard label="Avg rating" value={stats ? `${Number(stats.rating).toFixed(1)} ★` : "—"} Icon={Star} accent="bg-yellow-500/10 text-yellow-600" />
        <StatCard label="Total sessions" value={stats?.sessions ?? "—"} Icon={TrendingUp} />
      </div>

      <Card className="p-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-primary/30 bg-primary/5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
            <Youtube className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-lg leading-tight">Video answers</p>
            <p className="text-xs text-muted-foreground">Draft or manage published analyst video answers.</p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link to={"/admin/videos" as never}>Manage <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
        </Button>
      </Card>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            <InboxIcon className="h-3.5 w-3.5" /> Pending Queue
            <Badge variant="outline" className="ml-1 text-[10px]">{queue?.length ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="answered" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Answered
            <Badge variant="outline" className="ml-1 text-[10px]">{answeredHistory?.length ?? 0}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" id="queue" className="space-y-3">
          <QueueSearchBar
            value={queueSearch}
            onChange={setQueueSearch}
            resultCount={filteredQueue.length}
            totalCount={queue?.length ?? 0}
            placeholder="Search assigned queries by stock symbol, stock name, or query text…"
          />
          {isLoading && (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
          )}
          {!isLoading && filteredQueue.length === 0 && (
            <Card className="p-10 text-center">
              <InboxIcon className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="font-display text-xl mt-3">{queueSearch ? "No matches" : "All caught up"}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {queueSearch ? "Try a different search term." : "New queries assigned to you will appear here."}
              </p>
            </Card>
          )}
          {filteredQueue.map((row) => <QueryQueueCard key={row.id} row={row} />)}
        </TabsContent>

        <TabsContent value="answered" className="space-y-3">
          {answeredLoading && (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
          )}
          {!answeredLoading && (!answeredHistory || answeredHistory.length === 0) && (
            <Card className="p-10 text-center">
              <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="font-display text-xl mt-3">No answers yet</p>
              <p className="text-sm text-muted-foreground mt-1">Once you publish answers, you'll see them here with the asker.</p>
            </Card>
          )}
          {answeredHistory?.map((row) => <AnsweredHistoryCard key={row.id} row={row} />)}
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}
