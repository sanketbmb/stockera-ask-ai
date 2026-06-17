/**
 * W6.7 — Paywall gate helper (dark by default).
 *
 * Pure async helper. No JSX, no hooks, no writes, no caching.
 * - Reads feature flag `paywall_v1_enabled` from `stock_picker_runtime_config`.
 * - If flag absent / false / errors → fail-OPEN (allow:true, paywall_active:false).
 * - If flag true → compares wallet balance vs promo-aware action cost.
 * - Fires `track("paywall_hit", …)` ONLY when blocking the user.
 * - Never throws.
 *
 * Not wired into any component in this workstream. Wiring is W6.8.
 */

import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import {
  fetchWalletBalance,
  fetchActionCosts,
  isPromoActive,
  type ActionKey,
  type ActionCost,
} from "@/lib/points";

export interface PaywallGateResult {
  allow: boolean;
  reason?: string;
  paywall_active: boolean;
  required_points: number;
  current_balance: number;
  action_key: ActionKey;
}

function failOpen(actionKey: ActionKey): PaywallGateResult {
  return {
    allow: true,
    paywall_active: false,
    required_points: 0,
    current_balance: 0,
    action_key: actionKey,
  };
}

async function readPaywallFlag(): Promise<boolean> {
  try {
    console.log("[paywall-debug] reading flag from DB...");
    const { data, error } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_value")
      .eq("config_key", "paywall_v1_enabled")
      .maybeSingle();

    console.log("[paywall-debug] flag query result:", { data, error });

    if (error || !data) return false;

    const raw: unknown = (data as { config_value: unknown }).config_value;
    if (raw === true) return true;
    if (raw && typeof raw === "object" && "enabled" in raw) {
      const enabled = (raw as { enabled?: unknown }).enabled;
      return enabled === true;
    }
    return false;
  } catch (err) {
    console.error("[paywall-debug] readPaywallFlag threw:", err);
    return false;
  }
}

function computeRequired(cost: ActionCost | undefined): number {
  if (!cost) return 0;
  const v = isPromoActive(cost) ? cost.effective_points : cost.regular_points;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

export async function checkPaywallGate(
  actionKey: ActionKey,
  userId: string | undefined,
): Promise<PaywallGateResult> {
  try {
    const paywallActive = await readPaywallFlag();

    if (!paywallActive) {
      return failOpen(actionKey);
    }

    if (!userId) {
      return {
        allow: false,
        paywall_active: true,
        reason: "Sign in to continue",
        required_points: 0,
        current_balance: 0,
        action_key: actionKey,
      };
    }

    const [balance, costs] = await Promise.all([
      fetchWalletBalance(userId),
      fetchActionCosts(),
    ]);

    const cost = costs[actionKey];
    const required = computeRequired(cost);
    const current = balance?.balance ?? 0;
    const allow = current >= required;

    if (!allow) {
      void track("paywall_hit", {
        action_key: actionKey,
        required_points: required,
        current_balance: current,
      });
    }

    return {
      allow,
      paywall_active: true,
      reason: allow ? undefined : `Need ${required} credits. You have ${current}.`,
      required_points: required,
      current_balance: current,
      action_key: actionKey,
    };
  } catch {
    return failOpen(actionKey);
  }
}
