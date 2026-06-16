## W6.8 — Wire Paywall Gate Into QueryForm Actions (plan only)

### Files touched
- `src/components/query/QueryForm.tsx` (only)

### Handlers identified in QueryForm.tsx
There is exactly **one** paid-action handler in this file:

| Handler | Line | What it triggers |
|---|---|---|
| `handleSubmit` | 568 | Creates the query row and (for v1-engine intents) calls `runGenerateAiReport` at line 836. Covers all 6 routable intents: `buy_decision`, `stuck_position`, `should_average`, `sector_view`, `educational`, `other`. |

No other handler in this file fires a paid action. `goNext`, the chip onClick handlers (lines 981/1022), the stock-picker nav button (1053), `setManualSector` / `setAnalystId` toggles, and the step Back/Next buttons are all pre-submit UI state changes — not gated.

### Action key mapping (verified against the 5-key `ActionKey` union)
Decision is taken from `intent` at submit time:

| `intent` | `ActionKey` | Justification |
|---|---|---|
| `sector_view` | `sector_view` | Sector report freeze fn (`isSector` path). |
| `buy_decision`, `stuck_position`, `should_average`, `educational`, `other` | `ai_report` | All five flow through the query-row insert + AI report generation pipeline (`runGenerateAiReport`, educational/general/sector freeze variants). `live_session`, `video_answer`, `stock_picker` are not initiated from this file (stock-picker is a `navigate({to:"/stock-picker"})` redirect, not a paid action started here). |

No handler in this file maps outside the 5 verified keys — no STOP condition triggered.

### Where the gate is inserted in `handleSubmit`
Insert immediately after the routable-intent guard (line 577) and **before** `setSubmitting(true)` (line 579). That places it before any analytics, mutation, toast, or loading state — matching the spec.

Also add one import at the top of the file (after the existing `@/lib/points` import on line 48).

Note on toast API: this file uses **sonner** (`import { toast } from "sonner"`, line 20), not the shadcn `useToast` shape. The gate's blocked-branch toast therefore uses `toast.error(gate.reason ?? "Insufficient balance")` to match the file's existing convention (e.g. line 570, 575, 592, 607). This is functionally equivalent to the spec's destructive toast and avoids introducing a second toast API.

### Unified diff

```diff
--- a/src/components/query/QueryForm.tsx
+++ b/src/components/query/QueryForm.tsx
@@ -48,6 +48,7 @@
 import { useWalletBalance, useWalletRealtime } from "@/lib/points";
+import { checkPaywallGate, type PaywallGateResult } from "@/lib/paywall";
 import {
   ArrowLeft,
@@ -574,6 +575,17 @@
     if (!isRoutableIntent(intent)) {
       toast.error("Unsupported query type");
       return;
     }
+
+    // W6.8 — Paywall gate (dark-by-default). When `paywall_v1_enabled` is
+    // false in `stock_picker_runtime_config`, checkPaywallGate fails open
+    // (allow=true) and this branch is a no-op — preserving today's behavior.
+    const paywallActionKey: "ai_report" | "sector_view" =
+      intent === "sector_view" ? "sector_view" : "ai_report";
+    const gate: PaywallGateResult = await checkPaywallGate({
+      userId: user?.id,
+      actionKey: paywallActionKey,
+    });
+    if (!gate.allow) {
+      toast.error(gate.reason ?? "Insufficient balance");
+      return;
+    }
 
     setSubmitting(true);
     setGenStage("creating");
```

(That is the entire change: 1 import line + 1 gate block. Nothing else in the file is touched. `useWalletBalance` / `useWalletRealtime` / `balance` stay exactly as today. No analytics, toasts, validations, or loading states are modified.)

### Anti-fabrication grep expectations (post-apply)
| Check | Command | Expected |
|---|---|---|
| A | `grep -c "checkPaywallGate(" src/components/query/QueryForm.tsx` | `1` |
| B | `grep -c 'from "@/lib/paywall"' src/components/query/QueryForm.tsx` | `1` |
| C | `grep -c "react-router-dom" src/components/query/QueryForm.tsx` | `0` |
| D | `grep -cE "profile\\??\\.wallet_balance" src/components/query/QueryForm.tsx` | `0` |
| E | `grep -c "useWalletBalance(" src/components/query/QueryForm.tsx` | `1` (W6.6 hook preserved) |
| F | `git diff --stat` | only `src/components/query/QueryForm.tsx` changed |
| G | Action keys passed | exactly `"ai_report"` or `"sector_view"` (both ∈ verified `ActionKey` union) |

### Validation matrix (no execution — expected runtime behavior)

| # | Condition | Expected behavior |
|---|---|---|
| 1 | `paywall_v1_enabled = false` (current prod) | `checkPaywallGate` → `failOpen` → `allow=true` → handler proceeds. Identical to today. Dark-by-default preserved. |
| 2 | flag on, user logged out | `gate.allow=false`, `reason="Sign in to continue"` → `toast.error` → early `return`, no submit. |
| 3 | flag on, balance < required | `gate.allow=false` → `toast.error(reason)` → early `return`. `paywall_hit` analytics fires from inside `checkPaywallGate`. |
| 4 | flag on, balance ≥ required | `gate.allow=true` → handler continues into existing `setSubmitting(true)` flow unchanged. |
| 5 | `checkPaywallGate` throws | Wrapped in `try/catch` inside `paywall.ts` → `failOpen` → `allow=true` → handler proceeds. No user-visible error. |

### Confirmation
- Only `src/components/query/QueryForm.tsx` is modified.
- No changes to `src/lib/paywall.ts`, `src/lib/points.ts`, any Supabase integration file, migration, edge function, route, page, or other component.
- No new dependencies, no default-export changes, no router redirects added in this file, no schema changes, no pricing/SEBI copy edits.
- `useWalletBalance` + `useWalletRealtime` + `balance: number` identifier preserved verbatim.

**STOP. Awaiting `apply W6.8`.**
