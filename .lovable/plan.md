
## Task A — Cloudflare Turnstile Integration

### Grep results
- **G1 signInWithPassword**: `src/pages/auth/Login.tsx:47`, `src/pages/admin/AdminLogin.tsx:32`
- **G2 supabase.auth.signUp**: `src/pages/auth/Signup.tsx:62`, `src/pages/admin/AnalystApplication.tsx:136`
- **G3 resetPasswordForEmail**: `src/pages/auth/Login.tsx:67` (inline "Forgot password" flow — no separate ForgotPassword page exists)
- **G5 signInWithOAuth**: `src/lib/google-auth.ts:20` (untouched — Google OAuth stays captcha-free)

Note: There is no `src/pages/ForgotPassword.tsx`; reset lives inside `Login.tsx`. `AdminLogin.tsx` is out of the spec's file list but uses `signInWithPassword`; I will treat it as out-of-scope per your strict list and only touch the 4 explicitly-named surfaces (Login, Signup, forgot-password handler inside Login, AnalystApplication). Please confirm if AdminLogin should also be gated.

### Files to change / add
1. **`index.html`** — add async Turnstile script in `<head>`.
2. **`src/types/turnstile.d.ts`** (NEW) — global `window.turnstile` typing.
3. **`src/components/ui/TurnstileWidget.tsx`** (NEW) — wrapper using `window.turnstile.render/reset/remove`, sitekey `0x4AAAAAAD2UbQUFjR5PF19H`, theme `auto`, size `normal`, exposes imperative `reset()` via `forwardRef`, polls for script readiness with a skeleton fallback, cleans up on unmount, handles expiry via callback.
4. **`src/pages/auth/Login.tsx`** — add `captchaToken` state + `turnstileRef`, render widget above Sign In button, disable submit until token present, pass `options: { captchaToken }` to `signInWithPassword`, reset widget on error. Same treatment inside `handleForgot` for `resetPasswordForEmail` (token stored/rendered inline near password field applies to both flows since they share the form).
5. **`src/pages/auth/Signup.tsx`** — same pattern; pass `captchaToken` inside existing `options` block alongside `emailRedirectTo` and `data`.
6. **`src/pages/admin/AnalystApplication.tsx`** — same pattern around the `signUp` call.

Google OAuth button untouched. PasswordInput untouched. Supabase client untouched. No new npm deps.

### Widget behavior
- Renders once when the Turnstile script loads (polling `window.turnstile` up to ~5s, then shows an inline error if unavailable).
- `onVerify(token)` fires on solve; `onExpire` fires on `expired-callback` and the widget auto-resets; `onError` fires on `error-callback`.
- Parent calls `ref.current?.reset()` after a failed auth call to force a fresh token.

### UAT (post-deploy)
U1–U8 as specified — all PENDING until deploy.

---

## Task B — Mobile Home Button

### Grep results
- `src/components/layout/MobileBottomNav.tsx:7` — `{ to: "/dashboard", label: "Home", Icon: Home }`

### Root cause
The Home tab in `MobileBottomNav` links to `/dashboard`, which is auth-gated. Anonymous mobile/tablet visitors get bounced to `/login` (or the redirect appears as "does nothing" mid-transition). It should point at `/`.

### Fix
One-line change in `src/components/layout/MobileBottomNav.tsx` line 7: `to: "/dashboard"` → `to: "/"`. Add `aria-label="Go to homepage"` on that Link for accessibility. No other icons, styling, or components touched. Tablet uses the same component (`md:hidden` covers <768px, but the request says tablet too — I'll widen the breakpoint to `lg:hidden` so it also appears on 768–1024px). 

**Please confirm** the breakpoint widening — if you'd rather leave `md:hidden` alone and only fix the destination, say so and I'll drop the breakpoint change.

### UAT
U1–U8 as specified — all PENDING until deploy.

---

## Deviations / open questions
1. `AdminLogin.tsx` uses `signInWithPassword` but wasn't in your 6-file list — leave it uncaptcha'd? (Recommend gating it too; trivial addition.)
2. No separate `ForgotPassword.tsx` — reset is a button inside `Login.tsx`, so it shares the same widget/token. OK?
3. Mobile Home: widen breakpoint to also cover tablet (768–1024), or leave `md:hidden` as-is and just fix the URL?

Awaiting confirmation on (1)(2)(3), then I'll produce the full unified diff and stop for approval before deploy.
