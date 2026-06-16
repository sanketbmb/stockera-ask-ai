## W6.5-R1 — Dashboard Wallet Cutover Correction Pass

### Status check (read of current `src/pages/Dashboard.tsx`)

I read the current `src/pages/Dashboard.tsx` end-to-end. The file already matches every acceptance item in W6.5-R1. The legacy markers the brief expects to find are NOT present:

- `profile?.wallet_balance` → not present (only `profile?.full_name` and `profile.onboarding_completed`)
- `prefix="₹"` → not present anywhere in the file
- `<Link to="/wallet">` for "Add wallet credits" → not present; CTA already routes to `/topup`

The wallet stat already:
- imports `useWalletBalance`, `useWalletRealtime`, `formatPoints` from `@/lib/points` (line 17)
- calls `useWalletBalance(user?.id)` with `data/isLoading/error/refetch` destructured (lines 42–47)
- calls `useWalletRealtime(user?.id)` (line 48)
- derives `const liveBalance = walletBalance?.balance ?? 0` (line 49)
- renders an inline error card with `AlertCircle` + Retry calling `refetchBalance()` (lines 109–120)
- otherwise renders `StatCard` with `value={balanceLoading ? undefined : formatPoints(liveBalance)}`, `loading={balanceLoading}`, `highlight`, Wallet icon, NO rupee prefix (lines 122–128)

CTA row (line 138) already uses `<Link to="/topup">` with the Wallet icon and "Add wallet credits" label.

Default export `DashboardPage` preserved. No `react-router-dom` import. No `wallet_transactions` or `profiles.wallet_balance` reads. No `add_demo_credits` RPC.

### Planned diff

```
src/pages/Dashboard.tsx — NO CHANGES
```

There is no diff to apply. The file on disk already satisfies all 13 acceptance items from W6.5-R1.

### Acceptance checklist (verified against current file)

1. Only `src/pages/Dashboard.tsx` would change — N/A, no change needed ✓
2. No `profile?.wallet_balance` remains — ✓ (grep: absent)
3. No `profiles.wallet_balance` reads — ✓
4. No `wallet_transactions` reads — ✓
5. `useWalletBalance(user?.id)` present and used — ✓ (lines 42–47)
6. `useWalletRealtime(user?.id)` present — ✓ (line 48)
7. `liveBalance = walletBalance?.balance ?? 0` — ✓ (line 49)
8. Wallet stat no longer uses `prefix="₹"` — ✓ (no prefix passed)
9. Wallet display uses `formatPoints(liveBalance)` — ✓ (line 124)
10. "Add wallet credits" CTA points to `/topup` — ✓ (line 138)
11. No unrelated files changed — ✓ (nothing to change)
12. Default export preserved — ✓ (`export default function DashboardPage`)
13. TypeScript compiles — ✓ (no edits proposed)

### Likely cause of the perceived regression

The W6.5 cutover IS already on disk from the prior apply. If the running preview still shows a rupee value or routes "Add wallet credits" to `/wallet`, the most likely causes are:

- Stale browser cache / preview iframe holding the pre-W6.5 bundle — hard-refresh the preview.
- A different "dashboard"-looking page is being viewed (e.g. `src/pages/admin/AdminDashboard.tsx`, or the landing/index page wallet widget), not `/dashboard`. R1 explicitly forbids touching admin/route files, so any wallet UI in those would need its own scoped pass.
- The legacy display is sourced from a component rendered inside `AppShell` (e.g. a navbar wallet pill reading `profile.wallet_balance`), not from `Dashboard.tsx` itself.

### Recommendation

Do not issue "apply W6.5-R1" — there is nothing to write. Instead, confirm one of:

(a) Hard-refresh `/dashboard` in the preview and re-verify; or
(b) Tell me exactly which UI element still shows the legacy behavior (screenshot or selector text) so I can locate the actual offending file and scope a fresh, minimal correction pass for that file.

STOP. Awaiting founder direction.