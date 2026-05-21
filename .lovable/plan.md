## What went wrong

- The deployed Edge Function path is working for the existing Siemens query: it generated rows in `ai_reports` and updated `queries.ai_report`.
- The visible problem is likely not “API key not triggering” anymore. The latest evidence shows Lovable Gateway successfully generated the Siemens report.
- Two real gaps remain:
  - The form only shows a small button spinner during submit, so users do not get a clear full “Generating report” state.
  - Old report data and legacy UI still expose regulatory-risk fields like verdicts, targets, stop loss, support/resistance in several places.
- The Edge Function currently embeds a shortened `SYSTEM_PROMPT` string even though the full versioned `system-prompt.md` exists. That means parts of the pasted compliance prompt are not actually being used by the LLM.
- The Edge Function health check cannot be called without auth because `verify_jwt=true`; this makes debugging harder from the dashboard/tools.

## Implementation plan

1. **Make report submission visibly generate**
   - Update `QueryForm` so submit immediately switches to a clear generation state.
   - Show a disabled full-width button/status panel with stages like “Creating query”, “Generating AI context”, “Preparing report”.
   - Keep the current toast, but add console logging of the real error object for debugging.
   - If report generation fails after the query is created, still navigate to the report page with a pending/error status instead of leaving the user stuck on the form.

2. **Use the real versioned system prompt**
   - Replace the shortened inline prompt in `generate-ai-report/index.ts` with the full content from `system-prompt.md`.
   - Bump `PROMPT_VERSION` to match the file version.
   - Add missing strict prompt rules already present in `system-prompt.md`: source attribution, no factual claims without context, exact schema, and `requires_analyst_review=true`.

3. **Strengthen Edge Function error/debug output**
   - Keep the existing step logs and structured errors.
   - Add `stage`, `query_id`, `provider`, and safe config flags into all failure responses.
   - Make the `GET` health check usable by either documenting it requires auth, or if acceptable, set `verify_jwt=false` and enforce auth only for POST inside the function. I recommend the latter for easier health checks while keeping report generation protected.

4. **Remove live regulatory hazards from the app UI**
   - Remove or neutralize legacy `AIReportCard` usage/path if it is unused.
   - Update landing/query preview components so they no longer display “verdict”, “target”, “support”, “stop loss”, or “AI-powered target / stop-loss” language.
   - Change demo/social proof copy to educational context + analyst follow-up language.
   - Keep portfolio user-defined target/stop-loss tracking separate, but avoid saying AI sets them.

5. **Sanitize existing old reports at display time**
   - On the report route/component, detect legacy report shape (`verdict`, `target1`, `stopLoss`, `supportZone`, `resistanceZone`).
   - If legacy shape is detected, show a “beta/testing report retired” safe message or convert to the new educational-only view without displaying restricted fields.
   - This avoids old rows continuing to leak prohibited outputs.

6. **Validate the full flow**
   - Deploy `generate-ai-report` after edits.
   - Trigger report generation from the preview form.
   - Check network/server/Edge Function logs.
   - Confirm a new `ai_reports` row is created, `queries.status` becomes `ai_answered`, and the report page shows only the new compliance-safe schema.

## Technical notes

- `ai_reports` and `audit_events` already exist, and recent rows confirm inserts are happening.
- `LOVABLE_API_KEY` exists and has successfully generated at least one Siemens report.
- Direct `GEMINI_API_KEY` previously hit quota/rate limit, so Lovable Gateway fallback should remain enabled.
- I will not change database schema unless a fresh failure shows a schema mismatch.
- I will not answer business/legal questions like SEBI-RA partnership status; those are decisions for your team, but the app should treat analyst recommendations as unavailable until that partnership is legally ready.