import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Sparkles, Video, Mic, AlertCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useWalletBalance,
  useActionCosts,
  useWalletRealtime,
  formatPoints,
  isPromoActive,
  type ActionCost,
} from "@/lib/points";
import { track, trackPageView } from "@/lib/analytics";

const ENTRY_LABELS: Record<string, string> = {
  welcome_bonus: "Welcome bonus",
  welcome_expired: "Welcome bonus expired",
  topup: "Top-up",
  topup_bonus: "Top-up bonus",
  first_topup_free_video: "First top-up free video",
  subscription_grant: "Subscription credit",
  subscription_rollover_capped: "Subscription rollover (capped)",
  referral_referrer: "Referral reward",
  referral_referee: "Referral bonus",
  debit_ai_report: "AI report",
  debit_video_answer: "Video answer",
  debit_live_session: "Live session",
  debit_sector_view: "Sector view",
  debit_stock_picker: "Stock picker",
  admin_grant: "Admin grant",
  admin_revoke: "Admin revoke",
  refund_quality: "Quality refund",
  refund_failed_action: "Failed action refund",
};

function describeEntry(entry_type: string): string {
  return (
    ENTRY_LABELS[entry_type] ??
    entry_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export default function WalletPage() {
  const { user } = useAuth();

  const {
    data: walletBalance,
    isLoading: balanceLoading,
    error: balanceError,
    refetch: refetchBalance,
  } = useWalletBalance(user?.id);

  const { data: actionCosts } = useActionCosts();

  useWalletRealtime(user?.id);

  const {
    data: ledger = [],
    isLoading: ledgerLoading,
    error: ledgerError,
    refetch: refetchLedger,
  } = useQuery({
    queryKey: ["wallet-ledger", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_ledger")
        .select("id, entry_type, amount, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const trackedRef = useRef(false);
  useEffect(() => {
    if (!user?.id || trackedRef.current) return;
    if (balanceLoading) return;
    trackedRef.current = true;
    void trackPageView();
    void track("wallet_viewed", {
      balance: walletBalance?.balance ?? 0,
      has_welcome_bonus: (walletBalance?.welcome_bonus_remaining ?? 0) > 0,
    });
  }, [user?.id, balanceLoading, walletBalance]);

  if (!user) {
    return (
      <AppShell title="Wallet">
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">Please sign in to view your wallet.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Wallet">
      {balanceError && (
        <Card className="p-4 mb-4 border-red-500/30 bg-red-500/5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-700 dark:text-red-300">Couldn't load wallet balance.</p>
            <Button variant="outline" size="sm" onClick={() => void refetchBalance()}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6 mb-6">
        <Card className="p-8 bg-gradient-to-br from-primary via-primary to-accent text-primary-foreground border-0 shadow-elegant">
          <p className="font-mono text-xs uppercase tracking-widest opacity-80">Current Balance</p>
          {balanceLoading ? (
            <Skeleton className="h-16 w-40 mt-2 bg-white/20" />
          ) : (
            <>
              <div className="flex items-baseline gap-3 mt-2">
                <p className="font-mono text-5xl md:text-6xl font-semibold tracking-tight tabular-nums">
                  {(walletBalance?.balance ?? 0).toLocaleString("en-IN")}
                </p>
                <p className="text-lg opacity-80">credits</p>
              </div>
              {(walletBalance?.welcome_bonus_remaining ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="outline" className="bg-white/10 border-white/30 text-white text-xs">
                    {walletBalance!.welcome_bonus_remaining} welcome{" "}
                    {walletBalance!.welcome_bonus_remaining === 1 ? "credit" : "credits"} remaining
                  </Badge>
                  {(() => {
                    const exp = walletBalance?.welcome_bonus_expires_at;
                    if (!exp) return null;
                    const days = Math.ceil((Date.parse(exp) - Date.now()) / 86400000);
                    if (days <= 0 || days > 7) return null;
                    return (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/20 border-amber-300/40 text-amber-100 text-xs"
                      >
                        <AlertCircle className="h-3 w-3 mr-1 inline" />
                        Expires in {days} {days === 1 ? "day" : "days"}
                      </Badge>
                    );
                  })()}
                </div>
              )}
              <p className="mt-3 text-sm opacity-90">
                Use credits for AI reports, SEBI analyst videos, and live sessions.
              </p>
            </>
          )}
        </Card>

        <Card className="p-6 flex flex-col justify-center">
          <h2 className="font-display text-xl">Add credits</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Top up to ask more questions and book analyst videos.
          </p>
          <Button
            asChild
            className="mt-4 bg-gradient-to-r from-primary to-accent text-primary-foreground"
            onClick={() => void track("cta_click", { cta: "add_credits", source: "wallet_page" })}
          >
            <Link to="/topup">Add Credits →</Link>
          </Button>
          <p className="text-xs text-muted-foreground mt-2 text-center">UPI · Cards · Net banking</p>
        </Card>
      </div>

      <section className="grid sm:grid-cols-3 gap-3 mb-6">
        <ActionTile
          icon={<Sparkles className="h-4 w-4" />}
          title="AI Report"
          cost={actionCosts?.ai_report}
          desc="Structured Gemini analysis"
        />
        <ActionTile
          icon={<Video className="h-4 w-4" />}
          title="Video Answer"
          cost={actionCosts?.video_answer}
          desc="SEBI analyst within 24h"
        />
        <ActionTile
          icon={<Mic className="h-4 w-4" />}
          title="Live Session"
          cost={actionCosts?.live_session}
          desc="30-min 1:1 with analyst"
        />
      </section>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-display text-xl">Transaction History</h2>
        </div>
        {ledgerLoading ? (
          <div className="p-5 space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : ledgerError ? (
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground mb-3">Couldn't load transactions.</p>
            <Button variant="outline" size="sm" onClick={() => void refetchLedger()}>
              Retry
            </Button>
          </div>
        ) : ledger.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              <Link to="/topup" className="text-primary hover:underline">
                Top up
              </Link>{" "}
              to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((t) => {
                  const positive = t.amount > 0;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(t.created_at), "d MMM, HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] capitalize ${
                            positive
                              ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                              : "border-red-500/30 text-red-700 dark:text-red-300"
                          }`}
                        >
                          {positive ? "credit" : "debit"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{describeEntry(t.entry_type)}</TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm tabular-nums ${
                          positive
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {positive ? (
                          <ArrowUpRight className="h-3 w-3 inline" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 inline" />
                        )}{" "}
                        {positive ? "+" : ""}
                        {t.amount.toLocaleString("en-IN")}
                      </TableCell>
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

function ActionTile({
  icon,
  title,
  cost,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  cost: ActionCost | undefined;
  desc: string;
}) {
  if (!cost) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          <span className="uppercase tracking-wider">{title}</span>
        </div>
        <Skeleton className="h-7 w-20 mt-2" />
        <p className="text-xs text-muted-foreground mt-1">{desc}</p>
      </Card>
    );
  }

  const promo = isPromoActive(cost);
  return (
    <Card className={`p-4 ${promo ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {icon}
        <span className="uppercase tracking-wider">{title}</span>
        {promo && (
          <Badge variant="outline" className="ml-auto text-[9px] border-primary/40 text-primary">
            LAUNCH
          </Badge>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="font-display text-2xl tabular-nums">{formatPoints(cost.effective_points)}</p>
        {promo && cost.regular_points !== cost.effective_points && (
          <p className="font-mono text-sm text-muted-foreground line-through tabular-nums">
            {formatPoints(cost.regular_points)}
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
    </Card>
  );
}
