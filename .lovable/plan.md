# Fix: AI Report Generation Failing + Restore Current Price Input

## Root cause

Two distinct issues, both real:

1. **Edge function was not deployed.** The `generate-ai-report` function had zero invocation logs even though the UI was calling it — meaning the latest version had never been pushed to the Supabase runtime. I just re-deployed it as part of diagnosis, and it is now live.
2. **"Current price" field was removed from Step 2.** The form no longer asks for it, so `queries.current_price` is always `null`. The edge function then has to rely on Twelve Data alone for LTP — and for many NSE symbols (especially `IDFCFIRSTB`), Twelve Data returns empty, leaving `ltp = null` and `pnl_state = "n/a"`. The LLM gets a context object with no price + no P&L, which produces a low-quality / sometimes guardrail-rejected report.

So the "Report generation failed: Unknown" toast you saw was caused by #1 (call returning a 5xx with no `details` field). #2 is what's making future reports unreliable even after #1 is fixed.

## What I'll change

### 1. Restore the "Current Price" input on Step 2 (UI)
In `src/components/query/QueryForm.tsx`:
- Add a `currentPrice` state.
- In Step 2, render it next to **Buy Price** when intent is `stuck_position` or `should_average` (the two cases where P&L matters). Same `₹` prefix, same `h-10` height, in the same `grid sm:grid-cols-2` so alignment stays pixel-perfect.
- Pass `current_price: currentPrice ? Number(currentPrice) : null` into the `queries` insert in `handleSubmit`.
- Show it on the Step 3 Review summary.
- Keep it optional — if the user fills it, we trust it as the LTP; if blank, we fall back to Twelve Data, then Gemini estimate.

### 2. Harden the edge function (`supabase/functions/generate-ai-report/index.ts`)
- **LTP fallback chain:** user-supplied `current_price` → Twelve Data → Gemini estimate (one tiny call asking for a realistic current INR price). Today there's no Gemini fallback, so missing Twelve Data data = no LTP.
- **Better error envelope:** always return JSON with a human-readable `details` so the UI never shows "Unknown" again. Add a `stage` field (`fetch_query`, `fetch_ltp`, `llm`, `guardrail`, `save`) so we can pinpoint failures.
- **Increase Gemini `maxOutputTokens` to 8192** (currently 2500) and log `finishReason` to catch token-cutoff truncation that produces invalid JSON.
- **Relax guardrail when LTP missing:** if `ltp = null`, allow the report to still save with `data_confidence.overall_label = "Insufficient data — please wait for analyst"` instead of throwing.

### 3. Re-deploy
Deploy `generate-ai-report` after the edits so the runtime picks them up. (I already deployed the current version during diagnosis; the new version needs another deploy.)

## What I will NOT change

- The compliance system prompt (no verdicts / no targets / no stop-loss) stays exactly as you specified.
- Referral, wallet, auth — untouched.
- Step 2 buy-price/holding alignment I fixed earlier — preserved.

## Verification before handing back

1. Deploy function → tail logs.
2. Submit a fresh IDFC First Bank query (buy ₹85, current ₹68.30, "Sell or Hold") from the preview.
3. Confirm: query row created → edge function 200 → `ai_reports` row written → navigation to `/report/:id` → report renders with `pnl_state = "loss"` and a meaningful behavioral note.
4. Submit one more with **blank** current price to confirm the Twelve Data + Gemini fallback chain works and no "Unknown" toast appears.

Ready to implement on approval.
