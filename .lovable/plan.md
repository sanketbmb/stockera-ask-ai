## 1. Fix missing analyst identity on expert answers

**Problem:** `ExpertAnswerSection` resolves the analyst from `query.assigned_analyst_id`, which is often null, so the card shows the generic "SEBI Analyst" fallback.

**Fix:** In `ExpertAnswerSection.tsx`, after loading answers, look up the analyst from the answer's `expert_id` if `assignedAnalystId` is null. Use `expert_id` of the published text answer (fallback to video answer). Render:
- Avatar + display_name
- SEBI type + reg number (mono, with shield icon)
- Years of experience + rating + specializations chips
- Wrap the avatar + name block in a `<Link to="/analyst/$analystId">` so clicking opens the public profile.

Do the same on `QueryHistoryCard` (link "Expert text answer" header to the analyst page).

## 2. Public Analyst Profile + 1:1 booking page

New route: `src/routes/analyst.$analystId.tsx` → page `src/pages/AnalystPublicProfile.tsx`.

Sections (top to bottom):
- **Hero**: gradient hero (primary → accent), large avatar with availability dot, name, SEBI badge (type + reg number, mono), specializations as pills, years experience, ⭐ rating · sessions count. Animated counters (framer-motion) for sessions and years.
- **About**: bio, languages (flag chips).
- **Two primary CTAs side-by-side**:
  - "Ask a follow-up question" → routes to `/post-query?analyst={id}` (PostQuery picks up `analyst` search param and pre-assigns).
  - "Book a 1:1 private session" → opens booking modal (see §3).
- **Why book a 1:1** value-prop strip: 3 cards (Live screen-share chart walkthrough · Personalised portfolio review · Direct WhatsApp follow-up for 7 days). Subtle motion: stagger fade-up on scroll.
- **Recent public answers** (last 3 published text answers by this analyst, masked to stock name + verdict + first 120 chars) → social proof.
- **Trust strip**: SEBI compliance badge, grievance link, refund policy line.
- Sticky bottom bar on mobile with both CTAs.

Visual language: reuse existing tokens (`primary`, `accent`, `gold`, `bg-gradient-brand`, `shadow-card`). Add framer-motion `Reveal`/stagger from existing `motion-helpers`. No new color tokens.

## 3. 1:1 booking modal + payment hookup

New component `src/components/analyst/BookSessionModal.tsx`:
- Step 1: pick session length (15min ₹499 · 30min ₹999 · 60min ₹1799 — tiers stored in `src/lib/session-tiers.ts`).
- Step 2: pick slot (next 7 days × 3 time windows; static for now, persisted as a `session_bookings` row).
- Step 3: Razorpay checkout via existing `src/lib/razorpay.ts` and `payments.functions.ts` pattern (reuse `BookAnalystVideoButton` flow as reference).

New table `session_bookings` (id, user_id, analyst_id, tier, amount_paise, scheduled_for timestamptz, status, payment_id, meeting_link nullable, created_at) with RLS: user sees their own, analyst sees bookings assigned to them, admin sees all. Migration in a single `supabase--migration` call; do NOT code until migration approved.

## 4. Share button on reports & answers + public report page

- New route `src/routes/r.$queryId.tsx` (short `r` for shareable). Public, no `RequireAuth`. Fetches the query + first published text answer via a new server fn `getPublicReport` that returns only: stock_name, stock_symbol, verdict, first 200 chars of body (truncated with "…"), analyst display_name + SEBI number, created_at. Everything else is hidden behind a blur overlay with a sign-in CTA.
- Add a `ShareButton` component (`src/components/common/ShareButton.tsx`) using Web Share API with clipboard fallback, URL = `${origin}/r/{queryId}`. Place it:
  - On `ExpertAnswerSection` header (next to timestamp)
  - On `AIReportCardV2` header
  - On `QueryHistoryCard` action row
- Public report page CTA card below the blurred answer:
  - Headline: **"Don't gamble your portfolio. Get a SEBI-verified second opinion in 24h."**
  - Sub: "AI report instantly + a real registered analyst's voice — for less than a single bad trade costs you."
  - Buttons: "Sign up free (₹100 wallet credit)" → `/signup?ref={queryId}`, "Login" → `/login`.
  - Tiny line: "Already 2,400+ traders saved from FOMO trades this month." (static social proof string for now)

## 5. Referral hook in the share flow

- `ShareButton` appends `?ref={user.referral_code}` when a logged-in user shares.
- Public report page reads `ref` from search params and:
  - Stores it in localStorage as `pending_referral` (TTL 7 days).
  - Shows a yellow ribbon: "🎁 Your friend invited you — sign up and you both get ₹50 instantly."
- `Signup.tsx` already accepts a referral code via metadata; pre-fill it from `pending_referral` if URL `ref` is missing.
- No new tables — uses existing `referrals` + `handle_new_user` trigger which already credits ₹50 each side.

## 6. SEO / share metadata

`src/routes/r.$queryId.tsx` head():
- title: `"{stock_name} — Expert verdict: {VERDICT} | Stockera"`
- description: first 140 chars of answer body
- og:title / og:description mirrored
- og:image: omit for now (no per-report image yet)

## Out of scope (explicit)

- Real calendar integration for slot booking (Google Calendar/Cal.com). Slots are static for v1.
- Video conferencing link generation — meeting_link stays null until admin sets it manually post-payment.
- Analyst-side dashboard to manage bookings (admin can view via Supabase for v1).

## Technical notes

- All new server functions follow `createServerFn` + `requireSupabaseAuth` (except `getPublicReport` which is unauthenticated).
- Migration must run BEFORE writing booking code (Supabase types regeneration dependency).
- Reuse `Reveal` from `src/components/landing/motion-helpers.tsx` for entrance animations; no new motion lib.
- No design tokens added; everything via existing semantic classes.
