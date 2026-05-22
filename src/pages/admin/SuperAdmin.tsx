import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, Users, FileText, Inbox, Activity, MoreHorizontal, Plus, Minus, BarChart3, ShieldCheck, ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { maskEmail } from "@/lib/verdict";
import {
  getAdminOverviewStats,
  getPlatformStats,
  getQueriesPerDay14d,
  getAllQueriesForAdmin,
  getAllUsersForAdmin,
  getAnalystApplications,
  getApprovedAvailableAnalysts,
  approveAnalyst,
  rejectAnalyst,
  setAnalystAvailability,
  assignQueryToAnalyst,
} from "@/lib/admin.functions";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
  ai_answered: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  in_review: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  expert_answered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
};

// ───────────────────────── AI Engine Health Check (preserved) ─────────────────────────
function AiEngineHealthCheck() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-ai-report`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });
      const txt = await res.text();
      try { setResult(JSON.parse(txt)); } catch { setResult({ raw: txt, http_status: res.status }); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  };
  const env = (result?.env_check ?? {}) as Record<string, boolean>;
  const tables = (result?.tables_check ?? {}) as Record<string, boolean>;
  return (
    <Card className="p-4 border-amber-500/50 bg-amber-500/5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">⚠️ AI Engine Health</p>
          <p className="text-xs text-muted-foreground mt-1">
            Verify <code className="font-mono bg-muted px-1 rounded">GEMINI_API_KEY</code> is configured in Edge Function Secrets.
          </p>
        </div>
        <Button onClick={run} disabled={loading} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Test AI Report Engine
        </Button>
      </div>
      {error && <p className="text-xs text-destructive mt-3">{error}</p>}
      {result && (
        <div className="mt-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(env).map(([k, v]) => (
              <Badge key={k} variant={v ? "default" : "destructive"} className="justify-start font-mono">{v ? "✓" : "✗"} {k}</Badge>
            ))}
            {Object.entries(tables).map(([k, v]) => (
              <Badge key={k} variant={v ? "default" : "destructive"} className="justify-start font-mono">{v ? "✓" : "✗"} {k}</Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── Overview ─────────────────────────
function OverviewTab() {
  const fetchStats = useServerFn(getAdminOverviewStats);
  const { data, isLoading } = useQuery({ queryKey: ["admin_overview"], queryFn: () => fetchStats() });
  if (isLoading) return <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-24" />)}</div>;
  const cards = [
    { label: "Total Users", value: data?.users ?? 0, Icon: Users, color: "bg-blue-500/10 text-blue-600" },
    { label: "Pending Analyst Apps", value: data?.pendingApplications ?? 0, Icon: ShieldCheck, color: "bg-amber-500/10 text-amber-600" },
    { label: "Queries Today", value: data?.queriesToday ?? 0, Icon: FileText, color: "bg-violet-500/10 text-violet-600" },
    { label: "Pending Queries", value: data?.pendingQueries ?? 0, Icon: Inbox, color: "bg-red-500/10 text-red-600" },
  ];
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(({ label, value, Icon, color }) => (
        <Card key={label} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">{label}</p>
              <p className="font-display text-3xl mt-1">{value}</p>
            </div>
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}><Icon className="h-5 w-5" /></div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ───────────────────────── Analyst Applications ─────────────────────────
function PendingAnalystCard({ analyst, onChanged }: { analyst: any; onChanged: () => void }) {
  const approveFn = useServerFn(approveAnalyst);
  const rejectFn = useServerFn(rejectAnalyst);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const approve = useMutation({
    mutationFn: () => approveFn({ data: { analystId: analyst.id } }),
    onSuccess: () => { toast.success("Analyst approved — they can now log in"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: () => rejectFn({ data: { analystId: analyst.id, reason } }),
    onSuccess: () => { toast.success("Application rejected"); setRejectOpen(false); setReason(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="p-5 border-amber-500/30">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={analyst.avatar_url ?? undefined} />
            <AvatarFallback>{(analyst.full_name ?? analyst.display_name).slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{analyst.full_name ?? analyst.display_name}</p>
            <p className="text-xs text-muted-foreground">{analyst.email ?? "—"}</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{analyst.created_at ? `Applied ${formatDistanceToNow(new Date(analyst.created_at), { addSuffix: true })}` : ""}</span>
      </div>
      <div className="mt-4 grid sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">SEBI Registration</p>
          <p className="font-mono text-lg mt-1">{analyst.sebi_reg_number}</p>
        </div>
        <div className="flex items-start gap-2 flex-wrap">
          <Badge className={analyst.sebi_type === "RA" ? "bg-teal-500/15 text-teal-700 border-teal-500/30" : "bg-yellow-500/15 text-yellow-800 border-yellow-500/30"}>
            {analyst.sebi_type}
          </Badge>
          {(analyst.specializations ?? []).slice(0, 4).map((s: string) => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
          {(analyst.languages ?? []).map((l: string) => <Badge key={l} variant="secondary" className="text-[10px]">{l}</Badge>)}
        </div>
      </div>
      {analyst.bio && <p className="mt-3 text-sm text-muted-foreground">{analyst.bio.slice(0, 150)}{analyst.bio.length > 150 ? "…" : ""}</p>}
      <div className="mt-4 flex gap-2">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={approve.isPending} onClick={() => approve.mutate()}>
          {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve</>}
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)}>
          <XCircle className="h-4 w-4 mr-1.5" /> Reject
        </Button>
      </div>
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject {analyst.full_name ?? analyst.display_name}</DialogTitle></DialogHeader>
          <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection (min 10 chars, sent to applicant)" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={reason.trim().length < 10 || reject.isPending} onClick={() => reject.mutate()}>
              {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AnalystApplicationsTab() {
  const qc = useQueryClient();
  const fetchApps = useServerFn(getAnalystApplications);
  const setAvail = useServerFn(setAnalystAvailability);
  const { data, isLoading } = useQuery({ queryKey: ["admin_analyst_apps"], queryFn: () => fetchApps() });
  const suspend = useMutation({
    mutationFn: ({ id, available }: { id: string; available: boolean }) => setAvail({ data: { analystId: id, available } }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin_analyst_apps"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-60" />;
  const pending = (data ?? []).filter((a) => !a.is_approved);
  const approved = (data ?? []).filter((a) => a.is_approved);
  const reload = () => qc.invalidateQueries({ queryKey: ["admin_analyst_apps"] });

  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-display text-lg mb-3">Pending Review · {pending.length}</h3>
        {pending.length === 0 ? <Card className="p-6 text-sm text-muted-foreground">No pending applications.</Card> : (
          <div className="grid gap-3">{pending.map((a) => <PendingAnalystCard key={a.id} analyst={a} onChanged={reload} />)}</div>
        )}
      </section>
      <section>
        <h3 className="font-display text-lg mb-3">Approved Analysts · {approved.length}</h3>
        <Card className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>SEBI No</TableHead><TableHead>Type</TableHead>
                <TableHead>Approved</TableHead><TableHead>Answers</TableHead><TableHead>Rating</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approved.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7"><AvatarImage src={a.avatar_url ?? undefined} /><AvatarFallback>{(a.full_name ?? a.display_name).slice(0,1)}</AvatarFallback></Avatar>
                      <span className="text-sm">{a.full_name ?? a.display_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-[10px]">{a.sebi_reg_number}</TableCell>
                  <TableCell>{a.sebi_type}</TableCell>
                  <TableCell className="text-xs">{a.created_at ? format(new Date(a.created_at), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{a.total_answers}</TableCell>
                  <TableCell className="font-mono text-xs">{Number(a.rating ?? 0).toFixed(1)} ★</TableCell>
                  <TableCell>
                    {a.is_available
                      ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Available</Badge>
                      : <Badge variant="outline">Suspended</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => suspend.mutate({ id: a.id, available: !a.is_available })}>
                      {a.is_available ? "Suspend" : "Re-activate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {approved.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No approved analysts yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}

// ───────────────────────── All Queries ─────────────────────────
function AllQueriesTab() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(getAllQueriesForAdmin);
  const fetchAnalysts = useServerFn(getApprovedAvailableAnalysts);
  const assign = useServerFn(assignQueryToAnalyst);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["admin_all_queries"], queryFn: () => fetchAll() });
  const { data: analysts } = useQuery({ queryKey: ["admin_approved_analysts"], queryFn: () => fetchAnalysts() });
  const assignMut = useMutation({
    mutationFn: (v: { queryId: string; analystId: string }) => assign({ data: v }),
    onSuccess: () => { toast.success("Query assigned"); qc.invalidateQueries({ queryKey: ["admin_all_queries"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (filter === "pending") rows = rows.filter((r) => r.status === "pending");
    else if (filter === "unassigned") rows = rows.filter((r) => !r.assigned_analyst_id);
    else if (filter === "ai_answered") rows = rows.filter((r) => r.status === "ai_answered");
    else if (filter === "expert_answered") rows = rows.filter((r) => r.status === "expert_answered");
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => (r.stock_name ?? "").toLowerCase().includes(q) || (r.user_name ?? "").toLowerCase().includes(q));
    }
    return rows;
  }, [data, filter, search]);

  if (isLoading) return <Skeleton className="h-60" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="unassigned">Unassigned</TabsTrigger>
            <TabsTrigger value="ai_answered">AI Answered</TabsTrigger>
            <TabsTrigger value="expert_answered">Expert Answered</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input className="max-w-xs" placeholder="Search stock or user…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead><TableHead>Stock</TableHead><TableHead>Type</TableHead>
              <TableHead>Status</TableHead><TableHead>AI</TableHead><TableHead>Assigned</TableHead>
              <TableHead>Answer</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((q) => (
              <>
                <TableRow key={q.id}>
                  <TableCell>
                    <div className="text-xs">
                      <p className="font-medium">{q.user_name ?? "—"}</p>
                      <p className="text-muted-foreground font-mono text-[10px]">{maskEmail(q.user_email)}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{q.stock_name}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px] capitalize">{q.query_type?.replace(/_/g, " ") ?? "—"}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] capitalize ${STATUS_STYLE[q.status ?? ""] ?? ""}`}>{(q.status ?? "—").replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell>{q.ai_report ? <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]">yes</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-xs">{q.analyst_name ?? <span className="text-muted-foreground">unassigned</span>}</TableCell>
                  <TableCell className="text-xs">
                    {q.has_text_answer && <Badge variant="outline" className="mr-1 text-[10px]">📄</Badge>}
                    {q.has_video_answer && <Badge variant="outline" className="text-[10px]">🎥</Badge>}
                    {!q.has_text_answer && !q.has_video_answer && <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs">{format(new Date(q.created_at!), "MMM d, HH:mm")}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-xs">Assign to analyst</DropdownMenuLabel>
                        {(analysts ?? []).filter((a) => a.is_available).map((a) => (
                          <DropdownMenuItem key={a.id} onClick={() => assignMut.mutate({ queryId: q.id, analystId: a.id })}>
                            {a.display_name} <span className="text-[10px] text-muted-foreground ml-1">{a.sebi_type}</span>
                          </DropdownMenuItem>
                        ))}
                        {!analysts?.length && <DropdownMenuItem disabled>No available analysts</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}>
                          {expandedId === q.id ? "Hide details" : "View full query"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                {expandedId === q.id && (
                  <TableRow>
                    <TableCell colSpan={9} className="bg-muted/40">
                      <div className="text-xs space-y-2 py-2">
                        <p className="font-medium">Query:</p>
                        <p className="whitespace-pre-wrap text-foreground/85">{q.query_text}</p>
                        <div className="flex flex-wrap gap-3 text-[11px] font-mono">
                          {q.buy_price && <span>Buy: ₹{q.buy_price}</span>}
                          {q.current_price && <span>Now: ₹{q.current_price}</span>}
                        </div>
                        <Button asChild size="sm" variant="link" className="px-0">
                          <Link to="/report/$queryId" params={{ queryId: q.id }}>Open full report <ExternalLink className="h-3 w-3 ml-1" /></Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No queries match filters</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ───────────────────────── All Users ─────────────────────────
function AllUsersTab() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(getAllUsersForAdmin);
  const { data, isLoading } = useQuery({ queryKey: ["admin_all_users"], queryFn: () => fetchAll() });
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const adjust = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("No target");
      const amt = parseInt(amount, 10);
      if (!amt) throw new Error("Enter an amount");
      const { data: res, error } = await supabase.rpc("admin_adjust_wallet", {
        _target_user_id: target.id, _amount: amt, _reason: reason || "no reason",
      });
      if (error) throw error;
      const r = res as { success: boolean; error?: string; new_balance?: number };
      if (!r.success) throw new Error(r.error ?? "Failed");
      // audit
      await supabase.from("audit_events").insert({
        event_type: "admin_action",
        actor_id: (await supabase.auth.getUser()).data.user?.id,
        resource_type: "profile",
        resource_id: target.id,
        payload: { action: "wallet_adjusted", delta: amt, reason } as never,
      });
      return r.new_balance;
    },
    onSuccess: (bal) => { toast.success(`New balance ₹${bal}`); qc.invalidateQueries({ queryKey: ["admin_all_users"] }); setTarget(null); setAmount(""); setReason(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-60" />;
  return (
    <>
      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Roles</TableHead>
              <TableHead>Joined</TableHead><TableHead>Queries</TableHead><TableHead>Wallet</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7"><AvatarImage src={u.avatar_url ?? undefined} /><AvatarFallback>{(u.full_name ?? "U").slice(0,1)}</AvatarFallback></Avatar>
                    <span className="text-sm">{u.full_name ?? "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs font-mono">{maskEmail(u.email)}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {u.roles.length ? u.roles.map((r) => <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>) : <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{u.created_at ? format(new Date(u.created_at), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell className="font-mono text-xs">{u.queries_count}</TableCell>
                <TableCell className="font-mono text-xs">₹{u.wallet_balance ?? 0}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setTarget({ id: u.id, name: u.full_name ?? "user" })}>Adjust wallet</Button>
                </TableCell>
              </TableRow>
            ))}
            {!data?.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No users</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust wallet · {target?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAmount("100")}><Plus className="h-3 w-3 mr-1" /> ₹100</Button>
              <Button variant="outline" size="sm" onClick={() => setAmount("500")}><Plus className="h-3 w-3 mr-1" /> ₹500</Button>
              <Button variant="outline" size="sm" onClick={() => setAmount("-49")}><Minus className="h-3 w-3 mr-1" /> ₹49</Button>
            </div>
            <Input placeholder="Amount (negative to debit)" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input placeholder="Reason (visible in transaction & audit)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={() => adjust.mutate()} disabled={adjust.isPending || !reason.trim()} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
              {adjust.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────────────────────── Platform Stats ─────────────────────────
function PlatformStatsTab() {
  const fetchStats = useServerFn(getPlatformStats);
  const fetch14d = useServerFn(getQueriesPerDay14d);
  const { data: stats } = useQuery({ queryKey: ["platform_stats"], queryFn: () => fetchStats() });
  const { data: chart } = useQuery({ queryKey: ["queries_14d"], queryFn: () => fetch14d() });
  return (
    <div className="space-y-4">
      <AiEngineHealthCheck />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "AI Reports", value: stats?.aiReports ?? 0 },
          { label: "Text Answers", value: stats?.textAnswers ?? 0 },
          { label: "Video Answers", value: stats?.videoAnswers ?? 0 },
          { label: "Avg time → expert", value: stats ? `${stats.avgHoursToExpert}h` : "—" },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">{c.label}</p>
            <p className="font-display text-2xl mt-1">{c.value}</p>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <p className="font-display text-lg">Queries per day · last 14 days</p>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart ?? []}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

// ───────────────────────── Page ─────────────────────────
export default function SuperAdmin() {
  const fetchStats = useServerFn(getAdminOverviewStats);
  const { data: overview } = useQuery({ queryKey: ["admin_overview"], queryFn: () => fetchStats() });
  const pendingCount = overview?.pendingApplications ?? 0;

  return (
    <AdminShell title="Super Admin Console">
      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="applications" className="gap-1.5 relative">
            <Users className="h-3.5 w-3.5" /> Analyst Applications
            {pendingCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold">{pendingCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="queries" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> All Queries</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" /> All Users</TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Platform Stats</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="applications"><AnalystApplicationsTab /></TabsContent>
        <TabsContent value="queries"><AllQueriesTab /></TabsContent>
        <TabsContent value="users"><AllUsersTab /></TabsContent>
        <TabsContent value="stats"><PlatformStatsTab /></TabsContent>
      </Tabs>
    </AdminShell>
  );
}
