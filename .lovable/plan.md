## Goal
Add a cool, stock-market-themed animated payment modal that takes the user to Razorpay Checkout to pay ₹100 for an analyst-recorded live selfie video answer. The modal becomes the single entry point everywhere a "Video Answer" CTA exists.

## What gets built

### 1. Animated `VideoAnswerPaymentModal` (frontend, reusable)
File: `src/components/payment/VideoAnswerPaymentModal.tsx`

Visual treatment (pure CSS + Framer Motion, no video file):
- Dark gradient hero panel with animated candlestick chart background (SVG green/red candles that "tick" in)
- Scrolling NSE-style ticker strip at the top
- Center: stylized "analyst uncle" avatar (CSS illustration — chai cup, glasses, calm smile, slight breathing scale animation, hand-wave loop)
- Speech bubble cycling through lines: "Namaste 🙏", "Let's review your position", "Live selfie answer in <24h"
- Glowing ₹100 price chip with shimmer
- Big gradient CTA: **"Pay ₹100 & Book Analyst Video"** with pulse + arrow micro-animation
- Trust row: SEBI badge, Razorpay logo, lock icon, "Refund if unanswered in 24h"
- Confetti + green tick on success state

### 2. Razorpay Checkout integration
Frontend:
- `src/lib/razorpay.ts` — loads the Razorpay JS SDK on demand (`https://checkout.razorpay.com/v1/checkout.js`)
- Modal calls `createVideoOrder` server fn → opens Razorpay with returned `order_id` → on success calls `verifyVideoPayment`

Server functions: `src/lib/payments.functions.ts`
- `createVideoOrder({ queryId })` — uses `requireSupabaseAuth`, calls Razorpay Orders API with `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`, returns `{ orderId, amount, keyId }`. Inserts a `payments` row with status `created`.
- `verifyVideoPayment({ orderId, paymentId, signature, queryId })` — HMAC-SHA256 verify, mark `payments.status='paid'`, mark `queries.video_requested=true` + `video_payment_id`, insert `wallet_transactions` (record only, no balance change), notify analyst.

Server route (webhook): `src/routes/api/public/razorpay-webhook.ts`
- Verifies `x-razorpay-signature` against `RAZORPAY_WEBHOOK_SECRET`
- Handles `payment.captured` / `payment.failed` as the source of truth (idempotent on `payment_id`)

### 3. Database changes (migration)
- New table `public.payments` (provider, order_id unique, payment_id, amount_paise, currency, status, user_id, query_id, purpose='video_answer', signature, raw jsonb) with RLS: user sees their own, admin sees all, only service role writes.
- Add columns to `public.queries`: `video_requested boolean default false`, `video_payment_id uuid references payments(id)`.

### 4. Secrets to add
- `RAZORPAY_KEY_ID` (public/publishable — also exposed as `VITE_RAZORPAY_KEY_ID`)
- `RAZORPAY_KEY_SECRET` (server only)
- `RAZORPAY_WEBHOOK_SECRET` (server only)

You'll be prompted to paste these after the plan is approved.

### 5. Wiring (every "Video Answer" CTA)
Replace the existing buttons with `<BookAnalystVideoButton queryId={...} />` that opens the modal:
- `src/components/report/AIReportCard.tsx` — "Book Video Answer" button
- `src/components/report/AIReportCardV2.tsx` — same
- `src/pages/MyQueries.tsx` — "Request Video Answer" rows
- `src/pages/Wallet.tsx` — "Video Answer ₹149" pack tile (price corrected to ₹100, opens modal generically)
- `src/components/landing/AIReportPreview.tsx` — demo CTA opens a non-paying preview of the modal

### 6. Post-payment flow
- Toast + confetti, modal switches to "Booked!" state with ETA timer (24h)
- Notification row inserted for the user; admin dashboard sees a new pending video request
- Existing analyst upload flow (`/admin/upload-answer/$queryId`) already handles delivery — no change needed there

## Technical details
- Razorpay base currency: INR, amount sent in paise (10000 = ₹100)
- HMAC verification: `crypto.createHmac('sha256', secret).update(orderId + '|' + paymentId).digest('hex')` compared with `timingSafeEqual`
- Modal uses `framer-motion` (already in project) for entrance/exit + candle stagger; ticker uses CSS keyframes
- All colors via existing semantic tokens in `src/styles.css` — no hardcoded hex except brand-required Razorpay blue badge
- Sandbox-compatible: pure HTTP + node `crypto`, no native deps

## Out of scope
- Refund automation (manual via Razorpay dashboard for now)
- Multiple price tiers (single ₹100 SKU)
- Wallet-based payment alternative (kept separate; this flow is Razorpay-only as requested)
