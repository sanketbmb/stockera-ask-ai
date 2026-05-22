## Root cause

`AnalystAnswerPanel` upserts answers with `onConflict: "query_id,expert_id,answer_type"`, but the `answers` table has no unique constraint matching those columns. Postgres rejects the request with "no unique or exclusion constraint matching the ON CONFLICT specification", so the analyst can never publish — which is why nothing reaches the user's `/my-queries` or `/report/$queryId`.

## Fix plan

### 1. Migration — add the missing unique constraint

```sql
-- Deduplicate any accidental duplicates first (keep newest)
DELETE FROM public.answers a
USING public.answers b
WHERE a.query_id = b.query_id
  AND a.expert_id = b.expert_id
  AND a.answer_type = b.answer_type
  AND a.created_at < b.created_at;

ALTER TABLE public.answers
  ADD CONSTRAINT answers_query_expert_type_unique
  UNIQUE (query_id, expert_id, answer_type);
```

This unblocks the existing upsert (no app code change needed for the publish flow itself).

### 2. Surface the verdict in `/my-queries` (QueryHistoryCard)

Currently the card shows the text body but not the verdict pill. Add:
- A verdict badge (colored, using `VERDICT_MAP` from `src/lib/verdict.ts`) at the top of the "Expert text answer" block.
- Render `key_level`, `time_horizon`, `risk_note` as small chips below the body when present.

So the user sees the analyst's call (BUY / HOLD / MONITOR / etc.) the moment they open `/my-queries`, not just inside `/report/$queryId`.

### 3. Verify the user-side reflection path

`ExpertAnswerSection` on `/report/$queryId` already polls every 30s and renders verdict, body, key level, horizon, risk note. After fix #1 the row will actually exist, so this will light up automatically. No changes needed there.

The existing `notify_expert_answer` trigger already fires a notification when `is_published` flips to true → user gets a bell notification linking to `/my-queries`.

## Files

- New migration: add unique constraint on `answers(query_id, expert_id, answer_type)` + dedupe.
- `src/components/query/QueryHistoryCard.tsx` — add verdict badge + metadata chips inside the existing expert-answer block.

## Preservation

No changes to: AI report code, edge functions, auth flow, `AnalystAnswerPanel.tsx` logic, `ExpertAnswerSection.tsx`, or any admin route.

Reply **apply** to proceed.