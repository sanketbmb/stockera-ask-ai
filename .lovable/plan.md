## W6.10 — Premium Paywall Modal (Dummy Topup CTA)

### 1) Discovery — Current Toast-Only Blocked Call Sites

Two sites match `if (!gate.allow) { toast.error(...); return; }`:

| File | Line | Action keys it gates |
|---|---|---|
| `src/components/query/QueryForm.tsx` | 583–586 | `sector_view`, `ai_report` |
| `src/components/stock-picker/StockPickerFlow.tsx` | 235 (block follows) | `stock_picker` |

No other `checkPaywallGate` consumers exist. (Confirmed by grep of `gate.allow` and `checkPaywallGate` across `src/`.)

### 2) Existing Topup/Payment Destination

Route exists at `src/routes/topup.tsx` → `/topup` (wraps `RequireAuth` + the dummy `Topup` page). Already linked from:
- `src/pages/Dashboard.tsx` ("Add wallet credits")
- `src/pages/Pricing.tsx`
- `src/pages/Wallet.tsx` ("Add Credits →")

Primary CTA destination = **`/topup`** (matches every existing wallet/topup CTA in product).

Optional tertiary text CTA = **`/pricing`** ("See pricing"), already exists and is linked from Navbar/Footer.

Dialog primitive: `src/components/ui/dialog.tsx` already present (shadcn). Reuse it; no new dependency.

### 3) Files To Change (3 total)

1. **NEW** `src/components/paywall/PaywallDialog.tsx` — shared premium blocked-state dialog.
2. **EDIT** `src/components/query/QueryForm.tsx` — replace toast-only block with dialog state + render dialog.
3. **EDIT** `src/components/stock-picker/StockPickerFlow.tsx` — same.

No other file is touched.

### 4) Unified Diff (planned)

**(a) NEW `src/components/paywall/PaywallDialog.tsx`**

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Wallet } from "lucide-react";
import type { PaywallGateResult } from "@/lib/paywall";
import type { ActionKey } from "@/lib/points";

const ACTION_LABEL: Record<ActionKey, string> = {
  stock_picker: "Stock Picker",
  sector_view: "Sector View",
  ai_report: "AI Report",
  video_answer: "Video Answer",
  live_session: "1:1 Private Session",
  educational: "Educational Report",
};

const ACTION_SUBTITLE: Record<ActionKey, string> = {
  stock_picker: "Run a fresh, filter-aware pick from today's verified universe.",
  sector_view: "Get a structured 12-month view across an entire sector.",
  ai_report: "Generate a personalised, source-backed equity report.",
  video_answer: "Get a recorded analyst response tailored to your question.",
  live_session: "Book a private session with a SEBI-registered analyst.",
  educational: "Unlock the full educational deep-dive.",
};

export function PaywallDialog({
  open,
  onOpenChange,
  gate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gate: PaywallGateResult | null;
}) {
  const navigate = useNavigate();
  if (!gate) return null;

  const label = ACTION_LABEL[gate.action_key] ?? "Premium Action";
  const subtitle = ACTION_SUBTITLE[gate.action_key] ?? "Unlock this premium action.";
  const shortfall = Math.max(0, gate.required_points - gate.current_balance);
  const isSignIn = gate.reason === "Sign in to continue";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
        <DialogHeader className="relative">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center text-xl">
            Unlock {label}
          </DialogTitle>
          <DialogDescription className="text-center">
            {subtitle}
          </DialogDescription>
        </DialogHeader>

        {!isSignIn && gate.required_points > 0 && (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
            <Row label="Required credits" value={`${gate.required_points}`} strong />
            <Row label="Your balance" value={`${gate.current_balance}`} />
            {shortfall > 0 && (
              <Row label="Shortfall" value={`${shortfall}`} accent />
            )}
            <p className="pt-2 text-xs text-muted-foreground">
              Your welcome credits can be used toward premium actions.
            </p>
          </div>
        )}

        {isSignIn && (
          <p className="text-sm text-muted-foreground text-center">
            Sign in to access premium actions and use your welcome credits.
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              navigate({ to: "/topup" });
            }}
          >
            <Wallet className="mr-2 h-4 w-4" />
            Add Wallet Credits
          </Button>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              navigate({ to: "/pricing" });
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            See pricing
          </button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          accent ? "font-mono text-destructive" : strong ? "font-mono font-semibold" : "font-mono"
        }
      >
        {value}
      </span>
    </div>
  );
}
```

**(b) `src/components/query/QueryForm.tsx`**

```diff
 import { checkPaywallGate } from "@/lib/paywall";
+import type { PaywallGateResult } from "@/lib/paywall";
+import { PaywallDialog } from "@/components/paywall/PaywallDialog";
@@ // inside component, alongside other useState hooks
+  const [paywallGate, setPaywallGate] = useState<PaywallGateResult | null>(null);
+  const [paywallOpen, setPaywallOpen] = useState(false);
@@
   const paywallActionKey = intent === "sector_view" ? "sector_view" : "ai_report";
   const gate = await checkPaywallGate(paywallActionKey, user?.id);
   if (!gate.allow) {
-    toast.error(gate.reason ?? "Insufficient balance");
+    setPaywallGate(gate);
+    setPaywallOpen(true);
     return;
   }
@@ // near the existing top-level JSX return wrapper
+      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} gate={paywallGate} />
```

(Exact placement: append `<PaywallDialog .../>` as a sibling at the end of the component's existing top-level fragment/wrapper return.)

**(c) `src/components/stock-picker/StockPickerFlow.tsx`**

```diff
 import { checkPaywallGate } from "@/lib/paywall";
+import type { PaywallGateResult } from "@/lib/paywall";
+import { PaywallDialog } from "@/components/paywall/PaywallDialog";
@@ export function StockPickerFlow() {
   const { user } = useAuth();
+  const [paywallGate, setPaywallGate] = useState<PaywallGateResult | null>(null);
+  const [paywallOpen, setPaywallOpen] = useState(false);
@@ async function runQuery() {
   const gate = await checkPaywallGate("stock_picker", user?.id);
   if (!gate.allow) {
-    toast.error(gate.reason ?? "Insufficient balance");
+    setPaywallGate(gate);
+    setPaywallOpen(true);
     return;
   }
@@ // append inside the existing top-level <TooltipProvider><div>...</div></TooltipProvider>
+      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} gate={paywallGate} />
```

(The `toast` import already added in W6.9 stays — still used by error states elsewhere only if present; if not, it'll be removed only if unused. Plan keeps it; harmless either way.)

### 5) Anti-Fabrication Checklist

- A) `src/lib/paywall.ts` — untouched.
- B) `src/lib/points.ts` — untouched.
- C) No new backend/SQL/edge-function files. CTA uses existing `/topup` route only.
- D) Dummy payment flow internals (`src/pages/Topup.tsx`) — untouched.
- E) Modal renders only when `paywallOpen === true`, set only inside the existing `if (!gate.allow)` branch.
- F) When `gate.allow === true`, no state change and no modal — original flow untouched.
- G) Files changed = 3 (1 new + 2 edits). ✓
- H) No `react-router-dom`. Uses `useNavigate` from `@tanstack/react-router`.
- I) Both QueryForm and StockPickerFlow consume the same `PaywallDialog` component.
- J) No other paywall call sites exist; nothing else expanded.

### 6) Validation Matrix (expected, not executed)

1. `paywall_v1_enabled = false` → `checkPaywallGate` fail-opens → `gate.allow === true` → no `setPaywallOpen(true)` → modal never appears. Identical to today.
2. `paywall_v1_enabled = true`, logged out → `gate.allow === false`, `reason === "Sign in to continue"` → dialog renders sign-in copy, primary CTA → `/topup` (which is `RequireAuth`-wrapped and will redirect to auth).
3. `paywall_v1_enabled = true`, low balance → dialog shows Required / Balance / Shortfall + welcome-credits note; primary CTA → `/topup` dummy flow unchanged.
4. `paywall_v1_enabled = true`, sufficient balance → `gate.allow === true` → no modal → action proceeds unchanged.
5. Founder demo → modal opens, premium framing, CTA opens current dummy `/topup` page; no real payment processing involved.

### 7) Razorpay Confirmation

Razorpay remains ON HOLD. No Razorpay code, no payment SDK, no edge function, no env var, no DB write touched in W6.10. CTA only navigates to the pre-existing dummy `/topup` page.

Stopping. Reply `apply W6.10` to apply.