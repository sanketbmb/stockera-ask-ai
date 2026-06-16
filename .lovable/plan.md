## W6.9 — Wire Paywall Gate into Stock Picker

### 1) Discovery Results

Grep matrix:

- `stock_picker` — appears in `src/components/query/QueryForm.tsx` (a nav chip), supabase types, intent router, points.ts, paywall.ts. Only one true runtime trigger: `runQuery()` in `src/components/stock-picker/StockPickerFlow.tsx` (calls `supabase.functions.invoke("stock-recommendation-query")`).
- `debit_stock_picker` — only a label string in `src/pages/Wallet.tsx` (display only). No external trigger.
- `sector_view` — outside QueryForm.tsx the matches are: intent router schema/prompt, feature flags, report routing/rendering (`report.$queryId.tsx`, `SectorViewReport.tsx`), PDF + freeze functions, sector-context, Wallet label. None of these are user-facing "start the paid action" handlers; the sector-view paid action is launched only from QueryForm (already gated in W6.8).
- `debit_sector_view` — only a label string in `src/pages/Wallet.tsx`.
- `navigate({ to: "/stock-picker" ...})` — single occurrence in QueryForm.tsx line 1064 (forbidden file; also just navigation, not the paid action).
- `from "@/lib/paywall"` — only QueryForm.tsx imports it today.

**Real paid-action triggers found:**

| Action | File | Handler | Why it qualifies |
|---|---|---|---|
| Stock Picker | `src/components/stock-picker/StockPickerFlow.tsx` | `runQuery()` (line 229) | This is the single function that calls `supabase.functions.invoke("stock-recommendation-query")` — i.e. the actual paid backend call. It is invoked from the Step C "Generate" submit button. |
| Sector View (outside QueryForm) | — | — | None. The only external sector_view references are passive (report rendering, PDF freeze, metering map). The user-facing launch lives in QueryForm and was gated in W6.8. |

### 2) Scope Decision

**1 file changed:** `src/components/stock-picker/StockPickerFlow.tsx`.

Per spec ("If there is NO true sector-view action outside QueryForm.tsx, explicitly say so and gate ONLY Stock Picker"):

> No external sector-view handler found; W6.9 gates stock picker only.

### 3) Unified Diff (planned)

```diff
--- a/src/components/stock-picker/StockPickerFlow.tsx
+++ b/src/components/stock-picker/StockPickerFlow.tsx
@@
 import { useState } from "react";
 import { Card } from "@/components/ui/card";
 ...
 import { supabase } from "@/integrations/supabase/client";
 import {
   ArrowLeft,
   ArrowRight,
   ChevronDown,
   ChevronUp,
   Loader2,
   Sparkles,
   AlertTriangle,
   Info,
 } from "lucide-react";
+import { toast } from "sonner";
+import { useAuth } from "@/contexts/AuthContext";
+import { checkPaywallGate } from "@/lib/paywall";
@@ export function StockPickerFlow() {
   const [step, setStep] = useState<0 | 1 | 2>(0);
+  const { user } = useAuth();
@@ async function runQuery() {
-    setSubmitting(true);
+    const gate = await checkPaywallGate("stock_picker", user?.id);
+    if (!gate.allow) {
+      toast.error(gate.reason ?? "Insufficient balance");
+      return;
+    }
+
+    setSubmitting(true);
     setResult(null);
     setErrorMsg(null);
```

Notes:
- Gate is inserted at the very top of `runQuery()`, before any state mutation, interval, or supabase call.
- Uses the exact ActionKey `"stock_picker"`.
- Uses sonner `toast.error` (same convention as QueryForm; this file currently has no toast import — adding sonner is consistent with the rest of the app and not a new dependency).
- `useAuth` is the same hook used in QueryForm.

### 4) Anti-fabrication Checklist

- A) Only one `checkPaywallGate(` call inserted, key = `"stock_picker"`. ✓
- B) `src/components/query/QueryForm.tsx` untouched. ✓
- C) `src/lib/paywall.ts` untouched. ✓
- D) `src/lib/points.ts` untouched. ✓
- E) No `react-router-dom` import. ✓
- F) Gate placed on `runQuery()` (the actual invoke handler), not on the nav chip in QueryForm or any passive button. ✓
- G) Files changed = 1 (≤ 2). ✓
- H) No external sector-view handler found; W6.9 gates stock picker only. ✓

### 5) Validation Matrix (expected behavior, not executed)

1. `paywall_v1_enabled = false` → `checkPaywallGate` fail-opens → Stock Picker behaves identically to today.
2. `paywall_v1_enabled = true`, logged out → `user?.id` is undefined → gate returns `allow:false` → toast shown, `runQuery` returns before any submit state or invoke.
3. `paywall_v1_enabled = true`, insufficient balance → gate returns `allow:false` with reason → toast shown, no submit, no edge call.
4. `paywall_v1_enabled = true`, sufficient balance → gate returns `allow:true` → existing `runQuery` flow runs unchanged (loading messages, invoke, result rendering).
5. No external sector-view handler exists → sector view continues to be gated inside QueryForm via W6.8; W6.9 adds nothing for it.

### Dark-by-default

`checkPaywallGate()` fail-opens whenever `paywall_v1_enabled` is false or absent in `stock_picker_runtime_config`. Therefore today's Stock Picker behavior is unchanged after this edit until the founder flips the flag on.

### 6) Confirmations

- QueryForm.tsx — unchanged.
- paywall.ts — unchanged.
- points.ts — unchanged.
- No other file touched. Only `src/components/stock-picker/StockPickerFlow.tsx` is modified.

Stopping. Reply `apply W6.9` to apply.