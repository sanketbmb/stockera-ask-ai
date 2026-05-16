import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Copy, MessageCircle, Share2, Gift, Users, IndianRupee, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

function maskName(s: string | null): string {
  if (!s) return "Anonymous";
  const first = s.trim().split(" ")[0] ?? "User";
  if (first.length <= 3) return first + "***";
  return first.slice(0, 3) + "***";
}

export default function ReferralPage() {
  const { user, profile } = useAuth();
  const [origin, setOrigin] = useState<string>(() => (typeof window !== "undefined" ? window.location.origin : ""));
  useState(() => { if (typeof window !== "undefined") setOrigin(window.location.origin); return null; });
  const code = profile?.referral_code ?? "";
  const link = useMemo(() => (code && origin ? `${origin}/signup?ref=${code}` : ""), [origin, code]);

  const { data: refs = [], isLoading } = useQuery({
    queryKey: ["my-referrals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("referrals")
        .select("id, referred_id, status, payout, created_at")
        .eq("referrer_id", user!.id)
        .order("created_at", { ascending: false });
      if (!data?.length) return [];
      const ids = Array.from(new Set(data.map((r) => r.referred_id)));
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const nameMap = new Map((profs ?? []).map((p) => [p.id, p.full_name as string | null]));
      return data.map((r) => ({ ...r, name: maskName(nameMap.get(r.referred_id) ?? null) }));
    },
  });

  const credited = refs.filter((r) => r.status === "credited");
  const totalEarned = credited.reduce((s, r) => s + (r.payout ?? 0), 0);

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Referral link copied");
  };
  const onWhatsapp = () => {
    const msg = `Try Ask The Expert by Stockera — get an instant AI report and SEBI-registered analyst answer for your stocks. Sign up with my link: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };
  const onShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "Stockera", text: "Get stock AI reports & SEBI expert answers", url: link }); } catch { /* ignore */ }
    } else copy();
  };

  return (
    <AppShell title="Refer & Earn">
      <Card className="p-6 md:p-8 bg-gradient-to-br from-primary/10 via-card to-accent/5 border-primary/20">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">Your referral link</p>
        <h2 className="font-display text-2xl mt-1">Earn ₹50 for every friend who joins</h2>
        <div className="mt-4 flex gap-2 flex-wrap">
          <Input readOnly value={link || "Generating…"} className="font-mono text-sm bg-background" />
          <Button onClick={copy} variant="outline"><Copy className="h-4 w-4 mr-1" /> Copy</Button>
          <Button onClick={onWhatsapp} className="bg-emerald-600 hover:bg-emerald-700 text-white"><MessageCircle className="h-4 w-4 mr-1" /> WhatsApp</Button>
          <Button onClick={onShare} variant="outline"><Share2 className="h-4 w-4 mr-1" /> Share</Button>
        </div>
      </Card>

      <section className="grid sm:grid-cols-3 gap-3 mt-6">
        <Stat icon={<Users className="h-4 w-4" />} label="Total referrals" value={refs.length} />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Credited" value={credited.length} />
        <Stat icon={<IndianRupee className="h-4 w-4" />} label="Total earned" value={`₹${totalEarned}`} highlight />
      </section>

      <Card className="mt-6 p-6">
        <h3 className="font-display text-xl mb-4">How it works</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { n: 1, t: "Share your link", d: "Send to friends via WhatsApp or social" },
            { n: 2, t: "Friend signs up", d: "Joins Stockera and gets ₹100 wallet" },
            { n: 3, t: "You earn ₹50", d: "Credited after their first AI report" },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border border-border bg-background/60 p-4">
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground font-display flex items-center justify-center mb-2">{s.n}</div>
              <p className="font-semibold text-sm">{s.t}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.d}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6 p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Gift className="h-4 w-4 text-primary" />
          <h3 className="font-display text-xl">Your Referrals</h3>
        </div>
        {isLoading ? (
          <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : refs.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No referrals yet. Share your link to get started.</p>
        ) : (
          <ul className="divide-y divide-border">
            {refs.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">{format(new Date(r.created_at as string), "d MMM yyyy")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] capitalize ${r.status === "credited" ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300" : "border-yellow-500/30 text-yellow-700 dark:text-yellow-300"}`}>
                    {r.status}
                  </Badge>
                  <span className="font-mono text-sm">₹{r.payout ?? 50}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}

function Stat({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number | string; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}<span className="uppercase tracking-wider">{label}</span></div>
      <p className="font-display text-2xl mt-1">{value}</p>
    </Card>
  );
}
