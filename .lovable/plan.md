## Plan to fix the report-generation failure

### What I found
- The current Edge Function already has a broad `try/catch`, but it returns `{ ok: false, error, details }`, while the frontend/server wrapper can still collapse failures into a generic message.
- There are no recent `generate-ai-report` invocation logs visible, which suggests the failure may be happening before or during the server-function-to-edge-function call, or the deployed function is not logging enough.
- `queries` rows are getting `ai_report` JSON, but `ai_reports` table is empty, and the Edge Function currently only logs `ai_reports insert err` without failing. That hides a likely database insert/schema/RLS issue.

### Changes I will make

1. **Make `generate-ai-report` fully debuggable**
   - Add a reusable response helper so every response includes:
     - `Access-Control-Allow-Origin: *`
     - `Access-Control-Allow-Methods: GET, POST, OPTIONS`
     - `Access-Control-Allow-Headers: Content-Type, Authorization, apikey, x-client-info`
     - `Content-Type: application/json`
   - Handle `OPTIONS` at the very top.
   - Add a `GET` health-check endpoint returning:
     - environment key presence checks
     - `ai_reports` table existence
     - `audit_events` table existence

2. **Add step-by-step logs in the Edge Function**
   - Log each major phase:
     - function invoked
     - env vars checked
     - query fetched
     - stock/LTP resolved
     - LLM call started
     - LLM response received
     - guardrail/schema validation
     - `ai_reports` insert
     - `queries` update
     - audit log
     - response returned
   - Include safe debug context like `query_id`, `stock_symbol`, `intent`, `provider`, `response_length`, and Supabase error codes/messages.

3. **Return structured errors instead of “Unknown”**
   - Replace the catch response with the requested shape:
     - `error: true`
     - `ok: false`
     - `code`
     - `message`
     - `hint`
     - `stage`
   - Log `REPORT_GEN_ERROR` with message, stack, timestamp, and failing stage.

4. **Stop hiding the likely DB insert failure**
   - Change the `ai_reports` insert from “log and continue” to a real failure if Supabase returns an insert error.
   - This will tell us exactly if the empty `ai_reports` table is the root cause.

5. **Improve frontend/server error display**
   - Update `src/lib/report.functions.ts` to parse the Edge Function response body consistently and throw the real `message`, `details`, or `code`.
   - Update `QueryForm.tsx` toast/error logging so the user sees the actual failure reason, not `Unknown`.

6. **Timeout/deployment config**
   - Add the function timeout setting to `supabase/config.toml` if supported by this project’s Supabase config format.
   - Keep `verify_jwt = true` for security.

7. **Redeploy and verify**
   - Redeploy `generate-ai-report`.
   - Call the new `GET` health check.
   - Trigger/report-test against a recent query if auth is available.
   - Check Edge Function logs for the exact failing `STEP` and fix the root cause from that result.