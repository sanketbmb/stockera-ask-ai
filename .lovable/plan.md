# W6.6 — QueryForm Wallet Source Cutover

Single-file surgical change. Replaces the last legacy `profile?.wallet_balance` read in the repo with the W1/W3 wallet source (`useWalletBalance` + `useWalletRealtime`), preserving the `balance: number` identifier so all downstream usage in QueryForm remains untouched.

## File modified (exactly one)
- `src/components/query/QueryForm.tsx`

## Planned diff (unified, minimal)

```diff
--- a/src/components/query/QueryForm.tsx
+++ b/src/components/query/QueryForm.tsx
@@ -47,6 +47,7 @@ import { resolveConcept } from "@/lib/concept-alias-map";
 import { getLtpForSymbol } from "@/lib/market.functions";
+import { useWalletBalance, useWalletRealtime } from "@/lib/points";
 import {
   ArrowLeft,
@@ -307,7 +308,9 @@
   });

-  const balance = profile?.wallet_balance ?? 0;
+  const { data: walletBalance } = useWalletBalance(user?.id);
+  useWalletRealtime(user?.id);
+  const balance = walletBalance?.balance ?? 0;
   const showStockFields = ["stuck_position", "should_average", "buy_decision"].includes(intent);
```

That is the entire change. No other lines are touched.

## Why this works without further edits
- `user` is already destructured at line 144: `const { user, profile, refresh } = useAuth();` — no second `useAuth()` call needed.
- `balance` stays a plain `number`, so every downstream affordability check, gating branch, and submit path keeps working unchanged.
- `useWalletRealtime(user?.id)` mirrors the W4 (Wallet.tsx) and W6.5 (Dashboard.tsx) pattern; when the user tops up in another tab the balance re-renders here automatically.
- No new dependencies, no router changes, no analytics events, no paywall/feature-flag work (W7 scope).

## Anti-fabrication check (post-apply expectations)
| ID | Check | Expected |
|----|-------|----------|
| A | `profile?.wallet_balance` in QueryForm.tsx | 0 |
| B | `profile.wallet_balance` in QueryForm.tsx | 0 |
| C | `useWalletBalance(` in QueryForm.tsx | ≥1 |
| D | `useWalletRealtime(` in QueryForm.tsx | ≥1 |
| E | `react-router-dom` in QueryForm.tsx | 0 |
| F | `add_demo_credits` in QueryForm.tsx | 0 |
| G | `wallet_transactions` in QueryForm.tsx | 0 |
| H | `balance` identifier preserved, type `number` | yes |
| I | No other file modified | yes |

## Validation matrix
1. Logged-out: `user?.id` undefined → hook returns no data → `balance = 0`. No crash.
2. Logged-in balance = 0: gating fires exactly as before.
3. Logged-in balance > 0: submit path unchanged, value sourced from W1/W3.
4. Top-up in another tab: realtime channel triggers refetch, gating updates without reload.
5. TypeScript: 0 errors; no `any`; no unused imports (both new imports are used).

## Full updated file
The file is ~1639 lines. The only diff vs. current `src/components/query/QueryForm.tsx` is the 4 lines shown above (1 import insertion + 1 line replaced by 3 lines at the old line 310). Rather than dumping 1639 unchanged lines, the diff above is exact and complete — every other line is byte-identical to the current file on disk.

If you want me to also paste the full file contents inline before applying, say "include full file" with the apply command; otherwise reply **apply W6.6** to proceed.

## Confirmation
No file other than `src/components/query/QueryForm.tsx` will be changed.
