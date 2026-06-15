# W5 — Topup Page (Plan)

## Scope
Create the `/topup` route so the W4 "Add Credits →" CTA stops 404-ing. Config-driven tiers from W1 `stock_picker_runtime_config`. No payment wiring — pay button disabled ("Coming soon"); Razorpay arrives in W7.

## Diff Summary

```
A  src/routes/topup.tsx        (NEW, 6 lines — route plumbing)
A  src/pages/Topup.tsx         (NEW, page component)
```

Zero edits to any existing file. Zero new dependencies. Zero migrations. Zero edge functions.

## File 1 — `src/routes/topup.tsx` (full contents, 7 lines incl. blank)

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import Topup from "@/pages/Topup";

export const Route = createFileRoute("/topup")({
  head: () => ({ meta: [{ title: "Top up — Stockera" }] }),
  component: () => <RequireAuth><Topup /></RequireAuth>,
});
```

Mirrors `src/routes/wallet.tsx` exactly.

## File 2 — `src/pages/Topup.tsx` (full contents)

Verbatim the component you specified in the prompt, including:

- Imports: `useEffect/useMemo/useRef/useState`, `useQuery`, `Link` from `@tanstack/react-router`, lucide icons (`ArrowLeft, Sparkles, Video, Zap, Check, Info`), shadcn primitives (`Card, Button, Badge, Input, Skeleton, Tooltip*`), `AppShell` (named), `supabase`, `useAuth`, `useWalletBalance + formatPoints` from `@/lib/points`, `track + trackPageView` from `@/lib/analytics`.
- Types: `TopupTier`, `TopupTiersConfig`, `FirstTopupBonusConfig`.
- Constants: `FALLBACK_TIERS`, `FALLBACK_BONUS`.
- `fetchTopupConfig()` — single Supabase `.in("config_key", ["topup_tiers", "first_topup_bonus"])` query with defensive parsing + fallbacks on any error/missing/malformed value.
- `export default function TopupPage()` with:
  - `useWalletBalance(user?.id)` for balance display via `formatPoints`.
  - `useQuery({ queryKey: ["topup-config"], queryFn: fetchTopupConfig, staleTime: 5min })`.
  - State: `selectedInr`, `customAmount`; refs: `abandonedRef`, `trackedMountRef`.
  - Mount effect: `trackPageView()` + `track("topup_initiated", { current_balance, source: "wallet_cta" })` (one-shot).
  - Unmount effect: `track("topup_abandoned", { selected_inr, had_custom })` if not completed.
  - Derived: `activeInr`, `activeCredits` (preset exact match → tier.credits; custom → 1:1), `qualifiesForBonus`, `customValid` (within `min_inr..max_inr`).
  - Handlers: `handlePresetSelect` fires `topup_tier_selected` with kind `"preset"`; `handleCustomCommit` fires it with kind `"custom"` on blur when valid.
  - Layout: `<AppShell title="Top up">` → back-to-wallet link → balance strip card → two-column grid:
    - Left: tier grid (renders from `config.tiers.tiers`, shows `+bonus` badge when `credits > inr`) + custom input with min/max from config + validation message + 1:1 disclaimer.
    - Right (sticky): summary (pay/receive/bonus rows), first-topup-bonus callout when qualifying, **disabled** gradient pay button wrapped in Tooltip ("Coming soon" / "Razorpay UPI / cards / net banking launching soon."), trust strip.
  - Loading: 4 `Skeleton` placeholders while config loads.

No `topup_completed` event (that lives in W7). No Razorpay. No RPC calls. No writes.

## Acceptance Checklist (all satisfied by the plan above)

- [x] Exactly 2 new files; 0 edits to existing files
- [x] `src/routes/topup.tsx` mirrors `src/routes/wallet.tsx` (RequireAuth + default import)
- [x] Reads both config keys in ONE Supabase query
- [x] Defensive parse + `FALLBACK_TIERS` / `FALLBACK_BONUS`
- [x] Tiers rendered from config, not hardcoded
- [x] Custom input clamped to config `min_inr`/`max_inr` with inline error
- [x] Custom = 1:1 credits (display only)
- [x] First-topup bonus callout gated on `active && free_video && activeInr >= min_topup_inr`
- [x] Balance via `useWalletBalance` + `formatPoints` (no `profile.wallet_balance`)
- [x] Pay button `disabled` with Tooltip "Coming soon"; no payment code path
- [x] Analytics: `trackPageView`, `topup_initiated` (mount, once), `topup_tier_selected` (preset/custom), `topup_abandoned` (unmount). No `topup_completed`.
- [x] `Link` from `@tanstack/react-router`
- [x] `export default function TopupPage()`
- [x] No new deps, no migrations, no edge functions, no edits to AppShell/AuthContext/Wallet/points.ts/analytics.ts

## Stop Gate

Plan only. Nothing written. Reply **"apply W5"** to write both files.
