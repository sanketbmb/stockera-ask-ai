## Smart Auth Redirect (Fresh Visitor → Signup, Returning → Login)

### Step 1 — Create helper
New file `src/lib/auth/redirectHelper.ts` with `markHasAccount()`, `hasAccountLocally()`, `getAuthRedirectPath()` (returns `/login` if flag present, else `/signup`).

### Step 2 — Mark account at three success moments
- `src/pages/auth/Signup.tsx` — call `markHasAccount()` after successful `signUp` (before ₹250 toast).
- `src/pages/auth/Login.tsx` — call `markHasAccount()` after successful `signInWithPassword`.
- `src/contexts/AuthContext.tsx` — inside `onAuthStateChange`, call `markHasAccount()` when `event === "SIGNED_IN"` (covers Google OAuth via `/auth/callback`, plus email/password as belt-and-braces).

### Step 3 — Replace gate redirects with smart redirect
Gate/redirect sites (REPLACE):
- `src/components/auth/RequireAuth.tsx:20` — `<Navigate to="/login" />` → smart path.
- `src/routes/report.$queryId.tsx:781` — `<Navigate to="/login" ...>` → smart path (preserve `search.redirect`).
- `src/routes/analysis.$symbol.tsx:154,170` — `navigate({ to: "/login" })` → smart.
- `src/components/analyst/BookSessionModal.tsx:95` — smart.
- `src/components/video-answers/UnlockVideoModal.tsx:85,97` — smart (preserve search).
- `src/components/video-answers/LockedVideoCard.tsx:77` — smart.
- `src/components/library/MasterSearchRecentTab.tsx:140` — smart.
- `src/components/library/MasterSearch.tsx:232,247` — smart.
- `src/components/common/AuthGatedReportLink.tsx:35` — smart (preserve redirect search).
- `src/components/report/DownloadPdfButton.tsx:45,59` — smart.
- `src/components/report/ReportCtaStrip.tsx:103` — smart.
- `src/components/stock-overview/AiReportsTab.tsx:172` — `<Link to="/login">Log in</Link>` → smart (`to={getAuthRedirectPath()}`).
- `src/routes/report.$queryId.tsx:590` — CTA link "Sign in to post your query" → smart.
- `src/pages/Pricing.tsx:343` — plan-select login link → smart.
- `src/components/layout/Navbar.tsx:87,114` — header "Login" buttons → smart (fresh visitors clicking header should also land on signup).

LEAVE ALONE (with reason):
- `src/pages/auth/Signup.tsx:101` — fallback when auto-login fails post-signup; user just created an account, `/login` is correct.
- `src/pages/auth/Signup.tsx:212` — "Log in instead" cross-link (spec exception #3).
- `src/routes/reset-password.tsx:40,47,79` — password-reset back-to-login (spec exception #4).
- `src/routes/auth.callback.tsx:29,45` — OAuth failure → `/login` (Google callback error path; user already attempted auth).
- `src/pages/admin/AdminLogin.tsx:154` — admin portal cross-link to user login.
- `src/routes/r.$queryId.tsx:44,154` — public share page already offers both signup and "I already have an account"; leave as-is (explicit dual CTA).
- `src/routes/login.tsx:4` — route definition, not a redirect.
- `src/routeTree.gen.ts` — generated.

### Step 4 — Bounce logged-in users off auth pages
- `src/pages/auth/Login.tsx` already has this effect (redirects to `nextPath`); confirm/keep.
- `src/pages/auth/Signup.tsx` — add `useEffect` redirecting to `/dashboard` when `user` present (if not already).

### Step 5 — Verify
Run `bunx tsgo --noEmit`. Manually confirm scenarios A/B/C.

### Constraints honored
No credit/DB/OAuth flow changes, no dep additions, flag never cleared on logout, security unchanged (UX hint only).
