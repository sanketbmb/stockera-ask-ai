# Plan — Admin/Analyst panel fixes

## 1. Pending queue shows yesterday's answered queries

**Cause.** Both the Analyst Dashboard queue and Super Admin "Pending" filter only look at `queries.status`. When an analyst publishes a video-only answer (or any path that skipped the status flip), `status` never moves off `pending`/`ai_answered`, so it stays in the pending queue forever.

**Fix.**
- In Analyst Dashboard query (`src/pages/admin/AdminDashboard.tsx`) and Super Admin list (`src/lib/admin.functions.ts → getAllQueriesForAdmin`), exclude any query that already has a published answer (`answers.is_published = true`) — single source of truth.
- Also defensively flip `queries.status → 'expert_answered'` in every answer-publish path (text modal, panel, video upload already does it; audit all 3).
- "Pending" stat in Super Admin uses the same "no published answer" join.

## 2. Analyst can't see what they answered

**Fix.** Add an "Answered" tab on the Analyst Dashboard (`AdminDashboard.tsx`) next to "Pending Queue":
- Query `answers` where `expert_id = me` joined to `queries` + asker's `profiles` (full_name, avatar_url).
- Each row: stock + query text, verdict badge, body/video preview, asker's name + avatar (no email/PII), answered date.
- Reuses existing `QueryQueueCard` styling.

## 3. Approve pending analyst SEBI profiles

The approval UI already exists in `SuperAdmin.tsx` under the **"Analysts"** tab (`PendingAnalystCard`), but it's easy to miss and there's no badge.

**Fix.**
- Add a red badge on the "Analysts" tab showing pending count (mirrors what `pendingCount` already does for the sidebar).
- Add a top-level "Pending Approvals" card on the Overview tab linking straight to the Analysts tab.
- When an analyst profile isn't approved, the public profile page already 404s — keep that, but make the toast message clearer: "This analyst is awaiting SEBI verification."
- Confirm `approveAnalyst` flips `is_approved=true` AND inserts `user_roles(analyst)` (it does) — no schema change needed.

## 4. Manually assign queries from Super Admin

`assignQueryToAnalyst` server fn + `getApprovedAvailableAnalysts` already exist. UI wiring is missing.

**Fix.** In Super Admin "Queries" tab row actions, add an "Assign" dropdown listing approved analysts (display_name + SEBI number). On select → call `assignQueryToAnalyst`, invalidate queries. Persists in DB (already does), so it survives reloads.

## 5. Super Admin overview metrics blank

`getAdminOverviewStats` returns `users / pendingApplications / queriesToday / pendingQueries`. The Overview tab renders them but they show 0 because the `pendingQueries` query filters `assigned_analyst_id IS NULL` — so once any analyst is assigned, "pending" drops to 0 even though work remains.

**Fix.** Change `pendingQueries` to: queries with no published answer (regardless of assignment). Add a 5th card "Unassigned" for the `assigned_analyst_id IS NULL` count. Now metrics actually move.

Analyst Dashboard "Pending" already correctly scopes to `assigned_analyst_id = me` — leave as is.

## 6. Rishabh can log into BOTH analyst + super-admin panels

**Cause.** `user_roles` allows multiple roles per user. The `bootstrap-admin` edge function (or a manual grant) gave `rishabh@stockera.com` the `admin` role in addition to `analyst`. `RequireAdmin` only checks `isAdmin`, so any user with the admin role passes — exactly as designed.

**Fix (operational, not code).**
- Remove the `admin` role row for Rishabh's user_id from `user_roles` (one-line SQL via migration helper, run once).
- Keep `ADMIN_EMAIL` secret pointing at the real company-head email so future bootstraps don't re-grant Rishabh.
- Document in code comment in `bootstrap-admin/index.ts` that ADMIN_EMAIL must be a non-analyst email.

I'll surface this in the implementation as a one-shot SQL run + a note for the user to update `ADMIN_EMAIL`.

---

## Technical summary

Files to touch:
- `src/lib/admin.functions.ts` — fix `pendingQueries`; change `getAllQueriesForAdmin` to LEFT JOIN published answers and expose `has_published_answer`; keep existing assign fn.
- `src/pages/admin/AdminDashboard.tsx` — exclude answered queries from queue; add "Answered" tab with asker name+avatar.
- `src/pages/admin/SuperAdmin.tsx` — Overview "Unassigned" card + clearer Pending metric; Analysts-tab badge; Queries-tab Assign dropdown using existing fns.
- `src/pages/AnalystPublicProfile.tsx` — friendlier "awaiting verification" message.
- One DB cleanup: `DELETE FROM user_roles WHERE user_id = <rishabh> AND role = 'admin'` (via migration).

No schema changes required — every needed column/policy already exists.
