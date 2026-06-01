## Fix: Rebind TanStack server code to `SB_SERVICE_ROLE_KEY`

### Root cause
The Lovable Cloud / TanStack server runtime cannot expose secrets whose names start with `SUPABASE_` to user code, so `process.env.SUPABASE_SERVICE_ROLE_KEY` is `undefined`. The key has been re-added as `SB_SERVICE_ROLE_KEY`. Supabase Edge Functions (Deno) still get `SUPABASE_SERVICE_ROLE_KEY` auto-injected and must NOT be changed.

### Scope (TanStack server files only)
Update these 5 files to read `SB_SERVICE_ROLE_KEY` first and fall back to `SUPABASE_SERVICE_ROLE_KEY` (so nothing breaks if the legacy var is ever restored):

1. `src/integrations/supabase/client.server.ts` — admin client init (root cause of the report-route 500). Change the env read + the missing-var error message.
2. `src/lib/freeze-report.functions.ts` (line 33) — server fn used by `/report/:queryId` to freeze/read the tier-shaped report.
3. `src/lib/pdf.functions.ts` (lines 49, 60, 108) — PDF token signing + admin reads. Update all three reads + the error message.
4. `src/lib/corporate-actions.functions.ts` (line 69).
5. `src/server.ts` (line 60) — env presence check / startup log list.

### Pattern applied everywhere
```ts
const serviceKey =
  process.env.SB_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
```
Update any "Missing SUPABASE_SERVICE_ROLE_KEY" error string to mention `SB_SERVICE_ROLE_KEY` so future debugging points at the right secret.

### Explicitly NOT touched
- All `supabase/functions/**/*.ts` Edge Functions — they run on Supabase's Deno runtime where `SUPABASE_SERVICE_ROLE_KEY` is the auto-injected name. Changing them would break the orchestrator.
- Brain logic, orchestrator formulas, Phase 2 / 2.1 UI, query form, verdict badges, feature flags.

### Verification
1. Reload `/report/<existing v1 queryId>` — `TierShapedReportContent` should fetch without the "Missing environment variable" error.
2. Submit a fresh query from `/post-query`, confirm redirect to `/report/:queryId` renders the tier-shaped report.
3. Click "Download PDF" — confirms `pdf.functions.ts` reads the key correctly.
4. Confirm no regression in legacy report path or Phase 2 addenda.

### Out of scope / blockers
None. No schema, no Brain, no UI changes.