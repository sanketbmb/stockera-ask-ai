## Goal

Preserve the user's intended destination (e.g. `/post-query?intent=fresh_entry`) across the signup/login redirect, and clean up the signup toast now that the ₹250 welcome bonus is granted by a DB trigger.

## Changes

### 1. `src/lib/auth/redirectHelper.ts` — add intent helpers

Add two functions alongside the existing ones:

- `saveIntendedDestination(path: string)` — writes to `sessionStorage` under key `asktheexpert_intended_destination`. Only accepts internal paths: must start with `/` and must not start with `//` (open-redirect guard). Wrapped in try/catch.
- `consumeIntendedDestination(): string | null` — reads the key, removes it, and returns it only if it still passes the same internal-path guard; otherwise returns `null`.

Existing `markHasAccount` / `hasAccountLocally` / `getAuthRedirectPath` untouched.

### 2. Call `saveIntendedDestination` at every smart-redirect site

Every call site of `getAuthRedirectPath()` needs to save `window.location.pathname + window.location.search` (SSR-guarded) immediately before it navigates.

Files touched:

- `src/components/auth/RequireAuth.tsx` — compute + save in `RequireAuth` before returning `<Navigate to={getAuthRedirectPath()} …/>`.
- `src/components/layout/Navbar.tsx`
- `src/components/analyst/BookSessionModal.tsx`
- `src/components/video-answers/UnlockVideoModal.tsx`
- `src/components/video-answers/LockedVideoCard.tsx`
- `src/components/library/MasterSearch.tsx`
- `src/components/library/MasterSearchRecentTab.tsx`
- `src/components/common/AuthGatedReportLink.tsx`
- `src/components/report/DownloadPdfButton.tsx`
- `src/components/report/ReportCtaStrip.tsx`
- `src/components/stock-overview/AiReportsTab.tsx`
- `src/routes/report.$queryId.tsx`
- `src/routes/analysis.$symbol.tsx`
- `src/pages/Pricing.tsx`

Pattern per site (wrap in `typeof window !== "undefined"`):

```
saveIntendedDestination(window.location.pathname + window.location.search);
navigate({ to: getAuthRedirectPath() });
```

### 3. `src/pages/auth/Signup.tsx`

- After successful signup + auto-login, replace `navigate({ to: "/dashboard" })` with:
  ```
  const intended = consumeIntendedDestination();
  navigate({ to: intended ?? "/dashboard" } as never);
  ```
- Change the success toast text from `"Welcome to Stockera! ₹250 credits added 🎉"` to `"Account created — welcome to Stockera 🎉"`. (No `wallet_ledger` insert or `grant_welcome_bonus` RPC exists in this file — nothing else to remove. WelcomeModal, EmailVerifyBanner, and the "Get ₹250 Free" button label stay as-is per constraints.)

### 4. `src/pages/auth/Login.tsx`

After successful login, before `navigate(...)`, read `consumeIntendedDestination()` and prefer it over the existing default destination.

### 5. `src/routes/auth.callback.tsx` (the Google OAuth callback — spec refers to it as `AuthCallback.tsx`)

Inside the effect, after session is confirmed and `markHasAccount()` is called, prefer `consumeIntendedDestination()` over the current `dest` derived from `sanitizeNext(next)`. Both the polling path and the `onAuthStateChange` path use the same resolved destination. Also add the missing `markHasAccount()` call if it isn't already there (currently it is only called in Login/Signup/AuthContext — safe to add here too per spec step 5).

### 6. Verification

Run `bunx tsgo --noEmit` — must be 0 errors.

## Report format at the end

- (A) Files modified with line ranges
- (B) Diff of Signup.tsx changes (highlighting the toast text change and confirming no credit-grant code existed to remove)
- (C) TS check output
- (D) Verdict

## Constraints honored

- No new npm deps.
- No DB / edge function / RLS changes.
- WelcomeModal, EmailVerifyBanner untouched.
- `sessionStorage` (not `localStorage`) for intent.
- Open-redirect guard: path must start with `/` and not with `//`, both on write and on read.  
  
additional : Keep the existing signup toast text `"Welcome to Stockera! ₹250 credits added 🎉"` — the DB trigger does grant ₹250, so the message remains accurate. Skip step 3's toast rewording; only do the `consumeIntendedDestination()` navigation change in Signup.tsx.