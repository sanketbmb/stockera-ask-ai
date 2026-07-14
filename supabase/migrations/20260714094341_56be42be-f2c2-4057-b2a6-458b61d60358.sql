-- Replace partial unique index with a full unique index so PostgREST upserts
-- with ON CONFLICT (query_id, expert_id, answer_type) can infer an arbiter.
-- Nulls remain distinct in btree, so general-video rows (query_id IS NULL) are unaffected.
DROP INDEX IF EXISTS public.answers_unique_query_answer;
CREATE UNIQUE INDEX answers_unique_query_answer
  ON public.answers (query_id, expert_id, answer_type);