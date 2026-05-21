# Fix "Report generation failed: Unknown"

Root cause: `GEMINI_API_KEY` likely not set as a Supabase Edge Function secret, and several layers are masking the real error so the UI just says "Unknown". This plan applies 5 targeted code fixes + a setup reminder on the admin page.

## FIX 1 — Migration hint (root cause documentation)
**File:** `supabase/migrations/<timestamp>_add_gemini_api_key_hint.sql` (new)
Comment-only migration telling future devs to set `GEMINI_API_KEY` in Supabase Dashboard → Project Settings → Edge Functions → Secrets. No schema changes.

## FIX 2 — Edge function `callLLM` + `fetchStockData`
**File:** `supabase/functions/generate-ai-report/index.ts`
- Replace `callLLM` entirely:
  - Drop `responseMimeType: "application/json"` from Gemini direct call (it conflicts with the full SYSTEM_PROMPT and often produces empty `parts[]`).
  - Move SYSTEM_PROMPT into proper `systemInstruction.parts[]`.
  - Throw real errors on HTTP failure / empty `parts[0].text` instead of silent fallthrough.
  - Strip ```json fences before `JSON.parse`.
  - Lovable fallback unchanged in behavior but now also strips fences and surfaces real errors.
- In `fetchStockData` Gemini block: remove `responseMimeType: "application/json"`, set `temperature: 0.1`, wrap `JSON.parse(text)` in try/catch returning `null`.
- Redeploy the function.

## FIX 3 — Auth middleware uses `getUser()` not `getClaims()`
**File:** `src/integrations/supabase/auth-middleware.ts` (lines 63–78)
Swap `supabase.auth.getClaims(token)` for `supabase.auth.getUser(token)`, log failures, return `userId: userData.user.id`, `claims: userData.user`. `getClaims` is unreliable on edge and silently rejecting valid tokens — masking auth failures as "Unknown".

## FIX 4 — Surface real server-fn errors over the wire
**File:** `src/lib/report.functions.ts`
- Replace the `throw new Error(...)` block at the end of the handler with one that builds a full message, logs it, attaches `cause = { status, code, stage }`, and throws.
- Replace the non-JSON `catch` fallback with a richer message that includes the first 200 chars of the raw response or HTTP status text.

## FIX 5 — Robust error extraction in QueryForm
**File:** `src/components/query/QueryForm.tsx` (line 177)
Replace `genErr instanceof Error ? genErr.message : "Unknown"` with an `extractMsg` helper that walks plain objects (`.message`, `.data.message`, falls back to JSON snippet). Log the raw object. TanStack Start serializes server errors as plain objects — `instanceof Error` is always false across the boundary, which is why every failure currently says "Unknown".

## Admin observability (new)
**File:** `src/pages/admin/SuperAdmin.tsx`
- Add an amber warning banner at the top of the page:
  > ⚠️ REQUIRED SETUP: Go to Supabase Dashboard → Project Settings → Edge Functions → Secrets and add `GEMINI_API_KEY`. Without this, AI reports cannot generate.
- Add a **"Test AI Report Engine"** button next to it. Clicking calls the edge function's `GET /generate-ai-report` health endpoint (already implemented) via `fetch` with the publishable apikey + user bearer token, and renders the JSON response inline — highlighting `gemini_key_set: true/false`, `lovable_key_set`, and `tables_check`.

## Verification
1. Deploy the edge function.
2. Hit "Test AI Report Engine" on `/admin/super` — confirm `gemini_key_set: true` (after user sets the secret) or see exactly which env var is missing.
3. Submit a real query from `/post-query`. If it still fails, the toast will now show the actual stage + code + message (e.g. `Gemini API HTTP 403: API key not valid (REPORT_GEN_FAILED) [stage: llm]`) instead of "Unknown".

## Notes (not changing)
- `supabase/config.toml`, `report.$queryId.tsx`, system prompt content — untouched.
- The existing `GEMINI_API_KEY` secret IS listed in the project secrets, but the edge function may have a stale deployment or the key may be invalid/quota-zero. The health-check button will tell us which.
