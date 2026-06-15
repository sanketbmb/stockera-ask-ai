/**
 * W3 — Points helper layer.
 *
 * Pure utilities + React Query hooks for the points/wallet domain.
 * - No UI, no JSX, no writes.
 * - Reads only from `wallet_balances`, `stock_picker_runtime_config`,
 *   and Supabase realtime on `wallet_ledger`.
 * - Never touches `profiles.wallet_balance` or `wallet_transactions`.
 * - All Supabase errors are swallowed; DEV-only `console.warn` is gated by
 *   `import.meta.env.DEV`.
 *
 * This file is intentionally NOT wired into any component. Wiring happens
 * in later workstreams (Wallet, Pricing, Topup, QueryForm).
 */

import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionKey =
  | "ai_report"
  | "video_answer"
  | "live_session"
  | "sector_view"
  | "stock_picker"
  | "educational";

export interface ActionCost {
  action_key: ActionKey;
  effective_points: number;
  regular_points: number;
  promo_active: boolean;
  promo_ends_at: string | null;
}

export type ActionCostMap = Record<ActionKey, ActionCost>;

export interface WalletBalance {
  user_id: string;
  balance: number;
  welcome_bonus_remaining: number;
  welcome_bonus_expires_at: string | null;
  last_ledger_at: string | null;
}

// ---------------------------------------------------------------------------
// React Query keys
// ---------------------------------------------------------------------------

export const QK_WALLET_BALANCE = (userId: string | null | undefined) =>
  ["wallet-balance", userId ?? "anon"] as const;

export const QK_ACTION_COSTS = ["action-costs"] as const;

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

function devWarn(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn("[points]", ...args);
  }
}

function toFiniteNumber(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim() !== "") {
    const parsed = Number(n);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** true when `iso` is null/undefined, or a valid date strictly in the future. */
function isFutureOrNull(iso: string | null | undefined): boolean {
  if (iso == null) return true;
  if (typeof iso !== "string" || iso.trim() === "") return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t > Date.now();
}

const ACTION_KEYS: readonly ActionKey[] = [
  "ai_report",
  "video_answer",
  "live_session",
  "sector_view",
  "stock_picker",
  "educational",
] as const;

const FALLBACK_BASE_POINTS: Record<ActionKey, number> = {
  ai_report: 50,
  video_answer: 499,
  live_session: 999,
  sector_view: 30,
  stock_picker: 80,
  educational: 0,
};

function buildFallbackCosts(): ActionCostMap {
  const out = {} as ActionCostMap;
  for (const key of ACTION_KEYS) {
    const points = FALLBACK_BASE_POINTS[key];
    out[key] = {
      action_key: key,
      effective_points: points,
      regular_points: points,
      promo_active: false,
      promo_ends_at: null,
    };
  }
  return out;
}

const INR_FORMATTER = new Intl.NumberFormat("en-IN");

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

export function formatPoints(n: number | null | undefined): string {
  const v = toFiniteNumber(n);
  if (v == null) return "0 pts";
  const sign = v < 0 ? "-" : "";
  return `${sign}${INR_FORMATTER.format(Math.abs(v))} pts`;
}

export function formatPointsAsRupees(n: number | null | undefined): string {
  const v = toFiniteNumber(n);
  if (v == null) return "₹0";
  const sign = v < 0 ? "-" : "";
  return `${sign}₹${INR_FORMATTER.format(Math.abs(v))}`;
}

export function canAfford(
  balance: number | null | undefined,
  cost: number | null | undefined,
): boolean {
  const b = toFiniteNumber(balance);
  const c = toFiniteNumber(cost);
  if (b == null || c == null) return false;
  if (c <= 0) return false;
  return b >= c;
}

export function isPromoActive(cost: ActionCost): boolean {
  if (!cost || cost.promo_active !== true) return false;
  return isFutureOrNull(cost.promo_ends_at);
}

// ---------------------------------------------------------------------------
// Async fetchers
// ---------------------------------------------------------------------------

export async function fetchWalletBalance(
  userId: string,
): Promise<WalletBalance | null> {
  try {
    const { data, error } = await supabase
      .from("wallet_balances")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      devWarn("fetchWalletBalance error", error);
      return null;
    }
    if (!data) return null;

    const row = data as Record<string, unknown>;
    return {
      user_id: String(row.user_id ?? userId),
      balance: toFiniteNumber(row.balance) ?? 0,
      welcome_bonus_remaining:
        toFiniteNumber(row.welcome_bonus_remaining) ?? 0,
      welcome_bonus_expires_at:
        typeof row.welcome_bonus_expires_at === "string"
          ? row.welcome_bonus_expires_at
          : null,
      last_ledger_at:
        typeof row.last_ledger_at === "string" ? row.last_ledger_at : null,
    };
  } catch (e) {
    devWarn("fetchWalletBalance threw", e);
    return null;
  }
}

export async function fetchActionCosts(): Promise<ActionCostMap> {
  try {
    const { data, error } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_key, config_value")
      .in("config_key", ["action_costs", "video_answer_promo"]);

    if (error) {
      devWarn("fetchActionCosts error", error);
      return buildFallbackCosts();
    }
    if (!data || data.length === 0) {
      return buildFallbackCosts();
    }

    let baseCfg: Record<string, unknown> = {};
    let promoCfg: Record<string, unknown> = {};
    for (const row of data as Array<{
      config_key: string;
      config_value: unknown;
    }>) {
      if (
        row.config_key === "action_costs" &&
        row.config_value &&
        typeof row.config_value === "object"
      ) {
        baseCfg = row.config_value as Record<string, unknown>;
      } else if (
        row.config_key === "video_answer_promo" &&
        row.config_value &&
        typeof row.config_value === "object"
      ) {
        promoCfg = row.config_value as Record<string, unknown>;
      }
    }

    const basePoints = (key: ActionKey): number => {
      const entry = baseCfg[key];
      if (entry && typeof entry === "object") {
        const p = toFiniteNumber((entry as Record<string, unknown>).points);
        if (p != null) return p;
      }
      return FALLBACK_BASE_POINTS[key];
    };

    const promoActiveFlag = promoCfg.promo_active === true;
    const promoPrice = toFiniteNumber(promoCfg.promo_price_points);
    const promoRegular = toFiniteNumber(promoCfg.regular_price_points);
    const promoEndsAt =
      typeof promoCfg.promo_ends_at === "string"
        ? promoCfg.promo_ends_at
        : null;

    const out = {} as ActionCostMap;
    for (const key of ACTION_KEYS) {
      if (key === "video_answer") {
        const regular = promoRegular ?? basePoints("video_answer");
        const promoUsable =
          promoActiveFlag &&
          promoPrice != null &&
          isFutureOrNull(promoEndsAt);
        const effective = promoUsable ? (promoPrice as number) : regular;
        out[key] = {
          action_key: key,
          effective_points: effective,
          regular_points: regular,
          promo_active: promoUsable,
          promo_ends_at: promoEndsAt,
        };
      } else {
        const points = basePoints(key);
        out[key] = {
          action_key: key,
          effective_points: points,
          regular_points: points,
          promo_active: false,
          promo_ends_at: null,
        };
      }
    }
    return out;
  } catch (e) {
    devWarn("fetchActionCosts threw", e);
    return buildFallbackCosts();
  }
}

export async function getActionCost(actionKey: ActionKey): Promise<ActionCost> {
  const map = await fetchActionCosts();
  return map[actionKey];
}

// ---------------------------------------------------------------------------
// React Query hooks
// ---------------------------------------------------------------------------

export function useWalletBalance(
  userId: string | null | undefined,
): UseQueryResult<WalletBalance | null> {
  return useQuery<WalletBalance | null>({
    queryKey: QK_WALLET_BALANCE(userId),
    queryFn: () => fetchWalletBalance(userId as string),
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useActionCosts(): UseQueryResult<ActionCostMap> {
  return useQuery<ActionCostMap>({
    queryKey: QK_ACTION_COSTS,
    queryFn: fetchActionCosts,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

export function subscribeToWalletChanges(
  userId: string,
  onChange: () => void,
): () => void {
  try {
    const channel: RealtimeChannel = supabase
      .channel(`wallet_ledger_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wallet_ledger",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          try {
            onChange();
          } catch (e) {
            devWarn("subscribeToWalletChanges onChange threw", e);
          }
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        devWarn("subscribeToWalletChanges cleanup threw", e);
      }
    };
  } catch (e) {
    devWarn("subscribeToWalletChanges setup threw", e);
    return () => {};
  }
}

export function useWalletRealtime(userId: string | null | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const off = subscribeToWalletChanges(userId, () => {
      queryClient.invalidateQueries({ queryKey: QK_WALLET_BALANCE(userId) });
    });
    return off;
  }, [userId, queryClient]);
}
