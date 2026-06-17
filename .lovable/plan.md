# W6.11 (Final) — Wallet Debit Wiring for Paid Actions

## 1) Success points

- **QueryForm.tsx** — line 792, immediately after `const queryId = inserted.id as string;` (post `queries.insert(...).select("id").single()`). Debit runs before either navigation path (line 846 or line 879).
- **StockPickerFlow.tsx** — inside `runQuery`'s `try`, after the three success guards (`error`, `!data`, `!data.ok`) and before `setResult(data)` (line 272).

## 2) Stable idempotency anchors

- **QueryForm**: `queryId` (UUID from `queries.id`) → key `debit:${debitActionKey}:${queryId}`.
- **StockPickerFlow**: `data.stocks[0]?.batch_id` (server-issued UUID) → key `debit:stock_picker:${batchId}`. **No fallback.** If `batch_id` is missing or `data.stocks.length === 0`, the debit is skipped entirely (option **b**).

## 3) QueryForm action-key correction

Replace
```ts
const paywallActionKey = intent === "sector_view" ? "sector_view" : "ai_report";
```
with
```ts
const paywallActionKey =
  intent === "sector_view" ? "sector_view" :
  intent === "educational" ? "educational" :
  "ai_report";
```
Reused as `debitActionKey`. Educational has `required_points <= 0` today, so the `paywall_active && required_points > 0` guard prevents any RPC call (and prevents the SQL function from rejecting an unknown action key). No SQL change in W6.11.

## 4) Unified diffs (2 files only)

### `src/components/query/QueryForm.tsx`

```diff
@@ -582,12 +582,16 @@
-    // W6.8 — Paywall gate (dark by default; fail-OPEN on any error).
-    const paywallActionKey = intent === "sector_view" ? "sector_view" : "ai_report";
+    // W6.8 — Paywall gate (dark by default; fail-OPEN on any error).
+    // W6.11 — corrected mapping: educational no longer masquerades as ai_report.
+    const paywallActionKey =
+      intent === "sector_view" ? "sector_view" :
+      intent === "educational" ? "educational" :
+      "ai_report";
     const gate = await checkPaywallGate(paywallActionKey, user?.id);
     if (!gate.allow) {
       setPaywallGate(gate);
       setPaywallOpen(true);
       return;
     }
@@ -791,6 +795,38 @@
       const queryId = inserted.id as string;
       createdQueryId = queryId;
 
+      // W6.11 — wallet debit (dark-by-default).
+      // Only debit when paywall is actively enforced AND the action has a real cost.
+      if (gate.paywall_active && gate.required_points > 0) {
+        const debitActionKey = paywallActionKey;
+        const debitPoints = gate.required_points;
+        const { data: debitData, error: debitErr } = await supabase.rpc("wallet_apply_debit", {
+          p_user_id: freshUser.id,
+          p_action_key: debitActionKey,
+          p_points: debitPoints,
+          p_query_id: queryId,
+          p_idempotency_key: `debit:${debitActionKey}:${queryId}`,
+        });
+        const debitStatus =
+          (debitData && typeof debitData === "object" && "status" in debitData)
+            ? (debitData as { status?: string }).status
+            : undefined;
+        if (debitErr) {
+          console.error("[wallet_apply_debit] rpc error", debitErr);
+          toast.error("Could not debit your wallet. Please try again.");
+          setGenStage("idle");
+          setSubmitting(false);
+          return;
+        }
+        if (debitStatus === "insufficient_funds") {
+          toast.error("Insufficient credits. Please top up to continue.");
+          setGenStage("idle");
+          setSubmitting(false);
+          return;
+        }
+        // "ok" and "idempotent_replay" → continue normally.
+      }
+
       supabase
         .from("audit_events")
```

### `src/components/stock-picker/StockPickerFlow.tsx`

```diff
@@ -268,7 +268,43 @@
       if (error) throw new Error(error.message);
       if (!data) throw new Error("Empty response from server.");
       if (!data.ok) throw new Error(data.error || "Server returned an error.");
-      setResult(data);
+
+      // W6.11 — wallet debit (dark-by-default), batch_id-anchored only.
+      // Server returns ok:true with stocks:[] in legitimate empty-universe
+      // cases (no_completed_batch / no_survivors_match_filter). Those carry
+      // no batch_id, so we skip the debit and notify the user — option (b).
+      if (gate.paywall_active && gate.required_points > 0 && user?.id) {
+        const batchId = data.stocks[0]?.batch_id;
+        if (!batchId) {
+          toast.message("No picks available — you were not charged.");
+        } else {
+          const { data: debitData, error: debitErr } = await supabase.rpc("wallet_apply_debit", {
+            p_user_id: user.id,
+            p_action_key: "stock_picker",
+            p_points: gate.required_points,
+            p_query_id: null,
+            p_idempotency_key: `debit:stock_picker:${batchId}`,
+          });
+          const debitStatus =
+            (debitData && typeof debitData === "object" && "status" in debitData)
+              ? (debitData as { status?: string }).status
+              : undefined;
+          if (debitErr) {
+            console.error("[wallet_apply_debit] rpc error", debitErr);
+            toast.error("Could not debit your wallet. Please try again.");
+            return;
+          }
+          if (debitStatus === "insufficient_funds") {
+            toast.error("Insufficient credits. Please top up to continue.");
+            return;
+          }
+          // "ok" and "idempotent_replay" → continue normally.
+        }
+      }
+
+      setResult(data);
     } catch (e) {
       setErrorMsg((e as Error).message || "Unknown error");
     } finally {
```

`gate` is the existing local from `runQuery` (line 237). Early `return`s fall through to the existing `finally` which clears the interval and `setSubmitting(false)`. Empty-state path still calls `setResult(data)` so the existing empty UI renders.

## 5) Anti-fabrication checklist

- A. Only QueryForm.tsx and StockPickerFlow.tsx changed ✓
- B. `src/lib/paywall.ts` untouched ✓
- C. `src/lib/points.ts` untouched ✓
- D. QueryForm mapping covers `sector_view`, `educational`, `ai_report` ✓
- E. No debit when `paywall_active === false` or `required_points <= 0` ✓
- F. RPC params exact: `p_user_id`, `p_action_key`, `p_points`, `p_query_id`, `p_idempotency_key` ✓
- G. StockPicker uses literal `"stock_picker"` ✓
- H. Educational does not debit as `ai_report` ✓
- I. Idempotency anchors are server-issued UUIDs only (`queries.id`, `batch_id`); no `generated_at`, `Date.now`, or `Math.random` ✓
- J. No `react-router-dom` imports ✓

## 6) Validation matrix

| # | Scenario | Expected |
|---|---|---|
| 1 | Flag OFF | Gate fail-opens, no RPC, behavior unchanged |
| 2 | Flag ON, sufficient, `ai_report` | Insert → RPC once → `debit_ai_report` row → navigate |
| 3 | Flag ON, sufficient, `sector_view` | Insert → `debit_sector_view` row → navigate |
| 4 | Flag ON, `educational` (0 points) | Guard skips RPC → free |
| 5 | Flag ON, `stock_picker`, picks returned | RPC once → `debit_stock_picker` → `setResult`; replay same `batch_id` → `idempotent_replay`, no double charge |
| 6 | Flag ON, `stock_picker`, `stocks: []` | No RPC, toast "No picks available — you were not charged.", `setResult(data)` renders empty state |
| 7 | RPC `insufficient_funds` | Toast, no navigation / no `setResult`, submitting cleared via `finally` |
| 8 | RPC unexpected error | Toast, halt downstream, submitting cleared |

## 7) Confirmation

- No file outside the two listed is touched.
- `paywall.ts`, `points.ts`, `PaywallDialog`, all pages, Supabase client, auth, pricing, SEBI/legal copy, dummy topup flow, welcome bonus, edge functions, SQL — all untouched.
- Razorpay remains ON HOLD.

STOP. Awaiting `apply W6.11`.
