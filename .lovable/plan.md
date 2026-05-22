## Plan: Razorpay TEST mode integration

You'll only need to add **2 secrets** later (free, 2 min at razorpay.com → Settings → API Keys → Generate Test Key):
- `RAZORPAY_KEY_ID` (starts with `rzp_test_...`)
- `RAZORPAY_KEY_SECRET`

Webhook secret is **optional** — we'll skip it for now. Frontend HMAC verification of the checkout response is enough to mark payment as paid.

I'll build everything else now so the moment you paste those two keys, it works end-to-end with Razorpay's test cards (e.g. `4111 1111 1111 1111`).

## What I'll build

### 1. DB ✅ already done
`payments` table + `queries.video_requested` / `video_payment_id` columns are live.

### 2. Server functions — `src/lib/payments.functions.ts`
- `createVideoOrder({ queryId })` — auth-guarded. Calls Razorpay Orders API with key id + secret (Basic auth). Inserts a `payments` row (status=`created`). Returns `{ orderId, amount, keyId }`.
- `verifyVideoPayment({ orderId, paymentId, signature, queryId })` — auth-guarded. HMAC-SHA256 verify with `KEY_SECRET`, update `payments` to `paid`, set `queries.video_requested=true`, insert notification + record-only wallet_transactions row.
- Both gracefully error with a clear "Razorpay not configured" message if keys are missing — UI shows a friendly toast.

### 3. Razorpay SDK loader — `src/lib/razorpay.ts`
Lazily injects `https://checkout.razorpay.com/v1/checkout.js`, returns a promise resolving to `window.Razorpay`.

### 4. Cool animated payment modal — `src/components/payment/VideoAnswerPaymentModal.tsx`
Single reusable modal. Framer Motion + pure CSS/SVG, no video file:
- Dark gradient hero with animated candlestick chart background (staggered green/red SVG candles ticking in)
- Scrolling NSE-style ticker strip
- Stylized "analyst uncle" SVG avatar: chai cup, glasses, calm smile, breathing scale loop, subtle hand wave
- Speech bubble cycling: "Namaste 🙏" → "Let's review your position" → "Live selfie answer in <24h"
- Glowing ₹100 price chip with shimmer
- Big gradient CTA **"Pay ₹100 & Book Analyst Video"** with pulse + arrow glide
- Trust row: SEBI badge · Razorpay logo · lock icon · "Refund if unanswered in 24h"
- States: `idle → creating-order → checkout-open → verifying → success` (confetti + green tick + ETA 24h) / `error`

### 5. Reusable trigger — `src/components/payment/BookAnalystVideoButton.tsx`
Drop-in button that opens the modal. Wired into:
- `src/components/report/AIReportCard.tsx` — replaces existing "Book Video Answer"
- `src/components/report/AIReportCardV2.tsx` — same
- `src/pages/MyQueries.tsx` — request-video rows
- `src/pages/Wallet.tsx` — Video Answer pack tile (price corrected to ₹100)
- `src/components/landing/AIReportPreview.tsx` — demo preview opens modal in read-only mode

### 6. Post-payment side effects
- Notification inserted (`type: 'video_booked'`, link to `/my-queries`)
- Admin sees the request in existing admin dashboard (it already lists queries; we just filter by `video_requested=true`)
- No webhook needed in test mode — verification happens in the success server fn

## What you do later
1. Sign up at razorpay.com (free, no KYC for test mode)
2. Dashboard → Account & Settings → API Keys → Generate Test Key
3. Paste `KEY_ID` and `KEY_SECRET` when I prompt you (one secrets dialog)
4. Test with card `4111 1111 1111 1111`, any future expiry, any CVV

## Out of scope
- Webhook handler (not needed for test; add later for production)
- Live mode KYC
- Refund automation
