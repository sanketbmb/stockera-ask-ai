## 1) DISCOVERY SUMMARY

File: `src/components/onboarding/OnboardingTour.tsx`

Wallet step (index 2 of `STEPS`, lines 19–24):
- Target: `'[data-tour="wallet"]'`
- Stale title: `"₹100 free credits"`
- Stale body: `"We've added ₹100 to your wallet — that's 2 free AI reports. Top up anytime."`

Only ONE stale wallet copy occurrence in this file. No other strings reference `₹100`, `2 free AI reports`, or `Top up anytime` here. The 3 other steps (dashboard-stats, post-query, recent-queries) are unrelated and stay untouched.

No logic, gating, ordering, target selector, placement, styling, or behavior changes are required. Pure copy swap on two string fields.

## 2) SCOPE DECISION

Exactly one file touched: `src/components/onboarding/OnboardingTour.tsx`.

The stale copy lives only inside the `STEPS` array literal in this file. The displayed wallet-step text is sourced directly from `title` and `content` here — no constants, no i18n, no comment references to `₹100` elsewhere in this file. Replacing those two fields fully satisfies the acceptance criteria without affecting WelcomeModal, Dashboard, paywall, or any other module.

## 3) FULL UNIFIED DIFF

```diff
--- a/src/components/onboarding/OnboardingTour.tsx
+++ b/src/components/onboarding/OnboardingTour.tsx
@@ -19,8 +19,8 @@ const STEPS: Step[] = [
   {
     target: '[data-tour="wallet"]',
-    title: "₹100 free credits",
-    content: "We've added ₹100 to your wallet — that's 2 free AI reports. Top up anytime.",
+    title: "250 free credits",
+    content: "We've credited 250 points to your wallet (valid for 30 days) — enough for ~5 AI reports. Use them to research stocks, get sector views, or ask SEBI-registered analysts.",
     placement: "bottom",
   },
```

## 4) ANTI-FABRICATION CHECKLIST

- A) Only OnboardingTour.tsx touched — PASS
- B) WelcomeModal.tsx untouched — PASS
- C) Dashboard.tsx untouched — PASS
- D) No DB/schema/RLS changes — PASS
- E) No new dependencies — PASS
- F) No logic/state/order/route changes — PASS
- G) No react-router-dom — PASS
- H) Exact locked copy used — PASS
- I) No stale "₹100" / "2 free AI reports" / "Top up anytime" remains in this file — PASS

## 5) VALIDATION MATRIX

| Scenario | Before | After |
|---|---|---|
| Wallet step title | "₹100 free credits" | "250 free credits" |
| Wallet step body | "We've added ₹100 to your wallet — that's 2 free AI reports. Top up anytime." | "We've credited 250 points to your wallet (valid for 30 days) — enough for ~5 AI reports. Use them to research stocks, get sector views, or ask SEBI-registered analysts." |
| Step order (dashboard → post-query → wallet → recent-queries) | unchanged | unchanged |
| Wallet step target `[data-tour="wallet"]` | unchanged | unchanged |
| Joyride gating via `profile.onboarding_completed` | unchanged | unchanged |
| Finish/skip writes `onboarding_completed: true` | unchanged | unchanged |
| Other 3 step copies | unchanged | unchanged |
| Styling/motion/locale | unchanged | unchanged |

## 6) FINAL STATUS

PLAN ONLY — STOP. Awaiting explicit apply W-Onb-Copy-Fix-1.
