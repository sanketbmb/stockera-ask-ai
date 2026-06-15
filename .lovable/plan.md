# W4 — Wallet Page Cutover (Plan)

## Scope
Exactly one file modified: `src/pages/Wallet.tsx` (full replacement).

Zero edits to any other file. No new dependencies. No migrations. No edge functions. No changes to AppShell / AuthContext / routes / package.json. Route path `/wallet` unchanged. Default export `WalletPage` preserved.

## What changes (diff summary)

**Removed from current `src/pages/Wallet.tsx`:**
- `useState`, `useQueryClient` imports
- `Input` (from `@/components/ui/input`), `Package` (lucide), `toast` (sonner) imports
- `PRESETS` array, `POSITIVE_TYPES` set
- `amount`, `adding` state; `qc` query client
- `onAddDemo` (calls `add_demo_credits` RPC) and `onAddReal` handlers
- `useQuery({ queryKey: ["wallet-txns", ...] })` against `wallet_transactions`
- `profile?.wallet_balance` read; `profile` and `refresh` destructured from `useAuth()`
- Four preset buttons + custom amount input + "Add via UPI" + "Add ₹100 Demo Credits"
- `<Pack>` helper component and Bundle tile
- Any hardcoded ₹49/₹149/₹199/₹99/₹999/₹100 strings
- Balance column in the transactions table

**Added:**
- Imports from `@/lib/points` (`useWalletBalance`, `useActionCosts`, `useWalletRealtime`, `formatPoints`, `isPromoActive`, `ActionCost`)
- Imports from `@/lib/analytics` (`track`, `trackPageView`)
- `Link` from `@tanstack/react-router` (NOT `react-router-dom`)
- `useWalletRealtime(user?.id)` subscription
- Signed-out guard returning AppShell with sign-in card
- Balance error banner with retry
- New balance card reading `walletBalance.balance` + `welcome_bonus_remaining` + expiry badge (≤7 days)
- Simplified "Add credits" card with single `<Link to="/topup">` CTA that fires `track("cta_click", { cta: "add_credits", source: "wallet_page" })`
- 3-tile action-cost grid (AI Report / Video Answer / Live Session) using `useActionCosts()` + `isPromoActive` + LAUNCH badge with strike-through regular price
- Ledger query against `wallet_ledger`, selecting ONLY `id, entry_type, amount, created_at`, limit 50, ordered by `created_at desc`, with retry-on-error UI
- `ENTRY_LABELS` map covering all 18 W1 entry types + `describeEntry` fallback (humanized title case)
- Transactions table: Date / Type (credit|debit badge) / Description (mapped label) / Amount (signed, colored, with arrow icon)
- One-shot analytics effect (guarded by `useRef`) firing `void trackPageView()` and `void track("wallet_viewed", { balance, has_welcome_bonus })` after balance loads
- `ActionTile` helper component at bottom of file

**Unchanged:**
- `export default function WalletPage()` signature
- `<AppShell title="Wallet">` wrapper
- shadcn vocabulary: Card / Button / Badge / Skeleton / Table
- Gradient balance card visual (primary→accent), font-display / font-mono / tabular-nums classes

## Data flow
- `useAuth()` → `{ user }` only
- `useWalletBalance(user?.id)` → balance + welcome bonus fields + loading/error/refetch
- `useActionCosts()` → ai_report / video_answer / live_session cost objects
- `useWalletRealtime(user?.id)` → invalidates wallet queries on `wallet_ledger` inserts
- `useQuery(["wallet-ledger", user.id])` → last 50 ledger rows directly via supabase client (4 columns only)

## Stop gate
Plan only. The full replacement file body matches the spec verbatim (imports, signed-out guard, analytics effect with `useRef`, ENTRY_LABELS with all 18 values, Section 0 error banner, Section 1 balance + add-credits grid, Section 2 three ActionTiles, Section 3 ledger Card/Table, `ActionTile` helper). No writes until founder replies **apply W4**.

## Acceptance (self-check)
- [x] Only `src/pages/Wallet.tsx` touched
- [x] No `profiles.wallet_balance` read
- [x] No `wallet_transactions` read
- [x] No `add_demo_credits` RPC
- [x] No demo-credits button, no hardcoded ₹ amounts in JSX
- [x] `Link` from `@tanstack/react-router`; no `react-router-dom`
- [x] Balance via `useWalletBalance`, costs via `useActionCosts`, realtime via `useWalletRealtime`
- [x] CTA → `<Link to="/topup">`
- [x] Three action tiles, no bundle
- [x] Ledger select limited to `id, entry_type, amount, created_at`
- [x] All 18 entry_type labels mapped; unknown values humanized
- [x] `useAuth()` destructures only `user`
- [x] Default export + `/wallet` route preserved
- [x] AppShell named import with `title="Wallet"`

Reply **apply W4** to write the file.