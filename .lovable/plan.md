# W3 — Points Helper Layer (PLAN ONLY)

## Diff Summary
- **New file (1):** `src/lib/points.ts`
- **Edits to other files:** none
- **Migrations / RLS / edge functions:** none
- **UI / JSX / component wiring:** none

Schema verified live:
- `wallet_balances(user_id, balance, welcome_bonus_remaining, welcome_bonus_expires_at, last_ledger_at)` ✓
- `wallet_ledger` exists with `user_id`, INSERT events suitable for realtime ✓
- `stock_picker_runtime_config(config_key text, config_value jsonb, ...)` ✓
- `action_costs` and `video_answer_promo` keys present and match the W3 shape ✓

## Planned file: `src/lib/points.ts`

### Order of contents
1. Header comment: "W3 — Points helper layer. Pure utilities + React Query hooks. No UI, no writes."
2. Imports (exactly the four allowed):
   - `useQuery`, `useQueryClient`, `type UseQueryResult` from `@tanstack/react-query`
   - `useEffect` from `react`
   - `supabase` from `@/integrations/supabase/client`
   - `type RealtimeChannel` from `@supabase/supabase-js`
3. Exported types: `ActionKey`, `ActionCost`, `ActionCostMap`, `WalletBalance` (verbatim from spec)
4. Exported query keys: `QK_WALLET_BALANCE(userId)`, `QK_ACTION_COSTS`
5. Internal helpers (not exported):
   - `devWarn(...args: unknown[]): void` — `if (import.meta.env.DEV) console.warn(...)`
   - `toFiniteNumber(n: unknown): number | null` — coerces, returns null on NaN/non-number
   - `isFutureOrNull(iso: string | null | undefined): boolean` — true if null, or valid date strictly in the future
   - `FALLBACK_BASE_POINTS: Record<ActionKey, number>` = `{ ai_report:50, video_answer:499, live_session:999, sector_view:30, stock_picker:80, educational:0 }`
   - `ACTION_KEYS: readonly ActionKey[]` for safe iteration
   - `buildFallbackCosts(): ActionCostMap` from `FALLBACK_BASE_POINTS`
6. Pure functions:
   - `formatPoints(n)` — `Intl.NumberFormat("en-IN")`; null/undefined/NaN → `"0 pts"`; preserves negative sign; suffix `" pts"`.
   - `formatPointsAsRupees(n)` — same formatter; null/undefined/NaN → `"₹0"`; prefix `"₹"`; preserves sign.
   - `canAfford(balance, cost)` — false on null/undefined/NaN on either side or `cost <= 0`; else `balance >= cost`.
   - `isPromoActive(cost)` — true only when `cost.promo_active === true` and (`promo_ends_at` is null OR a valid future date).
7. Async fetchers:
   - `fetchWalletBalance(userId)` — `supabase.from("wallet_balances").select("*").eq("user_id", userId).maybeSingle()`; on error/missing → `null`; `devWarn` on error; returns typed `WalletBalance | null`.
   - `fetchActionCosts()`:
     - one query: `supabase.from("stock_picker_runtime_config").select("config_key, config_value").in("config_key", ["action_costs","video_answer_promo"])`
     - on error or empty → `buildFallbackCosts()` + `devWarn`
     - parse `action_costs.config_value` defensively (`Record<string, { points?: unknown }>`); per action use `toFiniteNumber(points)` else fallback constant
     - parse `video_answer_promo.config_value` defensively for `promo_active`, `promo_price_points`, `regular_price_points`, `promo_ends_at`
     - for non-video actions: `effective_points = regular_points = <base>`, `promo_active=false`, `promo_ends_at=null`
     - for `video_answer`:
       - `regular = toFiniteNumber(promo.regular_price_points) ?? base.video_answer ?? 499`
       - `promoUsable = promo.promo_active === true && toFiniteNumber(promo.promo_price_points) != null && isFutureOrNull(promo.promo_ends_at)`
       - `effective = promoUsable ? promoPrice : regular`
       - `promo_active = promoUsable`
       - `promo_ends_at = (typeof promo.promo_ends_at === 'string') ? promo.promo_ends_at : null`
     - wrap whole body in try/catch → fallback map on throw
   - `getActionCost(actionKey)` — awaits `fetchActionCosts()` and returns `map[actionKey]`.
8. Hooks:
   - `useWalletBalance(userId)` → `useQuery({ queryKey: QK_WALLET_BALANCE(userId), queryFn: () => fetchWalletBalance(userId as string), enabled: !!userId, staleTime: 30_000, refetchOnWindowFocus: true })` typed `UseQueryResult<WalletBalance | null>`.
   - `useActionCosts()` → `useQuery({ queryKey: QK_ACTION_COSTS, queryFn: fetchActionCosts, staleTime: 5*60_000, refetchOnWindowFocus: false })` typed `UseQueryResult<ActionCostMap>`.
9. Realtime:
   - `subscribeToWalletChanges(userId, onChange): () => void`
     - try: `const channel: RealtimeChannel = supabase.channel(`wallet_ledger_${userId}`).on('postgres_changes', { event:'INSERT', schema:'public', table:'wallet_ledger', filter:`user_id=eq.${userId}` }, () => { try { onChange(); } catch (e) { devWarn(e); } }).subscribe();`
     - return `() => { try { supabase.removeChannel(channel); } catch (e) { devWarn(e); } }`
     - catch: `devWarn`; return `() => {}`
   - `useWalletRealtime(userId): void`
     - `const qc = useQueryClient();`
     - `useEffect(() => { if (!userId) return; const off = subscribeToWalletChanges(userId, () => { qc.invalidateQueries({ queryKey: QK_WALLET_BALANCE(userId) }); }); return off; }, [userId, qc]);`

## Compliance against checklist
- One new file, zero edits elsewhere ✓
- All 17 required exports present ✓
- Uses `sector_view` (not `sector_report`) ✓
- Reads only from `wallet_balances`, `stock_picker_runtime_config`, realtime on `wallet_ledger` ✓
- No reads from `profiles.wallet_balance` or `wallet_transactions` ✓
- No writes anywhere ✓
- TS strict, no `any` (use `unknown` + narrowing); explicit return types on every export ✓
- DEV-only `console.warn`; no `console.log`/`console.error` ✓
- No JSX, no React imports beyond `useEffect` ✓
- Only the four allowed imports ✓
- Normalizes `video_answer` via separate `video_answer_promo` config with safe fallbacks ✓

## Stop gate
Stopping here. Will not write the file or touch anything else until you reply **"apply W3"**. The next message after approval will be the full file contents as written.