# Stage 3A-DEMO — Wallet-First Monetization (Demo-Safe)

## Pre-Flight Findings

**1. `src/pages/Topup.tsx` — SKIP for this ship.** Reasons:
- Already wired to a different paid-tier flow (preset INR tiers, `topup_tiers`/`first_topup_bonus` config, "Coming soon" Razorpay button).
- No "Perpetual" wording, no 24h analyst fallback string — clean on copy.
- But mixing a demo `+100 pts` CTA into this paid-tier page would be confusing and out of scope. Wallet page + PaywallPopup are sufficient. Leaving Topup untouched also keeps existing analytics (`topup_initiated`, etc.) intact.

**2. Razorpay secrets:** absent from `fetch_secrets` output. `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` not present. Razorpay edge functions will be **skipped this ship**.

**3. Demo flag source:** `public.stock_picker_runtime_config` confirmed. Note: real column names are `config_key` / `config_value` (not `key`/`value` as the spec wrote). Will use the actual column names. RLS already restricts client reads to service role for some keys — server-only read is enforced naturally.

**4. `wallet_apply_debit` extension:** current CASE in the existing function covers ai_report / video_answer / live_session / sector_view / stock_picker. Will add `followup_open → debit_followup_open` by recreating the function (same signature, same body, one CASE arm added).

---

## Migration (single file — M1..M5)

```sql
-- M1: extend wallet_apply_debit (CREATE OR REPLACE with new CASE arm; body otherwise unchanged)
--     adds: WHEN 'followup_open' THEN 'debit_followup_open'

-- M2: credit_wallet_topup RPC
CREATE OR REPLACE FUNCTION public.credit_wallet_topup(
  p_user_id uuid, p_points int, p_source text,
  p_idempotency_key text, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_existing uuid; v_balance bigint; v_new uuid;
BEGIN
  IF p_user_id IS NULL OR p_points IS NULL OR p_points <= 0
     OR p_source IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid args';
  END IF;
  PERFORM pg_advisory_xact_lock(42001,
    (abs(hashtextextended(p_user_id::text,0)) % 2147483647)::int);

  SELECT id INTO v_existing FROM public.wallet_ledger
   WHERE idempotency_key = p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN
    SELECT COALESCE(SUM(amount),0) INTO v_balance
      FROM public.wallet_ledger WHERE user_id = p_user_id;
    RETURN jsonb_build_object('status','idempotent_replay','new_balance',v_balance);
  END IF;

  INSERT INTO public.wallet_ledger
    (user_id, entry_type, amount, source, idempotency_key, metadata)
  VALUES (p_user_id, 'topup', p_points, p_source, p_idempotency_key, COALESCE(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_new;

  SELECT COALESCE(SUM(amount),0) INTO v_balance
    FROM public.wallet_ledger WHERE user_id = p_user_id;
  RETURN jsonb_build_object('status','ok','entry_id',v_new,'new_balance',v_balance);
END;$$;
REVOKE ALL ON FUNCTION public.credit_wallet_topup(uuid,int,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet_topup(uuid,int,text,text,jsonb) TO service_role;

-- M3
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS founder_beta boolean NOT NULL DEFAULT false;

-- M4
CREATE TABLE public.wallet_debit_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  assistant_row_id uuid,
  query_id uuid,
  action_key text NOT NULL,
  points_attempted integer NOT NULL,
  rpc_status text NOT NULL,
  rpc_payload jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_debit_failures TO authenticated;
GRANT ALL    ON public.wallet_debit_failures TO service_role;
ALTER TABLE public.wallet_debit_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own debit failures"
  ON public.wallet_debit_failures FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX wallet_debit_failures_user_idx
  ON public.wallet_debit_failures (user_id, created_at DESC);

-- M5
INSERT INTO public.stock_picker_runtime_config (config_key, config_value)
VALUES ('demo_topup','{"enabled":true}'::jsonb)
ON CONFLICT (config_key) DO NOTHING;
```

---

## Backend — `supabase/functions/ask-claude/index.ts`

Edit only the `report_followup` path. After existing daily caps and **before** the Step 4 user-message insert, add Open-mode pre-flight:

```ts
const OPEN_FOLLOWUP_COST_PTS = 20;
let isBeta = false;
if (mode === "report_followup" && followup_mode === "open") {
  const { data: prof } = await supabase
    .from("profiles").select("founder_beta").eq("id", user.id).maybeSingle();
  isBeta = (prof as any)?.founder_beta === true;
  if (!isBeta) {
    const { data: wb } = await supabase
      .from("wallet_balances").select("balance").eq("user_id", user.id).maybeSingle();
    const bal = Number((wb as any)?.balance ?? 0);
    if (bal < OPEN_FOLLOWUP_COST_PTS) {
      return json({
        error: "insufficient_points",
        points_required: OPEN_FOLLOWUP_COST_PTS,
        points_available: bal,
        paywall: true,
      }, 402);
    }
  }
}
```
(If `wallet_balances` view is not present, fall back to a SUM on `wallet_ledger`.)

After the assistant row is committed (success path only) and before returning to the client, debit:

```ts
if (mode === "report_followup" && followup_mode === "open" && !isBeta && assistantRowId) {
  const { data: r } = await supabase.rpc("wallet_apply_debit", {
    p_user_id: user.id,
    p_action_key: "followup_open",
    p_points: OPEN_FOLLOWUP_COST_PTS,
    p_query_id: query_id ?? null,
    p_idempotency_key: `followup_open:${assistantRowId}`,
  });
  const status = (r as any)?.status;
  if (status !== "ok" && status !== "idempotent_replay") {
    await supabase.from("wallet_debit_failures").insert({
      user_id: user.id, assistant_row_id: assistantRowId,
      query_id: query_id ?? null, action_key: "followup_open",
      points_attempted: OPEN_FOLLOWUP_COST_PTS,
      rpc_status: status ?? "null", rpc_payload: r ?? null,
      idempotency_key: `followup_open:${assistantRowId}`,
    });
    console.error("WALLET_DEBIT_FAIL", { user_id: user.id, assistantRowId, status });
  }
}
```
Explain-mode path completely untouched. Existing rate-limit / context / Claude logic untouched.

---

## New edge function — `supabase/functions/demo-topup-credit/index.ts`

- verify_jwt = true (default)
- Resolve user via `Authorization` bearer + service-role client
- Read `profiles.founder_beta` → if not true, return 403 `{error:"forbidden"}`
- Read `stock_picker_runtime_config` row `config_key='demo_topup'` → if `config_value.enabled !== true`, return 403
- Compute IST day: `new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"})` → `YYYY-MM-DD`
- `p_idempotency_key = demo:<user_id>:<YYYY-MM-DD-IST>`
- `supabase.rpc("credit_wallet_topup", { p_user_id, p_points: 100, p_source: "demo_grant", p_idempotency_key, p_metadata: { kind: "demo" } })`
- Return `{ status, new_balance }`
- Standard CORS

Listed in `supabase/config.toml`.

---

## Frontend

### `src/lib/firm-details.ts`
- Rename `validity` → `validityInternalNote` (with comment "internal only — never render in product UI").
- Add `export const MONETIZATION_DISCLAIMER = "Stockera Technology Private Limited is a SEBI-registered Research Analyst (Registration No. INH000019071). Research reports and AI-generated analyses are for informational purposes only and do not constitute personalized investment advice. Investments in securities are subject to market risks; please read all related documents carefully before investing. Past performance is not indicative of future returns. Investors may verify our registration status at www.sebi.gov.in.";`
- grep `FIRM.validity` (no callers expected) — if any product surface reads it, switch them to a neutral string in same patch.

### New: `src/components/monetization/SebiFooterNote.tsx`
Renders `MONETIZATION_DISCLAIMER` verbatim in small muted text.

### New: `src/components/monetization/TestModeBadge.tsx`
Static badge: "DEMO MODE — Razorpay disabled".

### New: `src/components/monetization/PaywallPopup.tsx`
shadcn Dialog. Props: `{ open, onClose, balance, required, userId }`.
- Title "Add points to keep asking"
- Body: balance vs required (20 pts), explain Open vs Explain.
- CTA area — runs a small server probe: optimistically attempt `supabase.functions.invoke("demo-topup-credit")` only when user clicks the visible button. To decide visibility without leaking the flag, call demo-topup-credit in **preflight=probe** mode? Simpler approach approved by spec: the frontend learns availability from `profiles.founder_beta` (the user's own row is RLS-readable) AND attempts the function call lazily; if 403, hide and show fallback text.
  - On mount: read own `profiles.founder_beta` via supabase client (`select founder_beta where id=auth.uid()`).
  - If `founder_beta === true`: show button "Demo Top-Up (+100 pts)". On click → invoke `demo-topup-credit`. On 200: toast "+100 pts credited", refresh balance, close popup. On 403: replace CTA with the locked fallback text.
  - If `founder_beta === false`: show **plain text only** (no button, no clickable, no disabled element): `Top-up will be enabled after demo approval.`
- Footer: `<TestModeBadge />` + `<SebiFooterNote />`.

(This keeps the demo-flag check server-side; founder_beta is per-user data the client legitimately owns.)

### `src/components/report/AskClaudeFollowup.tsx`
Add state `const [paywall, setPaywall] = useState<{required:number;balance:number}|null>(null);`
In `handleSend` error handling, detect 402 BEFORE the existing 429/413/default branches:
```ts
if (status === 402) {
  // Re-read body to get required/available
  let body:any=null; try { body = await ctx!.json(); } catch {}
  setPaywall({ required: body?.points_required ?? 20, balance: body?.points_available ?? 0 });
  // do NOT appendLocal assistant text
} else if (status === 429) { ... existing ... }
```
Render `<PaywallPopup open={!!paywall} {...paywall} userId={userId} onClose={()=>setPaywall(null)} />` at end. All Stage 2.3.3 RATE_LIMIT_LINE / NETWORK_ERROR_LINE / CONTEXT_TOO_LARGE_LINE branches preserved verbatim for non-402.

### `src/pages/Wallet.tsx`
Append a "Demo top-up" card above existing content:
- Read own `profiles.founder_beta`.
- If true: "Demo Top-Up (+100 pts)" button → `demo-topup-credit`.
- If false: plain text "Top-up will be enabled after demo approval."
- Always render `<TestModeBadge />` + `<SebiFooterNote />` at card bottom.

### `src/pages/Topup.tsx`
**Untouched.** Reason: paid-tier flow with its own analytics + Razorpay-coming-soon button. Adding demo CTA here mixes paid funnel with free demo grant. Not a Stage 3A-demo surface.

---

## Deployment Plan

1. Run migration via `supabase--migration` (await user approval).
2. Deploy edge functions `ask-claude` + `demo-topup-credit` via `supabase--deploy_edge_functions`.
3. Publish frontend via `preview_ui--publish`.
4. Razorpay functions: **NOT** deployed. Report: "Razorpay functions skipped — awaiting founder-added TEST secrets."

---

## UAT (post-deploy)

I will run/verify the 9-test checklist and report outcomes. Tests 1–3, 5, 8, 9 are runnable with `supabase--read_query` + `supabase--curl_edge_functions`. Test 4 (non-founder direct call → 403) via `supabase--curl_edge_functions` with a non-beta user token. Test 6 (forced failure) via a one-shot SQL probe inserting a fake failure row; assistant-side simulation skipped to avoid corrupting real ledger. Test 7 via `rg "SEBI-registered Research Analyst" src/`.

---

## Hard Stops Honored

deterministic_router, Stage 2.3.2 context, useQueryTypeDetection, Explain success path, Claude model env, monthly subscriptions, separate Razorpay demo page — all untouched. No frontend read of `demo_topup` flag. No direct frontend call to `credit_wallet_topup`. No exposure of demo top-up to non-founder_beta users beyond the static disabled-text string.

---

**Awaiting approval to apply.**
