# W1 — Points Economy + Analytics + Subscriptions (Migration Only)

## Scope

**Exactly one new file. Zero edits to any other file. No execution.**

- New file: `supabase/migrations/{YYYYMMDDHHMMSS}_w1_points_economy_paywall_analytics.sql` (UTC timestamp prefix generated at write time)
- Fully additive. Legacy `wallet_transactions` + `profiles.wallet_balance` untouched.
- Ships dark: `paywall_v1_enabled = false`; all promo flags `promo_active = false` except `first_topup_bonus.active = true`.
- Reuses existing `public.stock_picker_runtime_config` for all config seeds (no new `app_runtime_config` table). SP-1.6 rows (`zone_v2_*`, `profile_knobs_v2_*`) are not referenced.

## What the migration creates

### Tables (5)
1. `public.wallet_ledger` — append-only points ledger with `entry_type` CHECK over 18 enum-like values, `idempotency_key` UNIQUE, `expiry_at`, `metadata jsonb`.
2. `public.analytics_events` — session/event log with UTM + `ip_hash`.
3. `public.subscription_plans` — plan catalogue keyed by text id (`free`/`pro`/`expert`).
4. `public.user_subscriptions` — per-user subscription with billing cycle, status, period bounds, Razorpay id.
5. `public.points_expiry_log` — audit of expired points, `CHECK (points_expired > 0)`, FK → `wallet_ledger(id)`.

### View (1)
6. `public.wallet_balances` — `SECURITY INVOKER` view: per-user `balance`, `welcome_bonus_remaining`, `welcome_bonus_expires_at`, `last_ledger_at`, summed from `wallet_ledger`.

### RPCs (4) — all `SECURITY DEFINER` with `SET search_path = public, pg_temp`
- `wallet_apply_debit(p_user_id, p_action_key, p_points, p_query_id, p_idempotency_key) → jsonb` — idempotent debit; advisory lock `(42001, hashtextextended(user_id))`; handles `video_answer_promo` counter increment + auto-disable when cap reached; returns `{status: ok|insufficient_funds|idempotent_replay, ...}`.
- `grant_welcome_bonus(p_user_id, p_phone) → jsonb` — advisory lock `(42002, hashtextextended('welcome:'||phone))`; one-per-user AND one-per-phone guard; reads `welcome_bonus` config (default 250 pts / 30 days).
- `grant_first_topup_bonus(p_user_id, p_topup_amount_inr) → jsonb` — checks `first_topup_bonus` config, signup-within-window from `auth.users.created_at`, ≥ min top-up; grants free video points from `action_costs.video_answer.points`.
- `expire_welcome_bonus(p_user_id) → jsonb` — advisory lock `(42003, hashtextextended('expire:'||user_id))`; iterates expired welcome rows not yet in `points_expiry_log`, inserts matching `welcome_expired` negative ledger row (capped at current balance, never below 0) AND a `points_expiry_log` row (no zero-row inserts).

All four: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE ... TO service_role`.

### Triggers (3) — guarded with `DO $$ ... IF NOT EXISTS ... $$`
- `wallet_ledger_no_update_trg` BEFORE UPDATE → `wallet_ledger_block_modify()` raises.
- `wallet_ledger_no_delete_trg` BEFORE DELETE → same function.
- `profiles_welcome_bonus_trg` AFTER INSERT OR UPDATE OF `phone` ON `public.profiles` → `profiles_grant_welcome_on_phone()` calls `grant_welcome_bonus` when phone is non-empty and (insert OR phone changed).

### Config seeds into `stock_picker_runtime_config` (12 keys)
`paywall_v1_enabled` (false), `sebi_ra_registration` (`"INH000019071"`), `action_costs`, `topup_tiers`, `welcome_bonus`, `first_topup_bonus` (active=true), `video_answer_promo` (inactive), `pro_launch_promo` (inactive), `expert_launch_promo` (inactive), `referral_config` (inactive), `preferred_language_options`, `seo_config`. All via `ON CONFLICT (config_key) DO UPDATE SET config_value, description, updated_at`.

### Subscription plan seeds (3)
`free` / `pro` (₹299/mo, 400 pts, cap 800, 1 free video) / `expert` (₹799/mo, 1200 pts, cap 2400, 2 video + 1 live). `ON CONFLICT (id) DO UPDATE` on all mutable columns.

### RLS (all 5 tables)
- `wallet_ledger`: SELECT own (authenticated).
- `analytics_events`: INSERT (anon+authenticated, `user_id IS NULL OR = auth.uid()`); SELECT own.
- `subscription_plans`: SELECT where `is_active = true` (anon+authenticated).
- `user_subscriptions`: SELECT own.
- `points_expiry_log`: SELECT own.

All wrapped in `DO $$ IF NOT EXISTS pg_policies ... $$` blocks for idempotency.

### Indexes (10)
`wallet_ledger`: `(user_id, created_at DESC)`, `(entry_type)`, partial `(query_id) WHERE NOT NULL`, partial `(expiry_at) WHERE NOT NULL`.
`analytics_events`: `(user_id, created_at DESC)`, `(session_id, created_at DESC)`, `(event_name, created_at DESC)`.
`user_subscriptions`: `(user_id, status)`, `(current_period_end)`.
`points_expiry_log`: `(user_id, expired_at DESC)`.

## Acceptance gates the diff will satisfy

- 1 new file, 0 edits elsewhere
- 5 tables + 1 view + 4 RPCs + 3 triggers + 10 indexes
- All RPCs `SECURITY DEFINER`, pinned search_path, EXECUTE granted only to `service_role`
- Advisory lock namespaces 42001 / 42002 / 42003 used exactly as spec
- `points_expiry_log.points_expired > 0` CHECK; no zero-row inserts in `expire_welcome_bonus`
- No DROP, no TRUNCATE, no backfill, no edits to `wallet_transactions` / `profiles.wallet_balance` / `profiles.phone`
- Idempotent: `IF NOT EXISTS` on tables/indexes, guarded DO blocks on policies/triggers, `ON CONFLICT` on all seeds

## SQL body

The file's SQL body is exactly the SQL block you supplied (Sections 1–8), unchanged, written verbatim into the single new migration file. No additions, no omissions.

## Stop gate

After writing the file, STOP. No `supabase db push`, no execution, no other file touched. Wait for explicit approval before any execution step.
