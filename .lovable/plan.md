# W6 — Pricing Page Cutover (`src/pages/Pricing.tsx`)

## Scope
Full replacement of `src/pages/Pricing.tsx`. Switch from hardcoded tiers to reading W1's `public.subscription_plans` table + `stock_picker_runtime_config.welcome_bonus`. Three tiers (Free/Pro/Expert). Monthly/Annual toggle. Paid Subscribe buttons disabled with "Coming soon" tooltip.

**Files modified:** exactly 1 — `src/pages/Pricing.tsx` (full replacement)
**Files untouched:** `src/routes/pricing.tsx`, AppShell, AuthContext, points.ts, analytics.ts, migrations, edge functions.
**New deps:** none.

## Diff summary

- **Remove:** `useState`-only import, `Switch`, `Accordion*`, `Zap`, `cn`, the hardcoded `tiers` array, the `faqs` array, the `price()`/`cadence()` helpers, the old `<>...</>` two-section layout.
- **Add:** `useEffect/useMemo/useRef/useState`, `useQuery`, `Card`, `Badge`, `Skeleton`, `Tooltip*`, `AppShell`, `supabase`, `useAuth`, `track`/`trackPageView`, `formatPoints` import path retained-free (only used inline), types `BillingCycle`/`PlanRow`/`WelcomeBonus`/`PricingData`, `FALLBACK_PLANS`, `FALLBACK_WELCOME`, `fetchPricingData()`, new `PricingPage` component with billing toggle, plans grid backed by query, topup nudge, SEBI disclaimer.

## Acceptance checklist (matches request)
- One file modified
- Reads `public.subscription_plans` table (not config key) + welcome_bonus config
- Defensive parse + fallbacks
- Free CTA: `Link to="/dashboard"` (auth) or `/login` (anon)
- Paid CTAs: disabled Button wrapped in Tooltip ("Subscription billing launching soon — top up credits for now.")
- Monthly/Annual toggle fires `cta_click` with `billing_cycle_toggle`
- Annual cards show "≈ ₹X/month" derived
- Pro = ring + "Most Popular"; Expert = gradient + "Best Value"; Free = welcome credits + expiry copy
- Analytics: `trackPageView`, `pricing_viewed` (once), `plan_selected` on every CTA (incl. disabled), `cta_click` on toggle + topup nudge
- No RPC, no Razorpay, no wallet reads, no react-router-dom
- `Link` from `@tanstack/react-router`, `AppShell` named import, `export default function PricingPage()`

## Full file contents — `src/pages/Pricing.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Sparkles, Crown } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { track, trackPageView } from "@/lib/analytics";
import { formatPoints } from "@/lib/points";

type BillingCycle = "monthly" | "annual";

interface PlanRow {
  id: string;
  display_name: string;
  monthly_inr: number;
  annual_inr: number;
  monthly_points: number;
  rollover_cap_points: number;
  free_video_count: number;
  free_live_count: number;
  is_active: boolean;
  sort_order: number;
}

interface WelcomeBonus {
  points: number;
  expiry_days: number;
}

interface PricingData {
  plans: PlanRow[];
  welcome: WelcomeBonus;
}

const FALLBACK_PLANS: PlanRow[] = [
  {
    id: "free", display_name: "Free", monthly_inr: 0, annual_inr: 0,
    monthly_points: 0, rollover_cap_points: 0,
    free_video_count: 0, free_live_count: 0,
    is_active: true, sort_order: 1,
  },
  {
    id: "pro", display_name: "Pro", monthly_inr: 299, annual_inr: 2699,
    monthly_points: 400, rollover_cap_points: 800,
    free_video_count: 1, free_live_count: 0,
    is_active: true, sort_order: 2,
  },
  {
    id: "expert", display_name: "Expert", monthly_inr: 799, annual_inr: 7199,
    monthly_points: 1200, rollover_cap_points: 2400,
    free_video_count: 2, free_live_count: 1,
    is_active: true, sort_order: 3,
  },
];

const FALLBACK_WELCOME: WelcomeBonus = { points: 250, expiry_days: 30 };

async function fetchPricingData(): Promise<PricingData> {
  try {
    const [plansRes, welcomeRes] = await Promise.all([
      supabase
        .from("subscription_plans")
        .select(
          "id, display_name, monthly_inr, annual_inr, monthly_points, rollover_cap_points, free_video_count, free_live_count, is_active, sort_order",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("stock_picker_runtime_config")
        .select("config_value")
        .eq("config_key", "welcome_bonus")
        .maybeSingle(),
    ]);

    let plans: PlanRow[] = FALLBACK_PLANS;
    if (!plansRes.error && Array.isArray(plansRes.data) && plansRes.data.length > 0) {
      const parsed: PlanRow[] = [];
      for (const row of plansRes.data as Array<Record<string, unknown>>) {
        const id = typeof row.id === "string" ? row.id : null;
        const display_name = typeof row.display_name === "string" ? row.display_name : null;
        const monthly_inr = Number(row.monthly_inr);
        const annual_inr = Number(row.annual_inr);
        const monthly_points = Number(row.monthly_points);
        const rollover_cap_points = Number(row.rollover_cap_points);
        const free_video_count = Number(row.free_video_count);
        const free_live_count = Number(row.free_live_count);
        const is_active = row.is_active === true;
        const sort_order = Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 99;
        if (
          !id || !display_name ||
          !Number.isFinite(monthly_inr) || !Number.isFinite(annual_inr) ||
          !Number.isFinite(monthly_points) || !Number.isFinite(rollover_cap_points) ||
          !Number.isFinite(free_video_count) || !Number.isFinite(free_live_count)
        ) continue;
        parsed.push({
          id, display_name,
          monthly_inr, annual_inr,
          monthly_points, rollover_cap_points,
          free_video_count, free_live_count,
          is_active, sort_order,
        });
      }
      if (parsed.length > 0) plans = parsed;
    }

    let welcome: WelcomeBonus = FALLBACK_WELCOME;
    if (
      !welcomeRes.error &&
      welcomeRes.data?.config_value &&
      typeof welcomeRes.data.config_value === "object"
    ) {
      const v = welcomeRes.data.config_value as Record<string, unknown>;
      const points = Number(v.points);
      const expiry_days = Number(v.expiry_days);
      if (Number.isFinite(points) && Number.isFinite(expiry_days)) {
        welcome = { points, expiry_days };
      }
    }

    return { plans, welcome };
  } catch {
    return { plans: FALLBACK_PLANS, welcome: FALLBACK_WELCOME };
  }
}

const COMING_SOON_COPY = "Subscription billing launching soon — top up credits for now.";

export default function PricingPage() {
  const { user } = useAuth();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const trackedMountRef = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ["pricing-data"],
    queryFn: fetchPricingData,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (trackedMountRef.current) return;
    if (!data) return;
    trackedMountRef.current = true;
    void trackPageView();
    void track("pricing_viewed", { plan_count: data.plans.length });
  }, [data]);

  const plans = data?.plans ?? FALLBACK_PLANS;
  const welcome = data?.welcome ?? FALLBACK_WELCOME;

  const handleCycleChange = (next: BillingCycle) => {
    if (next === cycle) return;
    setCycle(next);
    void track("cta_click", { cta: "billing_cycle_toggle", cycle: next });
  };

  const handlePlanSelect = (plan: PlanRow, isFree: boolean) => {
    void track("plan_selected", {
      plan_id: plan.id,
      plan_name: plan.display_name,
      billing_cycle: cycle,
      price_inr: cycle === "monthly" ? plan.monthly_inr : plan.annual_inr,
      monthly_points: plan.monthly_points,
      is_free: isFree,
    });
  };

  return (
    <AppShell title="Pricing">
      <TooltipProvider delayDuration={150}>
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="text-center">
            <h1 className="font-display text-3xl text-foreground md:text-4xl">
              Choose your plan
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
              Credits never expire (except welcome bonus). Cancel anytime.
            </p>

            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-card p-1 shadow-card">
              <button
                type="button"
                onClick={() => handleCycleChange("monthly")}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  cycle === "monthly"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => handleCycleChange("annual")}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  cycle === "annual"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Annual
              </button>
              {cycle === "annual" && (
                <Badge variant="secondary" className="ml-1 font-mono text-[10px] uppercase tracking-wider">
                  Save ~25%
                </Badge>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[460px] w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {plans.map((plan) => {
                const isFree = plan.monthly_inr === 0 && plan.annual_inr === 0;
                const priceInr = cycle === "monthly" ? plan.monthly_inr : plan.annual_inr;
                const Icon = plan.id === "expert" ? Crown : Sparkles;

                const cardClass =
                  plan.id === "pro"
                    ? "relative flex flex-col p-8 ring-2 ring-primary border-primary shadow-elegant"
                    : plan.id === "expert"
                      ? "relative flex flex-col p-8 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20"
                      : "relative flex flex-col p-8";

                const features: string[] = isFree
                  ? [
                      `${welcome.points} welcome credits`,
                      "AI reports & educational content",
                      `Welcome bonus expires in ${welcome.expiry_days} days`,
                    ]
                  : [
                      `${formatPoints(plan.monthly_points)} credits every month`,
                      `Rollover up to ${formatPoints(plan.rollover_cap_points)} credits`,
                      ...(plan.free_video_count > 0
                        ? [
                            `${plan.free_video_count} free SEBI analyst video${
                              plan.free_video_count === 1 ? "" : "s"
                            } / month`,
                          ]
                        : []),
                      ...(plan.free_live_count > 0
                        ? [
                            `${plan.free_live_count} free live session${
                              plan.free_live_count === 1 ? "" : "s"
                            } / month`,
                          ]
                        : []),
                      ...(plan.id === "pro" ? ["Priority queue & support"] : []),
                      ...(plan.id === "expert" ? ["Dedicated analyst support"] : []),
                    ];

                return (
                  <Card key={plan.id} className={cardClass}>
                    {plan.id === "pro" && (
                      <Badge className="absolute -top-3 right-4 bg-primary text-primary-foreground">
                        Most Popular
                      </Badge>
                    )}
                    {plan.id === "expert" && (
                      <Badge className="absolute -top-3 right-4 bg-accent text-accent-foreground">
                        Best Value
                      </Badge>
                    )}

                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <h2 className="font-display text-2xl text-foreground">{plan.display_name}</h2>
                    </div>

                    <div className="mt-6">
                      {isFree ? (
                        <div className="font-display text-5xl text-foreground">Free</div>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-1">
                            <span className="font-display text-5xl tabular-nums text-foreground">
                              ₹{priceInr.toLocaleString("en-IN")}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {cycle === "monthly" ? "/month" : "/year"}
                            </span>
                          </div>
                          {cycle === "annual" && plan.annual_inr > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              ≈ ₹{Math.round(plan.annual_inr / 12).toLocaleString("en-IN")}/month
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    <div className="mt-4">
                      {plan.monthly_points > 0 && (
                        <p className="font-mono text-sm text-primary">
                          {formatPoints(plan.monthly_points)}/month
                        </p>
                      )}
                      {plan.id === "free" && (
                        <p className="text-xs text-muted-foreground">
                          {welcome.points} welcome credits (expire in {welcome.expiry_days} days)
                        </p>
                      )}
                    </div>

                    <ul className="mt-6 space-y-3">
                      {features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                          <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8">
                      {isFree ? (
                        user ? (
                          <Button asChild className="w-full">
                            <Link to="/dashboard" onClick={() => handlePlanSelect(plan, true)}>
                              Get started
                            </Link>
                          </Button>
                        ) : (
                          <Button asChild className="w-full">
                            <Link to="/login" onClick={() => handlePlanSelect(plan, true)}>
                              Sign up free
                            </Link>
                          </Button>
                        )
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block w-full">
                              <Button
                                disabled
                                className="w-full opacity-60"
                                onClick={() => handlePlanSelect(plan, false)}
                              >
                                Subscribe (Coming soon)
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{COMING_SOON_COPY}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="mt-10 text-center text-sm text-muted-foreground">
            Don't want a subscription?{" "}
            <Link
              to="/topup"
              className="text-primary hover:underline"
              onClick={() =>
                void track("cta_click", {
                  cta: "topup_from_pricing",
                  source: "pricing_page",
                })
              }
            >
              Top up credits as you go.
            </Link>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Stockera Technology Private Limited (INH000019071). AI reports are
            educational. Personalized advice comes from SEBI-registered analysts only.
          </p>
        </section>
      </TooltipProvider>
    </AppShell>
  );
}
```

## Stop gate
Plan only. Not writing. Reply **apply W6** to proceed.
