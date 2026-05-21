import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, PauseCircle, Wallet, Users, FileText, Activity, Plus, Minus } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

function PlatformStats() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform_stats"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [usersC, queriesC, answeredC, pendingC, aiC, revRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("queries").select("id", { count: "exact", head: true }),
        supabase.from("answers").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
        supabase.from("queries").select("id", { count: "exact", head: true }).in("status", ["pending", "ai_answered"]),
        supabase.from("queries").select("id", { count: "exact", head: true }).not("ai_report", "is", null),
        supabase.from("wallet_transactions").select("amount").eq("type", "debit"),
      ]);
      const revenue = (revRes.data ?? []).reduce((s, r) => s + Math.abs(r.amount ?? 0), 0);
      return {
        users: usersC.count ?? 0,
        queries: queriesC.count ?? 0,
        answered: answeredC.count ?? 0,
        pending: pendingC.count ?? 0,
        ai: aiC.count ?? 0,
        revenue,
      };
    },
  });

  if (isLoading) return <Skeleton className="h-40" />;

  const cards = [
    { label: "Total Users", value: data?.users, Icon: Users },
    { label: "Total Queries", value: data?.queries, Icon: FileText },
    { label: "Answered Today", value: data?.answered, Icon: CheckCircle2 },
    { label: "Pending", value: data?.pending, Icon: Activity },
    { label: "AI Reports Generated", value: data?.ai, Icon: Activity },
    { label: "Revenue", value: `₹${data?.revenue ?? 0}`, Icon: Wallet },
  ];

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {cards.map(({ label, value, Icon }) => (
        <Card key={label} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">{label}</p>
              <p className="font-display text-2xl mt-1">{value ?? "—"}</p>
            </div>
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function AllQueriesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin_all_queries"],
    queryFn: async () => {
      const { data } = await supabase
        .from("queries")
        .select("id, stock_name, status, assigned_analyst_id, ai_report, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  if (isLoading) return <Skeleton className="h-60" />;

  return (
    <Card className="p-0 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>AI</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="font-mono text-[10px]">{q.id.slice(0, 8)}</TableCell>
              <TableCell className="font-medium">{q.stock_name}</TableCell>
              <TableCell><Badge variant="outline" className="text-[10px] capitalize">{q.status?.replace(/_/g, " ")}</Badge></TableCell>
              <TableCell className="font-mono text-[10px]">{q.assigned_analyst_id?.slice(0, 8) ?? "—"}</TableCell>
              <TableCell>{q.ai_report ? <Badge className="bg-primary/10 text-primary border-primary/30">yes</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
              <TableCell className="text-xs">{format(new Date(q.created_at!), "MMM d, HH:mm")}</TableCell>
            </TableRow>
          ))}
          {!data?.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No queries</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}

function AnalystManagementTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin_analysts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("analyst_profiles")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { is_approved?: boolean; is_available?: boolean } }) => {
      const { error } = await supabase.from("analyst_profiles").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Analyst updated");
      qc.invalidateQueries({ queryKey: ["admin_analysts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-60" />;

  return (
    <Card className="p-0 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Analyst</TableHead>
            <TableHead>SEBI</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Approved</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead>Sessions</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={a.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">{a.display_name.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{a.display_name}</span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-[10px]">{a.sebi_reg_number}</TableCell>
              <TableCell>{a.sebi_type}</TableCell>
              <TableCell>
                {a.is_approved ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Yes</Badge> : <Badge variant="outline">Pending</Badge>}
              </TableCell>
              <TableCell className="font-mono text-xs">{Number(a.rating ?? 0).toFixed(1)}</TableCell>
              <TableCell className="font-mono text-xs">{a.total_sessions ?? 0}</TableCell>
              <TableCell className="text-right space-x-1">
                {!a.is_approved && (
                  <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: a.id, patch: { is_approved: true, is_available: true } })}>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  </Button>
                )}
                {a.is_approved && (
                  <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: a.id, patch: { is_approved: false } })}>
                    <XCircle className="h-4 w-4 text-red-600" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: a.id, patch: { is_available: !a.is_available } })}>
                  <PauseCircle className="h-4 w-4 text-amber-600" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!data?.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No analyst profiles yet</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}

interface AdjustTarget { id: string; name: string }

function UsersTab() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<AdjustTarget | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin_users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, wallet_balance, referral_code, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const adjust = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("No target");
      const amt = parseInt(amount, 10);
      if (!amt) throw new Error("Enter an amount");
      const { data, error } = await supabase.rpc("admin_adjust_wallet", {
        _target_user_id: target.id,
        _amount: amt,
        _reason: reason || "no reason",
      });
      if (error) throw error;
      const res = data as { success: boolean; error?: string; new_balance?: number };
      if (!res.success) throw new Error(res.error ?? "Failed");
      return res.new_balance;
    },
    onSuccess: (bal) => {
      toast.success(`New balance ₹${bal}`);
      qc.invalidateQueries({ queryKey: ["admin_users"] });
      setTarget(null);
      setAmount("");
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-60" />;

  return (
    <>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>Referral</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={u.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">{(u.full_name ?? "U").slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{u.full_name ?? "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs">{u.created_at ? format(new Date(u.created_at), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell className="font-mono text-xs">₹{u.wallet_balance ?? 0}</TableCell>
                <TableCell className="font-mono text-[10px]">{u.referral_code ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setTarget({ id: u.id, name: u.full_name ?? "user" })}>
                    Adjust wallet
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!data?.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No users</TableCell></TableRow>}
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
            <Input placeholder="Reason (visible in transaction)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={() => adjust.mutate()} disabled={adjust.isPending} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
              {adjust.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AiEngineHealthCheck() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
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
      try { setResult(JSON.parse(txt)); }
      catch { setResult({ raw: txt, http_status: res.status }); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const env = (result?.env_check ?? {}) as Record<string, boolean>;
  const tables = (result?.tables_check ?? {}) as Record<string, boolean>;

  return (
    <Card className="p-4 border-amber-500/50 bg-amber-500/5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">⚠️ REQUIRED SETUP</p>
          <p className="text-xs text-muted-foreground mt-1">
            Go to <strong>Supabase Dashboard → Project Settings → Edge Functions → Secrets</strong> and add <code className="font-mono bg-muted px-1 rounded">GEMINI_API_KEY</code> from <a className="underline" href="https://aistudio.google.com" target="_blank" rel="noreferrer">aistudio.google.com</a>. Without this, AI reports cannot generate.
          </p>
        </div>
        <Button onClick={run} disabled={loading} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Test AI Report Engine
        </Button>
      </div>
      {error && <p className="text-xs text-destructive mt-3">{error}</p>}
      {result && (
        <div className="mt-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(env).map(([k, v]) => (
              <Badge key={k} variant={v ? "default" : "destructive"} className="justify-start font-mono">
                {v ? "✓" : "✗"} {k}
              </Badge>
            ))}
            {Object.entries(tables).map(([k, v]) => (
              <Badge key={k} variant={v ? "default" : "destructive"} className="justify-start font-mono">
                {v ? "✓" : "✗"} {k}
              </Badge>
            ))}
          </div>
          <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-40">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </Card>
  );
}

export default function SuperAdmin() {
  return (
    <AdminShell title="Super Admin Console">
      <div className="space-y-4">
        <AiEngineHealthCheck />
        <Tabs defaultValue="stats" className="space-y-4">
          <TabsList>
            <TabsTrigger value="stats">Platform Stats</TabsTrigger>
            <TabsTrigger value="queries">All Queries</TabsTrigger>
            <TabsTrigger value="analysts">Analysts</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>
          <TabsContent value="stats"><PlatformStats /></TabsContent>
          <TabsContent value="queries"><AllQueriesTab /></TabsContent>
          <TabsContent value="analysts"><AnalystManagementTab /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
        </Tabs>
      </div>
    </AdminShell>
  );
}
