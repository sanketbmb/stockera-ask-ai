import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Sparkles, Video, Package } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const PRESETS = [99, 199, 499, 999];
const POSITIVE_TYPES = new Set(["credit", "signup_bonus", "referral_bonus"]);

export default function WalletPage() {
  const { user, profile, refresh } = useAuth();
  const qc = useQueryClient();
  const [amount, setAmount] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ["wallet-txns", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("wallet_transactions")
        .select("id, amount, type, description, balance_after, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const onAddReal = () => toast.info("Razorpay / UPI integration coming soon");

  const onAddDemo = async () => {
    setAdding(true);
    try {
      const { data, error } = await supabase.rpc("add_demo_credits", { _amount: 100 });
      if (error) throw error;
      const res = data as { success: boolean; new_balance?: number; error?: string };
      if (!res.success) throw new Error(res.error ?? "Top-up failed");
      toast.success(`Added ₹100 demo credits. New balance: ₹${res.new_balance}`);
      await refresh();
      qc.invalidateQueries({ queryKey: ["wallet-txns", user?.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Top-up failed");
    } finally {
      setAdding(false);
    }
  };

  return (
    <AppShell title="Wallet">
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6 mb-6">
        <Card className="p-8 bg-gradient-to-br from-primary via-primary to-accent text-primary-foreground border-0 shadow-elegant">
          <p className="font-mono text-xs uppercase tracking-widest opacity-80">Current Balance</p>
          <p className="font-mono text-5xl md:text-6xl mt-2 font-semibold tracking-tight">₹{profile?.wallet_balance ?? 0}</p>
          <p className="mt-3 text-sm opacity-90">Use credits for AI reports (₹49) and SEBI expert video answers (₹149).</p>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-xl">Add credits</h2>
          <div className="grid grid-cols-4 gap-2 mt-4">
            {PRESETS.map((n) => (
              <button
                key={n}
                onClick={() => setAmount(String(n))}
                className={`rounded-lg border px-3 py-2 text-sm font-mono transition ${amount === String(n) ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}
              >₹{n}</button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input placeholder="Custom amount" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button onClick={onAddReal} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">Add via UPI</Button>
          </div>
          <Button onClick={onAddDemo} disabled={adding} variant="outline" className="w-full mt-3 border-dashed">
            {adding ? "Adding…" : "Add ₹100 Demo Credits"}
          </Button>
        </Card>
      </div>

      <section className="grid sm:grid-cols-3 gap-3 mb-6">
        <Pack icon={<Sparkles className="h-4 w-4" />} title="AI Report" price="₹49" desc="Structured Gemini analysis" />
        <Pack icon={<Video className="h-4 w-4" />} title="Video Answer" price="₹149" desc="SEBI analyst within 24h" />
        <Pack icon={<Package className="h-4 w-4" />} title="Bundle: 3 AI + 1 Video" price="₹199" desc="Save ₹98" highlight />
      </section>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-display text-xl">Transaction History</h2>
        </div>
        {isLoading ? (
          <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : txns.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.map((t) => {
                  const positive = POSITIVE_TYPES.has(t.type);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(t.created_at as string), "d MMM, HH:mm")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] capitalize ${positive ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300" : "border-red-500/30 text-red-700 dark:text-red-300"}`}>
                          {t.type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{t.description}</TableCell>
                      <TableCell className={`text-right font-mono text-sm ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {positive ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}
                        {" "}{positive ? "+" : ""}{t.amount}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">₹{t.balance_after}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}

function Pack({ icon, title, price, desc, highlight }: { icon: React.ReactNode; title: string; price: string; desc: string; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}<span className="uppercase tracking-wider">{title}</span></div>
      <p className="font-display text-2xl mt-1">{price}</p>
      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
    </Card>
  );
}
