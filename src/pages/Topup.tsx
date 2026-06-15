import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, Video, Zap, Check, Info } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWalletBalance, formatPoints } from "@/lib/points";
import { track, trackPageView } from "@/lib/analytics";

interface TopupTier {
  inr: number;
  credits: number;
}

interface TopupTiersConfig {
  tiers: TopupTier[];
  custom: { min_inr: number; max_inr: number };
}

interface FirstTopupBonusConfig {
  active: boolean;
  free_video: boolean;
  min_topup_inr: number;
  within_hours: number;
}

const FALLBACK_TIERS: TopupTiersConfig = {
  tiers: [
    { inr: 100, credits: 100 },
    { inr: 250, credits: 275 },
    { inr: 500, credits: 575 },
    { inr: 1000, credits: 1150 },
  ],
  custom: { min_inr: 50, max_inr: 10000 },
};

const FALLBACK_BONUS: FirstTopupBonusConfig = {
  active: false,
  free_video: false,
  min_topup_inr: 500,
  within_hours: 24,
};

async function fetchTopupConfig(): Promise<{ tiers: TopupTiersConfig; bonus: FirstTopupBonusConfig }> {
  try {
    const { data, error } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_key, config_value")
      .in("config_key", ["topup_tiers", "first_topup_bonus"]);
    if (error || !data) return { tiers: FALLBACK_TIERS, bonus: FALLBACK_BONUS };

    let tiers = FALLBACK_TIERS;
    let bonus = FALLBACK_BONUS;

    for (const row of data as Array<{ config_key: string; config_value: unknown }>) {
      if (row.config_key === "topup_tiers" && row.config_value && typeof row.config_value === "object") {
        const v = row.config_value as Record<string, unknown>;
        const tierArr = Array.isArray(v.tiers) ? v.tiers : [];
        const parsed: TopupTier[] = tierArr
          .map((t) => {
            if (!t || typeof t !== "object") return null;
            const inr = Number((t as Record<string, unknown>).inr);
            const credits = Number((t as Record<string, unknown>).credits);
            if (!Number.isFinite(inr) || !Number.isFinite(credits)) return null;
            return { inr, credits };
          })
          .filter((t): t is TopupTier => t !== null);
        const custom = v.custom && typeof v.custom === "object" ? (v.custom as Record<string, unknown>) : {};
        const min_inr = Number(custom.min_inr);
        const max_inr = Number(custom.max_inr);
        tiers = {
          tiers: parsed.length > 0 ? parsed : FALLBACK_TIERS.tiers,
          custom: {
            min_inr: Number.isFinite(min_inr) ? min_inr : FALLBACK_TIERS.custom.min_inr,
            max_inr: Number.isFinite(max_inr) ? max_inr : FALLBACK_TIERS.custom.max_inr,
          },
        };
      } else if (row.config_key === "first_topup_bonus" && row.config_value && typeof row.config_value === "object") {
        const v = row.config_value as Record<string, unknown>;
        bonus = {
          active: v.active === true,
          free_video: v.free_video === true,
          min_topup_inr: Number.isFinite(Number(v.min_topup_inr)) ? Number(v.min_topup_inr) : FALLBACK_BONUS.min_topup_inr,
          within_hours: Number.isFinite(Number(v.within_hours)) ? Number(v.within_hours) : FALLBACK_BONUS.within_hours,
        };
      }
    }
    return { tiers, bonus };
  } catch {
    return { tiers: FALLBACK_TIERS, bonus: FALLBACK_BONUS };
  }
}

export default function TopupPage() {
  const { user } = useAuth();
  const { data: walletBalance } = useWalletBalance(user?.id);
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["topup-config"],
    queryFn: fetchTopupConfig,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const [selectedInr, setSelectedInr] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState<string>("");
  const abandonedRef = useRef(false);
  const trackedMountRef = useRef(false);

  useEffect(() => {
    if (trackedMountRef.current) return;
    trackedMountRef.current = true;
    void trackPageView();
    void track("topup_initiated", {
      current_balance: walletBalance?.balance ?? 0,
      source: "wallet_cta",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (!abandonedRef.current) {
        void track("topup_abandoned", {
          selected_inr: selectedInr,
          had_custom: customAmount.trim().length > 0,
        });
      }
    };
  }, [selectedInr, customAmount]);

  const activeInr = useMemo<number | null>(() => {
    if (selectedInr !== null) return selectedInr;
    const n = Number(customAmount);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }, [selectedInr, customAmount]);

  const activeCredits = useMemo<number | null>(() => {
    if (activeInr === null || !config) return null;
    const exact = config.tiers.tiers.find((t) => t.inr === activeInr);
    if (exact) return exact.credits;
    return activeInr;
  }, [activeInr, config]);

  const qualifiesForBonus = useMemo<boolean>(() => {
    if (!config || !activeInr) return false;
    return config.bonus.active && config.bonus.free_video && activeInr >= config.bonus.min_topup_inr;
  }, [config, activeInr]);

  const customNum = Number(customAmount);
  const customValid =
    customAmount.trim() === "" ||
    (Number.isFinite(customNum) &&
      config !== undefined &&
      customNum >= config.tiers.custom.min_inr &&
      customNum <= config.tiers.custom.max_inr);

  const handlePresetSelect = (inr: number, credits: number) => {
    setSelectedInr(inr);
    setCustomAmount("");
    void track("topup_tier_selected", { tier_inr: inr, tier_credits: credits, kind: "preset" });
  };

  const handleCustomChange = (v: string) => {
    setCustomAmount(v);
    setSelectedInr(null);
  };

  const handleCustomCommit = () => {
    const n = Number(customAmount);
    if (Number.isFinite(n) && n > 0 && customValid && config) {
      void track("topup_tier_selected", { tier_inr: Math.floor(n), tier_credits: Math.floor(n), kind: "custom" });
    }
  };

  return (
    <AppShell title="Top up">
      <div className="mb-4">
        <Link to="/wallet" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to wallet
        </Link>
      </div>

      <Card className="p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Current balance</p>
          <p className="font-display text-2xl tabular-nums">{formatPoints(walletBalance?.balance ?? 0)}</p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">1 ₹ = 1 credit (base)</Badge>
      </Card>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <Card className="p-6">
          <h2 className="font-display text-xl">Choose an amount</h2>
          <p className="text-sm text-muted-foreground mt-1">Bigger top-ups include bonus credits.</p>

          {configLoading || !config ? (
            <div className="grid grid-cols-2 gap-3 mt-5">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mt-5">
                {config.tiers.tiers.map((tier) => {
                  const active = selectedInr === tier.inr;
                  const bonus = tier.credits - tier.inr;
                  return (
                    <button
                      key={tier.inr}
                      onClick={() => handlePresetSelect(tier.inr, tier.credits)}
                      className={`text-left rounded-xl border p-4 transition ${
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Pay</p>
                      <p className="font-display text-2xl tabular-nums">₹{tier.inr.toLocaleString("en-IN")}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="font-mono text-sm text-primary tabular-nums">
                          Get {tier.credits.toLocaleString("en-IN")} credits
                        </p>
                        {bonus > 0 && (
                          <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                            +{bonus} bonus
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5">
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Or enter a custom amount (₹{config.tiers.custom.min_inr.toLocaleString("en-IN")} – ₹{config.tiers.custom.max_inr.toLocaleString("en-IN")})
                </label>
                <div className="flex items-center gap-2 mt-2">
                  <span className="font-mono text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="500"
                    value={customAmount}
                    onChange={(e) => handleCustomChange(e.target.value)}
                    onBlur={handleCustomCommit}
                    min={config.tiers.custom.min_inr}
                    max={config.tiers.custom.max_inr}
                    className={!customValid ? "border-red-500/50" : ""}
                  />
                </div>
                {!customValid && customAmount.trim() !== "" && (
                  <p className="text-xs text-red-600 mt-1">
                    Enter a value between ₹{config.tiers.custom.min_inr} and ₹{config.tiers.custom.max_inr}.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">
                  Custom amounts get 1 credit per ₹1 (no bonus). Use a preset for bonus credits.
                </p>
              </div>
            </>
          )}
        </Card>

        <Card className="p-6 h-fit lg:sticky lg:top-6">
          <h2 className="font-display text-xl">Summary</h2>

          {activeInr === null || activeCredits === null ? (
            <div className="mt-4 p-6 rounded-lg border border-dashed border-border text-center">
              <p className="text-sm text-muted-foreground">Select an amount to continue.</p>
            </div>
          ) : (
            <>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">You pay</span>
                  <span className="font-mono tabular-nums">₹{activeInr.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">You receive</span>
                  <span className="font-mono tabular-nums text-primary">{formatPoints(activeCredits)}</span>
                </div>
                {activeCredits > activeInr && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Bonus
                    </span>
                    <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                      +{(activeCredits - activeInr).toLocaleString("en-IN")} credits
                    </span>
                  </div>
                )}

                {qualifiesForBonus && (
                  <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-start gap-2">
                      <Video className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-primary">First top-up bonus</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          One free SEBI analyst video answer with this top-up (within {config?.bonus.within_hours ?? 24}h).
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block w-full mt-5">
                      <Button
                        disabled
                        className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground opacity-60"
                      >
                        <Zap className="h-4 w-4 mr-2" /> Pay ₹{activeInr.toLocaleString("en-IN")} (Coming soon)
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Razorpay UPI / cards / net banking launching soon.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <p className="text-[10px] text-center text-muted-foreground mt-2 flex items-center justify-center gap-1">
                <Info className="h-3 w-3" /> Payment gateway integration in progress.
              </p>
            </>
          )}

          <div className="mt-6 pt-6 border-t border-border space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3 w-3 text-emerald-600" /> Credits never expire (except welcome bonus)
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3 w-3 text-emerald-600" /> Use for AI reports, analyst videos, live sessions
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3 w-3 text-emerald-600" /> SEBI-registered analyst answers
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
