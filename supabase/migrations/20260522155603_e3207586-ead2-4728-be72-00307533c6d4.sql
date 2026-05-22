DELETE FROM public.answers a
USING public.answers b
WHERE a.query_id = b.query_id
  AND a.expert_id = b.expert_id
  AND a.answer_type = b.answer_type
  AND a.created_at < b.created_at;

ALTER TABLE public.answers
  ADD CONSTRAINT answers_query_expert_type_unique
  UNIQUE (query_id, expert_id, answer_type);