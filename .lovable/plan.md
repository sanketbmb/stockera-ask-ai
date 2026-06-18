## Frontend API Key Audit — Result: CLEAN

Searched `src/**` for: `sk-…`, `AIza…`, `tda_…`, `dh_…`, raw 40+ char hex.

**Real findings: none.**

**False positives (all from the literal string `risk-disclosure` matching the `sk-` pattern as `sk-disclosure…`):**
- `src/routeTree.gen.ts` lines 19, 89, 90, 271, 313, 356, 400, 442, 484, 606–609 (auto-generated)
- `src/routes/risk-disclosure.tsx` lines 6, 18 (route definition + canonical href)
- `src/components/layout/SiteFooter.tsx` line 19 (footer nav link)

No Anthropic, Google/Gemini, Twelve Data, or Dhan keys are embedded in frontend code. All provider credentials remain in Supabase secrets (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `TWELVE_DATA_API_KEY`, `DHAN_ACCESS_TOKEN`, `DHAN_CLIENT_ID`).

**No plan to implement.** No remediation required. Awaiting next instruction.
