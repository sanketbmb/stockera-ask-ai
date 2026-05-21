
## Root cause found

The last security migration revoked `EXECUTE` on `public.has_role(uuid, app_role)` from `authenticated` and `anon`. But the `profiles` table has an RLS policy `profiles_admin_read` that calls `has_role(auth.uid(), 'admin')` — Postgres evaluates **every** policy on a table, so authenticated users now get **403 "permission denied for function has_role"** when reading their **own** profile.

Network log confirms this:
```
GET /rest/v1/profiles?...id=eq.<me>  → 403
{"code":"42501","message":"permission denied for function has_role"}
```

That's why on `/referral` the link shows "Generating…" and the sidebar shows `₹0 wallet` even though the DB row exists with `wallet_balance=100` and `referral_code=STKE3D5D1`. The same failure cascades to `analyst_profiles`, `queries`, `notifications`, `user_roles` — anywhere a policy calls `has_role(...)`. This also breaks "Post a Query" (analyst list 403, AI report invoke will 403 on RLS reads).

## Fix plan

### 1. Restore RLS-safe function grants (migration)
Grant `EXECUTE` back to `authenticated` (and `anon` where policies are evaluated for anon traffic) on the helper functions used inside RLS policies. These are `SECURITY DEFINER` with locked `search_path`, so they are safe to expose — they only return a boolean / role for the calling user.

- `GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;`
- `GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;`
- Keep `deduct_wallet_balance`, `admin_adjust_wallet` restricted to `service_role` only (they are called from edge functions / server, never from the browser).
- `add_demo_credits` stays callable by `authenticated` (self-gated).

### 2. Verify referral payout flow
- `handle_new_user` trigger already creates the profile (with auto `referral_code`), `user_roles`, and ₹100 signup bonus. Confirmed working for current user.
- Add referral handling: when `raw_user_meta_data->>'referral_code'` is set on signup, look up the referrer profile, insert a `referrals` row (`status='credited'`, `payout=50`), and credit ₹50 to the **referrer's** wallet via `wallet_transactions`. The referee already gets ₹100 via the existing signup bonus — per the UI copy ("you both get ₹50") I'll align the model to **₹50 to referrer + ₹50 bonus to referee on top of the ₹100 welcome**, so both sides see a referral credit. Confirm this matches your intended model (see Question below).

### 3. Post-Query AI report flow
Once profile reads work again, `generate-ai-report` edge function will be reachable. Will verify end-to-end via browser test after deploy.

### 4. Step 2 alignment polish (`QueryForm.tsx`)
The Buy Price / Holding row is uneven because:
- "Buy Price *" label has an inline `<Info>` tooltip icon → taller label
- "Holding duration *" label is plain text → shorter label
- The two inputs therefore start at different Y offsets.

Fix: make the grid `items-end`, give both labels a fixed `h-5` line-height row, and align the `<Info>` icon inside the label without changing label height. Also match input heights (`h-10`) between `<Input>` and `<SelectTrigger>`.

### 5. QA pass before handoff
After the migration is approved & deployed:
- Browser-test signup with referral code → confirm both wallets credited
- Browser-test "Post a Query" end-to-end → confirm AI report renders on `/report/:id`
- Smoke-test main nav: Dashboard, My Queries, Wallet, Refer & Earn, Settings, Pricing
- Check console + network for 4xx/5xx
- Report a clean bug list (with fixes) before you demo

## Question for you

Your referral model — please confirm one of:
- **(A) ₹50 referrer + ₹50 referee** (in addition to the ₹100 welcome bonus). Matches the "you both get ₹50" copy on the banner.
- **(B) ₹50 referrer only** (referee just gets the standard ₹100 welcome). Matches the "/refer" page copy ("Earn ₹50 for every friend").

I'll default to **(A)** unless you say otherwise, since that's what the landing banner promises users.

## Technical notes

- Migration is a pure `GRANT` change — no schema mutation, no data backfill.
- Referral credit will be wired into `handle_new_user` (single trigger, atomic with profile creation) so there's no race condition between signup and credit.
- No edge-function changes needed for the RLS fix; the existing `generate-ai-report` will start working as soon as profile reads succeed.
