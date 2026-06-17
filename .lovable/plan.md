## Acknowledged

**W-Onb-Copy-Fix-1** (separate ticket — logged, NOT addressed here): `src/components/onboarding/OnboardingTour.tsx` step "wallet" still references `"₹100 free credits"` / `"2 free AI reports"`, contradicting current `welcome_bonus` config (`{points:250, expiry_days:30, one_per_phone:true}`). Tracked separately. No changes to that file in W-Onb-1.

---

## W-Onb-1: Welcome Celebration Modal (NEW)

A standalone celebration modal shown ONCE on the user's first dashboard load after signup. Independent of the Joyride guided tour (which gates on `profiles.onboarding_completed`).

### Scope
Two files touched. No backend, no schema, no auth, no business logic.

1. **NEW** `src/components/onboarding/WelcomeModal.tsx`
2. **EDIT** `src/pages/Dashboard.tsx` — mount the modal (one import + one render line)

Nothing else changes. `OnboardingTour.tsx` is not touched.

### Component: `src/components/onboarding/WelcomeModal.tsx`

- Props: none. Self-contained.
- Built on existing shadcn `Dialog` (`@/components/ui/dialog`) for consistency with the rest of the app.
- Gate logic (runs in `useEffect` after mount, client-only):
  1. If `typeof window === "undefined"` → no-op (SSR safety).
  2. If `localStorage.getItem("asktheexpert_welcome_seen_v1")` is truthy → do not open.
  3. Else open modal (small delay e.g. 400ms so it feels intentional after dashboard paints).
- On dismiss (close button, CTA click, overlay click, ESC): write `localStorage.setItem("asktheexpert_welcome_seen_v1", "1")` so it never shows again on this device.
- Storage key (exact, case-sensitive): `asktheexpert_welcome_seen_v1`.

#### Content (celebration, founder-credible, no fabricated numbers)
- Title: "Welcome to Ask The Expert 🎉"
- Body: "We've credited **250 points** to your wallet (valid for 30 days) — enough for ~5 AI reports. Use them to research stocks, get sector views, or ask SEBI-registered analysts."
- Primary CTA: "Post your first query" → navigates to `/post-query` (and closes modal + sets flag).
- Secondary CTA: "View wallet" → navigates to `/wallet` (and closes modal + sets flag).
- Small footer line: "SEBI Reg: INH000019071 · Educational only" (matches existing disclaimer tone — using already-rendered firm copy patterns; no new firm strings invented).

All numbers (250, 30 days, ~5 reports) come from the verified `welcome_bonus` config the user provided. No invented stats.

### Wiring in `src/pages/Dashboard.tsx`

- Add import: `import { WelcomeModal } from "@/components/onboarding/WelcomeModal";`
- Render `<WelcomeModal />` once inside the existing `AppShell` tree (alongside `<OnboardingTour />`). Both can coexist — they read different gates (modal: localStorage; tour: `profiles.onboarding_completed`).
- No changes to data queries, stat cards, or any existing logic.

### Trigger semantics ("first dashboard load after signup")
- The modal opens whenever the user lands on the dashboard AND has never dismissed it on this browser. This is the standard, low-risk interpretation: localStorage is the source of truth, exactly as the brief specified the key.
- It does NOT depend on signup timestamps, profile flags, or wallet state — keeping it isolated from W-Onb-Copy-Fix-1 and from the tour.

### Anti-fabrication checklist
- [x] Exact localStorage key: `asktheexpert_welcome_seen_v1`
- [x] New file path: `src/components/onboarding/WelcomeModal.tsx`
- [x] Rendered from `src/pages/Dashboard.tsx` only
- [x] No edits to `OnboardingTour.tsx`
- [x] No new packages, no schema changes, no server functions
- [x] All numbers sourced from verified `welcome_bonus` config (250 / 30 / ~5)
- [x] Uses existing shadcn `Dialog`, existing router `Link`/`useNavigate`

### Validation matrix
| Scenario | Expected |
| --- | --- |
| Brand-new signup → first dashboard visit | Modal opens after ~400ms |
| Close modal → reload dashboard | Modal does NOT reopen |
| Click "Post your first query" | Navigates to `/post-query`, key set, modal closes |
| Click "View wallet" | Navigates to `/wallet`, key set, modal closes |
| Returning user with key already set | Modal never appears |
| SSR / no `window` | No crash, no render |
| Coexistence with `OnboardingTour` | Both can show; independent gates |

### Out of scope (explicit)
- Fixing OnboardingTour stale `₹100` copy → tracked as **W-Onb-Copy-Fix-1**
- Any wallet/credit logic, paywall, or DB writes
- Analytics events (can be added in a follow-up if requested)

**STOP — awaiting `apply W-Onb-1`.**
